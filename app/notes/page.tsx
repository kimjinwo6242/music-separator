'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fileStore } from '@/app/lib/fileStore'
import { analyzePitch, NoteFrame } from '@/app/lib/pitchDetection'

const NOTE_COLORS: Record<string, string> = {
  'C':  '#ff6b6b', 'C#': '#ff9f43', 'D':  '#feca57', 'D#': '#48dbfb',
  'E':  '#1dd1a1', 'F':  '#ff9ff3', 'F#': '#54a0ff', 'G':  '#a29bfe',
  'G#': '#00cec9', 'A':  '#fd79a8', 'A#': '#e17055', 'B':  '#74b9ff',
}

function noteClass(note: string): string {
  return note.replace(/\d/, '')
}

function drawPianoRoll(canvas: HTMLCanvasElement, frames: NoteFrame[]) {
  const MIDI_MIN = 36
  const MIDI_MAX = 84
  const ROWS = MIDI_MAX - MIDI_MIN
  const ROW_H = 5
  const H = ROWS * ROW_H
  const W = Math.min(frames.length, 3000)
  const step = frames.length / W

  canvas.width  = W
  canvas.height = H

  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0d0d0f'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi += 12) {
    const y = H - (midi - MIDI_MIN) * ROW_H
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  for (let col = 0; col < W; col++) {
    const frame = frames[Math.floor(col * step)]
    if (!frame.midi || !frame.note) continue
    const midi = frame.midi
    if (midi < MIDI_MIN || midi > MIDI_MAX) continue
    const y = H - (midi - MIDI_MIN + 1) * ROW_H
    ctx.fillStyle = NOTE_COLORS[noteClass(frame.note)] ?? '#a29bfe'
    ctx.fillRect(col, y, 1, ROW_H)
  }
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function NotesPage() {
  const router = useRouter()

  // 분석
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState(0)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')
  const [topNotes, setTopNotes] = useState<{ note: string; count: number }[]>([])

  // 오디오
  const audioRef       = useRef<HTMLAudioElement | null>(null)
  const rafRef         = useRef<number>(0)
  const fileRef        = useRef<File | null>(null)
  const [playing, setPlaying]   = useState(false)
  const [audioDur, setAudioDur] = useState(0)

  // DOM ref로 직접 업데이트 (re-render 없이 60fps)
  const playheadRef    = useRef<HTMLDivElement>(null)
  const seekFillRef    = useRef<HTMLDivElement>(null)
  const timeRef        = useRef<HTMLSpanElement>(null)

  // 분석
  useEffect(() => {
    const file = fileStore.get()
    if (!file) { router.replace('/'); return }
    setFileName(file.name)
    fileRef.current = file

    analyzePitch(file, setProgress).then(frames => {
      const counts: Record<string, number> = {}
      for (const f of frames) {
        if (f.note) counts[f.note] = (counts[f.note] ?? 0) + 1
      }
      setTopNotes(
        Object.entries(counts)
          .map(([note, count]) => ({ note, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20)
      )
      drawPianoRoll(canvasRef.current!, frames)
      setDone(true)
    }).catch(() => setError('음 분석에 실패했습니다.'))
  }, [])

  // 분석 완료 후 오디오 준비
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
    if (playheadRef.current)  playheadRef.current.style.left  = `${pct * 100}%`
    if (seekFillRef.current)  seekFillRef.current.style.width  = `${pct * 100}%`
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

  const seekTo = (pct: number) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    audio.currentTime = pct * audio.duration
    updateHead(pct)
  }

  const handleRollClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!done) return
    const rect = e.currentTarget.getBoundingClientRect()
    seekTo((e.clientX - rect.left) / rect.width)
  }

  const handleSeekBarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(e.target.value) / 1000)
  }

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
            {/* 피아노 롤 + 플레이헤드 */}
            <div>
              <p className="text-xs text-white/30 mb-2">피아노 롤 · C2 ~ C6</p>
              <div
                className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-black cursor-pointer"
                onClick={handleRollClick}
              >
                <canvas
                  ref={canvasRef}
                  className="w-full"
                  style={{ imageRendering: 'pixelated', display: 'block', minHeight: '100px' }}
                />
                {/* 플레이헤드 */}
                <div
                  ref={playheadRef}
                  className="absolute inset-y-0 w-px bg-white/70 pointer-events-none"
                  style={{ left: '0%' }}
                />
              </div>
            </div>

            {/* 재생 컨트롤 */}
            {done && (
              <div className="flex items-center gap-3">
                {/* 재생/정지 */}
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

                {/* 현재 시간 */}
                <span ref={timeRef} className="text-xs text-white/30 tabular-nums shrink-0 w-9 text-right">
                  0:00
                </span>

                {/* 시크바 */}
                <div className="relative flex-1 h-1 group">
                  <div className="absolute inset-0 rounded-full bg-white/10" />
                  <div ref={seekFillRef} className="absolute inset-y-0 left-0 rounded-full bg-violet-500" style={{ width: '0%' }} />
                  <input
                    type="range" min={0} max={1000} step={1} defaultValue={0}
                    onChange={handleSeekBarChange}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                  />
                </div>

                {/* 전체 시간 */}
                <span className="text-xs text-white/25 tabular-nums shrink-0 w-9">
                  {fmt(audioDur)}
                </span>
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

            {/* 감지된 음 목록 */}
            {done && topNotes.length > 0 && (
              <div>
                <p className="text-xs text-white/30 mb-3">감지된 음 (빈도순) · {topNotes.length}개</p>
                <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
                  {topNotes.map(({ note, count }) => {
                    const color = NOTE_COLORS[noteClass(note)] ?? '#a29bfe'
                    return (
                      <div
                        key={note}
                        className="flex flex-col items-center gap-2 py-3 px-2 rounded-xl border border-white/[0.06] bg-white/[0.03]"
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-base font-mono font-bold text-white/85 tracking-tight">{note}</span>
                        <span className="text-xs text-white/25 tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {done && topNotes.length === 0 && (
              <p className="text-sm text-white/30 text-center py-8">
                감지된 음이 없습니다. 단음 악기(피아노, 기타, 보컬 등)가 포함된 파일에서 잘 작동합니다.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
