'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { fileStore } from '@/app/lib/fileStore'
import { analyzePitch, NoteFrame } from '@/app/lib/pitchDetection'


const MIDI_MIN  = 36
const MIDI_MAX  = 84
const ROW_H     = 5
const CANVAS_H  = (MIDI_MAX - MIDI_MIN) * ROW_H  // 240px
const X_AXIS_H  = 20
const Y_AXIS_W  = 40

// C note labels at every octave boundary (grid lines)
const Y_LABELS: { label: string; y: number }[] = (() => {
  const arr: { label: string; y: number }[] = []
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi += 12) {
    const octave = Math.floor(midi / 12) - 1
    arr.push({ label: `C${octave}`, y: CANVAS_H - (midi - MIDI_MIN) * ROW_H })
  }
  return arr
})()

function getTimeInterval(dur: number): number {
  if (dur <= 15)  return 2
  if (dur <= 30)  return 5
  if (dur <= 90)  return 10
  if (dur <= 180) return 30
  if (dur <= 600) return 60
  return 120
}

function drawPianoRoll(canvas: HTMLCanvasElement, frames: NoteFrame[]) {
  const ROWS = MIDI_MAX - MIDI_MIN
  const H    = ROWS * ROW_H
  const W    = Math.min(frames.length, 3000)
  const step = frames.length / W

  canvas.width  = W
  canvas.height = H

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = 1
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi += 12) {
    const y = H - (midi - MIDI_MIN) * ROW_H
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  ctx.fillStyle = '#1a1a1a'
  for (let col = 0; col < W; col++) {
    const frame = frames[Math.floor(col * step)]
    if (!frame.midi || !frame.note) continue
    const midi = frame.midi
    if (midi < MIDI_MIN || midi > MIDI_MAX) continue
    const y = H - (midi - MIDI_MIN + 1) * ROW_H
    ctx.fillRect(col, y, 1, ROW_H)
  }
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function NotesPage() {
  const router = useRouter()

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [fileName, setFileName]   = useState('')
  const [progress, setProgress]   = useState(0)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')
  const [canvasWidth, setCanvasWidth] = useState(0)

  const audioRef        = useRef<HTMLAudioElement | null>(null)
  const rafRef          = useRef<number>(0)
  const fileRef         = useRef<File | null>(null)
  const [playing, setPlaying]   = useState(false)
  const [audioDur, setAudioDur] = useState(0)
  const [volume, setVolume]     = useState(1)
  const [muted, setMuted]       = useState(false)

  const playheadRef        = useRef<HTMLDivElement>(null)
  const seekFillRef        = useRef<HTMLDivElement>(null)
  const timeRef            = useRef<HTMLSpanElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // X축 레이블: 시간 간격에 맞춰 계산
  const xLabels = useMemo(() => {
    if (!done || audioDur <= 0 || canvasWidth <= 0) return []
    const interval = getTimeInterval(audioDur)
    const labels: { t: number; x: number }[] = []
    for (let t = 0; t <= audioDur; t += interval) {
      labels.push({ t, x: (t / audioDur) * canvasWidth })
    }
    return labels
  }, [done, audioDur, canvasWidth])

  useEffect(() => {
    const file = fileStore.get()
    if (!file) { router.replace('/upload'); return }
    setFileName(file.name)
    fileRef.current = file

    analyzePitch(file, setProgress).then(frames => {
      drawPianoRoll(canvasRef.current!, frames)
      setCanvasWidth(canvasRef.current!.width)
      setDone(true)
    }).catch(() => setError('음 분석에 실패했습니다.'))
  }, [])

  useEffect(() => {
    if (!done || !fileRef.current) return
    const url = URL.createObjectURL(fileRef.current)
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

  const updateHead = (pct: number) => {
    const canvas    = canvasRef.current
    const container = scrollContainerRef.current
    const canvasW   = canvas ? canvas.width : 0

    if (canvasW > 0 && container) {
      const currentPx = pct * canvasW
      const anchorX   = container.clientWidth / 5
      if (playheadRef.current) {
        playheadRef.current.style.left = `${currentPx}px`
      }
      container.scrollLeft = Math.max(0, currentPx - anchorX)
    }

    if (seekFillRef.current) seekFillRef.current.style.width = `${pct * 100}%`
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

  const seekTo = (pct: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = pct * audio.duration
    updateHead(pct)
  }

  const handleRollClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!done) return
    const canvas    = canvasRef.current
    const container = scrollContainerRef.current
    if (!canvas || !container) return
    const rect   = container.getBoundingClientRect()
    const clickX = e.clientX - rect.left + container.scrollLeft
    seekTo(clickX / canvas.width)
  }

  const handleSeekBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(e.target.value) / 1000)
  }

  const showXAxis = done && audioDur > 0

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/[0.06]">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>
        <span className="text-sm text-white/25">|</span>
        <span className="text-sm text-white/50 truncate max-w-sm">{fileName}</span>
      </div>

      <div className="flex-1 flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <>
            {/* 피아노 롤 */}
            <div>
              <p className="text-xs text-white/30 mb-2">피아노 롤 · C2 ~ C6</p>

              <div className="flex overflow-hidden rounded-xl border border-black/10">
                {/* Y축 — 고정 (가로 스크롤 안함) */}
                <div
                  className="shrink-0 flex flex-col bg-[#f5f5f5] border-r border-black/10"
                  style={{ width: Y_AXIS_W }}
                >
                  <div className="relative overflow-hidden" style={{ height: CANVAS_H }}>
                    {Y_LABELS.map(({ label, y }) => (
                      <span
                        key={label}
                        className="absolute right-1.5 text-[10px] font-mono text-black/40 select-none leading-none"
                        style={{ top: y, transform: 'translateY(-50%)' }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  {/* X축 높이 맞춤 */}
                  {showXAxis && (
                    <div
                      className="border-t border-black/10"
                      style={{ height: X_AXIS_H }}
                    />
                  )}
                </div>

                {/* 스크롤 영역 */}
                <div ref={scrollContainerRef} className="flex-1 overflow-x-auto">
                  {/* 캔버스 + 플레이헤드 + 세로 그리드 라인 */}
                  <div
                    className="relative bg-white cursor-pointer"
                    style={{ minWidth: 600 }}
                    onClick={handleRollClick}
                  >
                    <canvas
                      ref={canvasRef}
                      style={{ imageRendering: 'pixelated', display: 'block', minWidth: '600px' }}
                    />
                    <div
                      ref={playheadRef}
                      className="absolute inset-y-0 w-px bg-violet-500/80 pointer-events-none"
                      style={{ left: '0px' }}
                    />
                    {/* 세로 그리드 — X축 눈금 위치 */}
                    {xLabels.filter(({ t }) => t > 0).map(({ t, x }) => (
                      <div
                        key={t}
                        className="absolute inset-y-0 w-px bg-black/[0.07] pointer-events-none"
                        style={{ left: x }}
                      />
                    ))}
                  </div>

                  {/* X축 — 시간 레이블 */}
                  {showXAxis && (
                    <div
                      className="relative bg-[#f5f5f5] border-t border-black/10"
                      style={{ height: X_AXIS_H, minWidth: 600 }}
                    >
                      {xLabels.map(({ t, x }) => (
                        <span
                          key={t}
                          className="absolute text-[9px] font-mono text-black/40 select-none"
                          style={{
                            left: x,
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          {fmt(t)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 재생 컨트롤 */}
            {done && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    disabled={audioDur === 0}
                    className="w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors shrink-0 disabled:opacity-30"
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

                  <span ref={timeRef} className="text-xs text-white/30 tabular-nums shrink-0 w-9 text-right">
                    0:00
                  </span>

                  <div className="relative flex-1 h-1 group">
                    <div className="absolute inset-0 rounded-full bg-white/10" />
                    <div ref={seekFillRef} className="absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: '0%' }} />
                    <input
                      type="range" min={0} max={1000} step={1} defaultValue={0}
                      onChange={handleSeekBarChange}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                    />
                  </div>

                  <span className="text-xs text-white/25 tabular-nums shrink-0 w-9">
                    {fmt(audioDur)}
                  </span>
                </div>

                <div className="flex items-center gap-3 pl-1">
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

                  <div className="relative w-24 h-1">
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

                  <span className="text-xs text-white/25 tabular-nums">
                    {Math.round((muted ? 0 : volume) * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* 진행 상태 */}
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
