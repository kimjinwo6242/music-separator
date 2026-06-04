'use client'

import { useState, useCallback, useRef, lazy, Suspense } from 'react'
import { analyzeAudio } from '@/app/lib/pitchDetection'
import type { NoteEvent } from '@/app/lib/pitchDetection'

const SheetMusicView = lazy(() => import('./SheetMusicView'))

interface Analysis {
  status: 'analyzing' | 'done' | 'error'
  progress: number
  notes: NoteEvent[]
  bpm: number
  error?: string
}

interface UploadedFile {
  id: string
  file: File
  status: 'idle' | 'uploading' | 'done' | 'error'
  progress: number
  analysis?: Analysis
  showSheet: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ type }: { type: string }) {
  const isMp3 = type === 'audio/mpeg'
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold tracking-wide shrink-0 ${isMp3 ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
      {isMp3 ? 'MP3' : 'WAV'}
    </div>
  )
}

function AnalysisProgress({ progress }: { progress: number }) {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex justify-between text-xs text-white/30">
        <span>음정 분석 중…</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-500 transition-all duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

export default function DropZone() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ACCEPTED = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav']

  const processFiles = useCallback((incoming: File[]) => {
    setDragError(null)
    const valid   = incoming.filter(f =>  ACCEPTED.includes(f.type))
    const invalid = incoming.filter(f => !ACCEPTED.includes(f.type))
    if (invalid.length) setDragError(`${invalid.length}개의 파일은 MP3/WAV 형식이 아닙니다.`)
    if (!valid.length) return

    setFiles(prev => {
      const existing = new Set(prev.map(e => e.id))
      const next = valid
        .map(f => ({ id: `${f.name}-${f.size}-${f.lastModified}`, file: f, status: 'idle' as const, progress: 0, showSheet: false }))
        .filter(e => !existing.has(e.id))
      return [...prev, ...next]
    })
  }, [])

  const simulateUpload = useCallback((id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'uploading' } : f))
    let p = 0
    const timer = setInterval(() => {
      p += Math.random() * 20 + 5
      if (p >= 100) {
        clearInterval(timer)
        setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'done', progress: 100 } : f))
      } else {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: p } : f))
      }
    }, 120)
  }, [])

  const startAnalysis = useCallback(async (id: string) => {
    const entry = files.find(f => f.id === id)
    if (!entry) return

    setFiles(prev => prev.map(f => f.id === id
      ? { ...f, analysis: { status: 'analyzing', progress: 0, notes: [], bpm: 120 }, showSheet: false }
      : f
    ))

    try {
      const { notes, bpm } = await analyzeAudio(entry.file, p =>
        setFiles(prev => prev.map(f => f.id === id && f.analysis
          ? { ...f, analysis: { ...f.analysis, progress: p } }
          : f
        ))
      )
      setFiles(prev => prev.map(f => f.id === id
        ? { ...f, analysis: { status: 'done', progress: 1, notes, bpm }, showSheet: true }
        : f
      ))
    } catch (err) {
      setFiles(prev => prev.map(f => f.id === id
        ? { ...f, analysis: { status: 'error', progress: 0, notes: [], bpm: 120, error: String(err) } }
        : f
      ))
    }
  }, [files])

  const toggleSheet = (id: string) =>
    setFiles(prev => prev.map(f => f.id === id ? { ...f, showSheet: !f.showSheet } : f))

  const removeFile = (id: string) =>
    setFiles(prev => prev.filter(f => f.id !== id))

  const idleCount = files.filter(f => f.status === 'idle').length
  const doneCount = files.filter(f => f.status === 'done').length

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    processFiles(Array.from(e.dataTransfer.files))
  }
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Drop Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-200 p-12
          flex flex-col items-center justify-center gap-4 text-center
          ${isDragging
            ? 'border-violet-400 bg-violet-500/10 scale-[1.01]'
            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
          }
        `}
      >
        <input
          ref={inputRef} type="file"
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          multiple className="hidden"
          onChange={onInputChange}
        />
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 ${isDragging ? 'bg-violet-500/30' : 'bg-white/5'}`}>
          <svg className={`w-8 h-8 transition-colors ${isDragging ? 'text-violet-300' : 'text-white/40'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
        </div>
        <div>
          <p className={`text-lg font-medium transition-colors ${isDragging ? 'text-violet-300' : 'text-white/70'}`}>
            {isDragging ? '파일을 놓으세요' : '파일을 드래그하거나 클릭하여 업로드'}
          </p>
          <p className="text-sm text-white/30 mt-1">MP3, WAV 형식 지원</p>
        </div>
      </div>

      {dragError && <p className="text-sm text-red-400 text-center">{dragError}</p>}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/40">{files.length}개 파일</span>
            {idleCount > 0 && (
              <button
                onClick={() => files.filter(f => f.status === 'idle').forEach(f => simulateUpload(f.id))}
                className="px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
              >
                전체 업로드
              </button>
            )}
            {idleCount === 0 && doneCount === files.length && (
              <span className="text-sm text-emerald-400 font-medium">모두 완료</span>
            )}
          </div>

          <div className="space-y-3">
            {files.map(entry => (
              <div key={entry.id} className="rounded-2xl bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                {/* File row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <FileIcon type={entry.file.type} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/80 truncate">{entry.file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-white/30">{formatBytes(entry.file.size)}</span>
                      {entry.status === 'uploading' && (
                        <span className="text-xs text-violet-400">{Math.round(entry.progress)}%</span>
                      )}
                      {entry.status === 'done' && !entry.analysis && (
                        <span className="text-xs text-emerald-400">업로드 완료</span>
                      )}
                      {entry.analysis?.status === 'done' && (
                        <span className="text-xs text-amber-400">{entry.analysis.notes.length}개 음표 감지</span>
                      )}
                    </div>
                    {entry.status === 'uploading' && (
                      <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500 transition-all duration-100" style={{ width: `${entry.progress}%` }} />
                      </div>
                    )}
                    {entry.analysis?.status === 'analyzing' && (
                      <AnalysisProgress progress={entry.analysis.progress} />
                    )}
                    {entry.analysis?.status === 'error' && (
                      <p className="text-xs text-red-400 mt-1">분석 실패: {entry.analysis.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {entry.status === 'idle' && (
                      <button
                        onClick={() => simulateUpload(entry.id)}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs font-medium transition-colors"
                      >
                        업로드
                      </button>
                    )}

                    {entry.status === 'done' && !entry.analysis && (
                      <button
                        onClick={() => startAnalysis(entry.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        악보 만들기
                      </button>
                    )}

                    {entry.analysis?.status === 'done' && (
                      <button
                        onClick={() => toggleSheet(entry.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${entry.showSheet ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        {entry.showSheet ? '악보 닫기' : '악보 보기'}
                      </button>
                    )}

                    {entry.status !== 'uploading' && entry.analysis?.status !== 'analyzing' && (
                      <button
                        onClick={() => removeFile(entry.id)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Sheet music panel */}
                {entry.showSheet && entry.analysis?.status === 'done' && (
                  <div className="border-t border-white/[0.06]">
                    <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium text-white/50">오선지 악보</span>
                        <span className="ml-2 text-xs text-white/25">· {entry.analysis.bpm} BPM · 4/4박자 · 단선율 분석</span>
                      </div>
                    </div>
                    <div className="px-2 pb-3">
                      <Suspense fallback={
                        <div className="flex items-center justify-center py-8 text-white/30 text-sm">악보 로딩 중…</div>
                      }>
                        <SheetMusicView notes={entry.analysis.notes} bpm={entry.analysis.bpm} />
                      </Suspense>
                    </div>
                    <p className="px-4 pb-3 text-xs text-white/20">
                      * 단선율(멜로디) 기반 분석입니다. 복잡한 화음이나 리듬은 단순화될 수 있습니다.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
