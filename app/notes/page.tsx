'use client'

import { useEffect, useRef, useState } from 'react'
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
  const MIDI_MIN = 36  // C2
  const MIDI_MAX = 84  // C6
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

  // 가이드 라인 (옥타브 경계)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi += 12) {
    const y = H - (midi - MIDI_MIN) * ROW_H
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // 노트 그리기
  for (let col = 0; col < W; col++) {
    const frame = frames[Math.floor(col * step)]
    if (!frame.midi || !frame.note) continue
    const midi = frame.midi
    if (midi < MIDI_MIN || midi > MIDI_MAX) continue

    const y = H - (midi - MIDI_MIN + 1) * ROW_H
    const nc = noteClass(frame.note)
    ctx.fillStyle = NOTE_COLORS[nc] ?? '#a29bfe'
    ctx.fillRect(col, y, 1, ROW_H)
  }
}

export default function NotesPage() {
  const router     = useRouter()
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState(0)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')
  const [topNotes, setTopNotes] = useState<{ note: string; count: number }[]>([])
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const file = fileStore.get()
    if (!file) { router.replace('/'); return }
    setFileName(file.name)

    analyzePitch(file, setProgress).then(frames => {
      if (frames.length > 0) setDuration(frames[frames.length - 1].time)

      // 빈도 집계
      const counts: Record<string, number> = {}
      for (const f of frames) {
        if (f.note) counts[f.note] = (counts[f.note] ?? 0) + 1
      }
      const sorted = Object.entries(counts)
        .map(([note, count]) => ({ note, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
      setTopNotes(sorted)

      drawPianoRoll(canvasRef.current!, frames)
      setDone(true)
    }).catch(() => setError('음 분석에 실패했습니다.'))
  }, [])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

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
        {done && duration > 0 && (
          <span className="ml-auto text-xs text-white/25">{fmt(duration)}</span>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-6 p-6 max-w-5xl mx-auto w-full">
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <>
            {/* 피아노 롤 */}
            <div>
              <p className="text-xs text-white/30 mb-2">피아노 롤 · C2 ~ C6</p>
              <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-black">
                <canvas
                  ref={canvasRef}
                  className="w-full"
                  style={{ imageRendering: 'pixelated', display: 'block', minHeight: '100px' }}
                />
              </div>
            </div>

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
                <p className="text-xs text-white/30 mb-3">감지된 음 (빈도순)</p>
                <div className="flex flex-wrap gap-2">
                  {topNotes.map(({ note, count }) => {
                    const nc = noteClass(note)
                    const color = NOTE_COLORS[nc] ?? '#a29bfe'
                    return (
                      <div
                        key={note}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03]"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-mono font-medium text-white/80">{note}</span>
                        <span className="text-xs text-white/25">{count}</span>
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
