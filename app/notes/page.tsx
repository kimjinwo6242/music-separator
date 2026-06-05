'use client'

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { fileStore } from '@/app/lib/fileStore'
import { analyzePitch, NoteFrame } from '@/app/lib/pitchDetection'

const ROW_H    = 10
const X_AXIS_H = 20
const Y_AXIS_W = 48
const PAD      = 3  // 최저/최고음 위아래 여백 (semitone)

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
// 자연음 반음 인덱스 (C D E F G A B)
const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11])
// 흰건반 순서 인덱스 (0=C … 6=B) — 옥타브 내 균등 배치에 사용
const WHITE_KEY_IDX: Readonly<Record<number, number>> = { 0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6 }
const WHITE_KEY_H = (12 * ROW_H) / 7   // 흰건반 1개 높이 (px)

// 화면에 보이는 시간 구간을 기준으로 ~6개 레이블이 보이도록 "nice" 간격 선택
function getTimeInterval(visibleDur: number): number {
  const raw = visibleDur / 6
  const nice = [0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600]
  return nice.find(n => n >= raw) ?? 600
}

function detectMidiRange(frames: NoteFrame[]): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (const f of frames) {
    if (f.midi) { lo = Math.min(lo, f.midi); hi = Math.max(hi, f.midi) }
  }
  if (!isFinite(lo)) return [36, 84]
  return [Math.max(0, lo - PAD), Math.min(127, hi + PAD)]
}

function drawPianoRoll(canvas: HTMLCanvasElement, frames: NoteFrame[], midiMin: number, midiMax: number) {
  const H    = (midiMax - midiMin) * ROW_H
  const W    = Math.min(frames.length, 3000)
  const step = frames.length / W

  canvas.width  = W
  canvas.height = H

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  // C 음표 위치마다 가로 점선
  for (let midi = Math.ceil(midiMin / 12) * 12; midi <= midiMax; midi += 12) {
    const y = H - (midi - midiMin) * ROW_H
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }
  ctx.setLineDash([])

  ctx.fillStyle = '#1a1a1a'
  for (let col = 0; col < W; col++) {
    const frame = frames[Math.floor(col * step)]
    if (!frame.midi || !frame.note) continue
    const midi = frame.midi
    if (midi < midiMin || midi > midiMax) continue
    const y = H - (midi - midiMin + 1) * ROW_H
    ctx.fillRect(col, y, 1, ROW_H)
  }
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function NotesPage() {
  const router = useRouter()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fileName, setFileName]       = useState('')
  const [progress, setProgress]       = useState(0)
  const [done, setDone]               = useState(false)
  const [error, setError]             = useState('')
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [midiMin, setMidiMin]         = useState(36)
  const [midiMax, setMidiMax]         = useState(84)

  const framesRef = useRef<NoteFrame[]>([])
  const [tooltip, setTooltip] = useState<{ x: number; y: number; note: string } | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef   = useRef<number>(0)
  const fileRef  = useRef<File | null>(null)
  const [playing, setPlaying]   = useState(false)
  const [audioDur, setAudioDur] = useState(0)
  const [volume, setVolume]     = useState(1)
  const [muted, setMuted]       = useState(false)

  const playheadRef        = useRef<HTMLDivElement>(null)
  const timeRef            = useRef<HTMLSpanElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 스크롤 컨테이너의 실제 표시 너비 (ResizeObserver로 추적)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // ── 줌 ──────────────────────────────────────────
  const [zoomX, setZoomX]       = useState(1)
  const zoomXRef                = useRef(1)
  const pendingScrollRef        = useRef<number | null>(null)

  // ── 캔버스 드래그 (seek) ─────────────────────────
  const isDraggingRef      = useRef(false)
  const dragStartXRef      = useRef(0)
  const dragStartScrollRef = useRef(0)
  const wasPlayingRef      = useRef(false)
  const [dragging, setDragging] = useState(false)

  // ── 플레이헤드 위치 드래그 ───────────────────────
  const anchorXRef           = useRef<number | null>(null)
  const isPlayheadDragRef    = useRef(false)
  const phDragStartXRef      = useRef(0)
  const phDragStartAnchorRef = useRef(0)

  // 동적 범위에서 계산되는 캔버스 높이 및 Y축 레이블
  const canvasHeight = (midiMax - midiMin) * ROW_H
  const yLabels = useMemo(() => {
    const H            = (midiMax - midiMin) * ROW_H
    const lowestRawOct = Math.floor(midiMin / 12)
    const arr: { label: string; y: number; isC: boolean }[] = []
    for (let midi = midiMin; midi <= midiMax; midi++) {
      const semi = midi % 12
      if (!NATURAL.has(semi)) continue
      const rawOct  = Math.floor(midi / 12)
      const isC     = semi === 0
      const label   = isC ? `C${rawOct - 1}` : NOTE_NAMES[semi]
      // 옥타브 내 흰건반을 균등 분할 — E-F·B-C 간격 불균형 해소
      const octaveBottomY = H - (rawOct - lowestRawOct) * 12 * ROW_H
      const y = octaveBottomY - (WHITE_KEY_IDX[semi] + 0.5) * WHITE_KEY_H
      arr.push({ label, y, isC })
    }
    return arr
  }, [midiMin, midiMax])

  // 렌더링에 사용되는 표시 너비
  const displayWidth = canvasWidth * zoomX

  const xLabels = useMemo(() => {
    if (!done || audioDur <= 0 || canvasWidth <= 0) return []
    const dw = canvasWidth * zoomX
    // 현재 화면에 보이는 시간 구간 → 그에 맞는 눈금 간격 계산
    const visibleDur = containerWidth > 0 ? (containerWidth / dw) * audioDur : audioDur
    const interval   = getTimeInterval(visibleDur)
    const labels: { t: number; x: number }[] = []
    for (let t = 0; t <= audioDur; t += interval) {
      labels.push({ t, x: (t / audioDur) * dw })
    }
    return labels
  }, [done, audioDur, canvasWidth, zoomX, containerWidth])

  useEffect(() => {
    const file = fileStore.get()
    if (!file) { router.replace('/upload'); return }
    setFileName(file.name)
    fileRef.current = file

    analyzePitch(file, setProgress).then(frames => {
      framesRef.current = frames
      const [lo, hi] = detectMidiRange(frames)
      setMidiMin(lo)
      setMidiMax(hi)
      drawPianoRoll(canvasRef.current!, frames, lo, hi)
      setCanvasWidth(canvasRef.current!.width)
      setDone(true)
    }).catch(() => setError('음 분석에 실패했습니다.'))
  }, [])

  useEffect(() => {
    if (!done || !fileRef.current) return
    const url   = URL.createObjectURL(fileRef.current)
    const audio = new Audio(url)
    audioRef.current = audio
    audio.addEventListener('loadedmetadata', () => setAudioDur(audio.duration))
    audio.addEventListener('ended', () => {
      setPlaying(false)
      cancelAnimationFrame(rafRef.current)
      updateHead(0)
    })
    return () => {
      audio.pause()
      URL.revokeObjectURL(url)
      cancelAnimationFrame(rafRef.current)
    }
  }, [done])

  // 줌 후 스크롤 보정: paint 전에 scrollLeft 반영
  useLayoutEffect(() => {
    if (pendingScrollRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = Math.max(0, pendingScrollRef.current)
      pendingScrollRef.current = null
    }
  })

  // 줌 변경 — 마우스 위치(없으면 화면 중앙)를 기준으로 스크롤 보정
  const updateZoom = useCallback((newZoom: number, mouseScreenX?: number) => {
    const clamped   = Math.max(0.25, Math.min(8, newZoom))
    const container = scrollContainerRef.current
    const canvas    = canvasRef.current
    if (container && canvas) {
      const oldDW        = canvas.width * zoomXRef.current
      const anchorScreen = mouseScreenX ?? container.clientWidth / 2
      const ratio        = (container.scrollLeft + anchorScreen) / oldDW
      pendingScrollRef.current = ratio * canvas.width * clamped - anchorScreen
    }
    zoomXRef.current = clamped
    setZoomX(clamped)
  }, [])

  // Ctrl + 휠 → 줌
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
      const rect   = el.getBoundingClientRect()
      updateZoom(zoomXRef.current * factor, e.clientX - rect.left)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [updateZoom])

  const updateHead = (pct: number) => {
    const canvas    = canvasRef.current
    const container = scrollContainerRef.current
    const dw        = canvas ? canvas.width * zoomXRef.current : 0

    if (dw > 0 && container) {
      const currentPx = pct * dw
      if (playheadRef.current) playheadRef.current.style.left = `${currentPx}px`
      if (!isDraggingRef.current && !isPlayheadDragRef.current) {
        const anchor = anchorXRef.current ?? container.clientWidth / 5
        container.scrollLeft = Math.max(0, currentPx - anchor)
      }
    }
    if (timeRef.current) {
      const audio = audioRef.current
      timeRef.current.textContent = audio ? fmt(audio.currentTime) : '0:00'
    }
  }

  const tick = useCallback(() => {
    const audio = audioRef.current
    if (!audio || audio.paused) return
    updateHead(audio.currentTime / (audio.duration || 1))
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // 마우스 드래그 핸들러 (document 레벨)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // 플레이헤드 위치 드래그
      if (isPlayheadDragRef.current) {
        const container = scrollContainerRef.current
        const canvas    = canvasRef.current
        const audio     = audioRef.current
        if (!container || !canvas) return

        const delta      = e.clientX - phDragStartXRef.current
        const newScreenX = Math.max(0, Math.min(container.clientWidth, phDragStartAnchorRef.current + delta))
        anchorXRef.current = newScreenX

        const dw       = canvas.width * zoomXRef.current
        const canvasPx = container.scrollLeft + newScreenX
        if (playheadRef.current) playheadRef.current.style.left = `${canvasPx}px`
        if (audio && audio.duration) {
          audio.currentTime = Math.min(1, canvasPx / dw) * audio.duration
          if (timeRef.current) timeRef.current.textContent = fmt(audio.currentTime)
        }
        return
      }

      // 캔버스 드래그 (seek)
      if (!isDraggingRef.current) return
      const container = scrollContainerRef.current
      const canvas    = canvasRef.current
      const audio     = audioRef.current
      if (!container || !canvas || !audio || !audio.duration) return

      const dw        = canvas.width * zoomXRef.current
      const delta     = e.clientX - dragStartXRef.current
      const maxScroll = Math.max(0, dw - container.clientWidth)
      const newScroll = Math.max(0, Math.min(maxScroll, dragStartScrollRef.current - delta))
      container.scrollLeft = newScroll

      const anchor    = anchorXRef.current ?? container.clientWidth / 5
      const currentPx = Math.min(dw, newScroll + anchor)
      if (playheadRef.current) playheadRef.current.style.left = `${currentPx}px`
      audio.currentTime = (currentPx / dw) * audio.duration
      if (timeRef.current) timeRef.current.textContent = fmt(audio.currentTime)
    }

    const onUp = () => {
      if (isPlayheadDragRef.current) {
        isPlayheadDragRef.current = false
        setDragging(false)
        return
      }
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      setDragging(false)
      if (wasPlayingRef.current && audioRef.current) {
        audioRef.current.play()
        rafRef.current = requestAnimationFrame(tick)
        setPlaying(true)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [tick])

  const handleRollMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const frames = framesRef.current
    const canvas = canvasRef.current
    if (!done || frames.length === 0 || !canvas) { setTooltip(null); return }

    const rect   = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // 표시 너비 → 캔버스 픽셀 X
    const dw      = canvas.width * zoomXRef.current
    const canvasX = Math.floor(mouseX * (canvas.width / dw))

    // 캔버스 X → 프레임 인덱스
    const W        = canvas.width
    const step     = frames.length / W
    const frameIdx = Math.min(frames.length - 1, Math.floor(canvasX * step))

    // 마우스 Y → MIDI 번호 (세로 줌 없음, 1:1)
    const H           = canvasHeight
    const midiRow     = Math.floor((H - mouseY) / ROW_H)
    const hoveredMidi = midiMin + midiRow

    const frame = frames[frameIdx]
    if (frame && frame.midi === hoveredMidi && frame.note) {
      setTooltip({ x: e.clientX, y: e.clientY, note: frame.note })
    } else {
      setTooltip(null)
    }
  }

  const handleRollMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!done || audioDur === 0) return
    e.preventDefault()
    wasPlayingRef.current = !!audioRef.current && !audioRef.current.paused
    if (wasPlayingRef.current) {
      audioRef.current!.pause()
      cancelAnimationFrame(rafRef.current)
      setPlaying(false)
    }
    isDraggingRef.current      = true
    dragStartXRef.current      = e.clientX
    dragStartScrollRef.current = scrollContainerRef.current?.scrollLeft ?? 0
    setDragging(true)
  }

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const container = scrollContainerRef.current
    if (!container) return
    const canvasPx = parseFloat(playheadRef.current?.style.left ?? '0') || 0
    isPlayheadDragRef.current    = true
    phDragStartXRef.current      = e.clientX
    phDragStartAnchorRef.current = canvasPx - container.scrollLeft
    setDragging(true)
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      cancelAnimationFrame(rafRef.current)
      setPlaying(false)
    } else {
      audio.play()
      rafRef.current = requestAnimationFrame(tick)
      setPlaying(true)
    }
  }

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setVolume(val)
    setMuted(val === 0)
    if (audioRef.current) audioRef.current.volume = val
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    if (muted) {
      const restored = volume === 0 ? 0.8 : volume
      audio.volume = restored
      setVolume(restored)
      setMuted(false)
    } else {
      audio.volume = 0
      setMuted(true)
    }
  }

  // 줌 퍼센트 직접 입력
  const [zoomInput, setZoomInput]   = useState('')
  const [editingZoom, setEditingZoom] = useState(false)
  const zoomInputRef = useRef<HTMLInputElement>(null)

  const startZoomEdit = () => {
    setZoomInput(String(Math.round(zoomX * 100)))
    setEditingZoom(true)
    setTimeout(() => { zoomInputRef.current?.select() }, 0)
  }

  const commitZoomEdit = () => {
    const val = parseInt(zoomInput, 10)
    if (!isNaN(val) && val > 0) updateZoom(val / 100)
    setEditingZoom(false)
  }

  const showXAxis = done && audioDur > 0
  const [showNoteLines, setShowNoteLines] = useState(false)

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white flex flex-col">
      {/* 노트 호버 툴팁 */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-2 py-1 rounded-md bg-gray-900/90 border border-white/10 text-white font-mono text-xs shadow-lg backdrop-blur-sm"
          style={{ left: tooltip.x + 12, top: tooltip.y - 28 }}
        >
          {tooltip.note}
        </div>
      )}
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] shrink-0">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>
        <span className="text-sm text-white/25 shrink-0">|</span>
        <span className="text-sm text-white/50 truncate">{fileName}</span>
      </div>

      {/* 재생 컨트롤 바 */}
      {done && (
        <div className="flex items-center justify-center gap-3 px-6 py-2 border-b border-white/[0.06] shrink-0">
          <button
            onClick={togglePlay}
            disabled={audioDur === 0}
            className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors shrink-0 disabled:opacity-30"
          >
            {playing ? (
              <svg className="w-3.5 h-3.5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6"  y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-white/70 translate-x-px" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <span className="text-xs text-white/35 tabular-nums">
            <span ref={timeRef}>0:00</span>
            <span className="text-white/15 mx-1">/</span>
            {fmt(audioDur)}
          </span>

          <button onClick={toggleMute} className="shrink-0 text-white/30 hover:text-white/60 transition-colors">
            {muted || volume === 0 ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : volume < 0.5 ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17.657 6.343a8 8 0 010 11.314M15.536 8.464a5 5 0 010 7.072" />
              </svg>
            )}
          </button>

          <div className="relative w-20 h-1">
            <div className="absolute inset-0 rounded-full bg-white/10" />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/30"
              style={{ width: `${(muted ? 0 : volume) * 100}%` }}
            />
            <input
              type="range" min={0} max={1} step={0.01}
              value={muted ? 0 : volume}
              onChange={changeVolume}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            />
          </div>
          <span className="text-xs text-white/25 tabular-nums w-8">
            {Math.round((muted ? 0 : volume) * 100)}%
          </span>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* 줌 컨트롤 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateZoom(zoomX / 1.5)}
              disabled={zoomX <= 0.25}
              className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80 text-sm transition-colors disabled:opacity-30"
            >−</button>

            {editingZoom ? (
              <div className="flex items-center">
                <input
                  ref={zoomInputRef}
                  type="text"
                  inputMode="numeric"
                  value={zoomInput}
                  onChange={e => setZoomInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => setEditingZoom(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitZoomEdit()
                    else if (e.key === 'Escape') setEditingZoom(false)
                  }}
                  className="w-10 bg-white/10 border border-white/20 rounded text-[11px] font-mono text-white/80 text-center tabular-nums outline-none px-1 py-0.5"
                />
                <span className="text-[11px] text-white/35 ml-0.5">%</span>
              </div>
            ) : (
              <button
                onClick={startZoomEdit}
                title="클릭해서 직접 입력"
                className="w-14 text-[11px] font-mono text-white/35 hover:text-white/70 text-center tabular-nums hover:bg-white/5 rounded py-0.5 transition-colors"
              >
                {Math.round(zoomX * 100)}%
              </button>
            )}

            <button
              onClick={() => updateZoom(zoomX * 1.5)}
              disabled={zoomX >= 8}
              className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white/80 text-sm transition-colors disabled:opacity-30"
            >+</button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-6 p-6 w-full">
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/30">피아노 롤 · C2 ~ C6</p>
                <button
                  onClick={() => setShowNoteLines(v => !v)}
                  className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded transition-colors ${
                    showNoteLines
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50'
                  }`}
                >
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <line x1="0" y1="3" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
                    <line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
                    <line x1="0" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
                  </svg>
                  음계선
                </button>
              </div>

              <div className="flex overflow-hidden rounded-xl border border-black/10">
                {/* Y축 — 고정 */}
                <div
                  className="shrink-0 flex flex-col bg-[#f5f5f5] border-r border-black/10"
                  style={{ width: Y_AXIS_W }}
                >
                  <div className="relative overflow-hidden" style={{ height: canvasHeight }}>
                    {yLabels.map(({ label, y, isC }) => (
                      <span
                        key={`${label}-${y}`}
                        className={`absolute right-1.5 font-mono select-none leading-none ${
                          isC
                            ? 'text-[10px] font-bold text-red-600'
                            : 'text-[7px] font-medium text-red-400/70'
                        }`}
                        style={{ top: y, transform: 'translateY(-50%)' }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  {showXAxis && (
                    <div className="border-t border-black/10" style={{ height: X_AXIS_H }} />
                  )}
                </div>

                {/* 스크롤 영역 */}
                <div ref={scrollContainerRef} className="flex-1 overflow-x-hidden">
                  {/* 캔버스 */}
                  <div
                    className={`relative bg-white select-none ${
                      dragging ? 'cursor-grabbing' : audioDur > 0 ? 'cursor-grab' : ''
                    }`}
                    style={{ width: displayWidth || 600, minWidth: 600 }}
                    onMouseDown={handleRollMouseDown}
                    onMouseMove={handleRollMouseMove}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <canvas
                      ref={canvasRef}
                      style={{
                        imageRendering: 'pixelated',
                        display: 'block',
                        width:  displayWidth || 600,
                        height: canvasHeight,
                      }}
                    />
                    {/* 플레이헤드 */}
                    <div
                      ref={playheadRef}
                      className="absolute inset-y-0 pointer-events-none"
                      style={{ left: '0px', width: 0, overflow: 'visible', zIndex: 10 }}
                    >
                      <div
                        className="absolute inset-y-0 -translate-x-1/2 cursor-ew-resize"
                        style={{ width: 16, pointerEvents: 'auto' }}
                        onMouseDown={handlePlayheadMouseDown}
                      />
                      <div
                        className="absolute inset-y-0 w-[2px] -translate-x-px bg-violet-500 pointer-events-none"
                        style={{ boxShadow: '0 0 6px rgba(139,92,246,0.5)' }}
                      />
                      <div
                        className="absolute top-0 w-2.5 h-2.5 bg-violet-500 -translate-x-1/2 pointer-events-none"
                        style={{ clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)' }}
                      />
                    </div>
                    {/* 세로 그리드 */}
                    {xLabels.filter(({ t }) => t > 0).map(({ t, x }) => (
                      <div
                        key={t}
                        className="absolute inset-y-0 pointer-events-none"
                        style={{ left: x, borderLeft: '1px dashed rgba(0,0,0,0.18)' }}
                      />
                    ))}
                    {/* 음계 가로 점선 */}
                    {showNoteLines && yLabels.map(({ label, y, isC }) => (
                      <div
                        key={`line-${label}`}
                        className="absolute inset-x-0 pointer-events-none"
                        style={{
                          top: y,
                          height: 0,
                          borderTop: isC
                            ? '1px dashed rgba(239,68,68,0.65)'
                            : '1px dashed rgba(239,68,68,0.28)',
                        }}
                      />
                    ))}
                  </div>

                  {/* X축 */}
                  {showXAxis && (
                    <div
                      className="relative bg-[#f5f5f5] border-t border-black/10"
                      style={{ height: X_AXIS_H, width: displayWidth || 600 }}
                    >
                      {xLabels.map(({ t, x }) => (
                        <span
                          key={t}
                          className="absolute text-[9px] font-mono font-bold text-red-600 select-none"
                          style={{ left: x, top: '50%', transform: 'translate(-50%, -50%)' }}
                        >
                          {fmt(t)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {done && audioDur > 0 && (
                <p className="mt-2 text-[10px] text-white/20 text-right">
                  롤 드래그: 위치 이동 · 세로줄 드래그: 기준선 이동 · Ctrl+휠: 확대/축소
                </p>
              )}
            </div>

            {!done && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-white/30">
                  <span>음 분석 중...</span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all duration-100"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
