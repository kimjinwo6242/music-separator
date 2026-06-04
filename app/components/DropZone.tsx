'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fileStore } from '@/app/lib/fileStore'

interface UploadedFile {
  id: string
  file: File
  status: 'idle' | 'uploading' | 'done'
  progress: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function FileIcon({ type }: { type: string }) {
  const isMp3 = type === 'audio/mpeg'
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold tracking-wide shrink-0 ${isMp3 ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
      {isMp3 ? 'MP3' : 'WAV'}
    </div>
  )
}

// 파일 하나의 오디오 플레이어
function AudioPlayer({ file }: { file: File }) {
  const audioRef   = useRef<HTMLAudioElement | null>(null)
  const srcRef     = useRef<string>('')
  const [playing, setPlaying]   = useState(false)
  const [current, setCurrent]   = useState(0)
  const [duration, setDuration] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [volume, setVolume]     = useState(1)
  const [muted, setMuted]       = useState(false)

  // File → Object URL 생성 (컴포넌트 언마운트 시 해제)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    srcRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
    audio.addEventListener('timeupdate',     () => { if (!dragging) setCurrent(audio.currentTime) })
    audio.addEventListener('ended',          () => { setPlaying(false); setCurrent(0) })

    return () => {
      audio.pause()
      URL.revokeObjectURL(url)
    }
  }, [file])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
    }
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const val = Number(e.target.value)
    audio.currentTime = val
    setCurrent(val)
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

  const pct    = duration > 0 ? (current / duration) * 100 : 0
  const volPct = muted ? 0 : volume * 100

  return (
    <div className="mt-2.5 space-y-2">
    <div className="flex items-center gap-3">
      {/* 재생/정지 */}
      <button
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors shrink-0"
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

      {/* 시간 */}
      <span className="text-xs text-white/30 tabular-nums shrink-0 w-9 text-right">
        {formatTime(current)}
      </span>

      {/* 시크 바 */}
      <div className="relative flex-1 h-1 group">
        {/* 배경 */}
        <div className="absolute inset-0 rounded-full bg-white/10" />
        {/* 재생 위치 */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-violet-500"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={current}
          onChange={seek}
          onMouseDown={() => setDragging(true)}
          onMouseUp={()   => setDragging(false)}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={()   => setDragging(false)}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>

      {/* 전체 시간 */}
      <span className="text-xs text-white/25 tabular-nums shrink-0 w-9">
        {formatTime(duration)}
      </span>
    </div>

    {/* 볼륨 행 */}
    <div className="flex items-center gap-3 pl-1">
      {/* 뮤트 / 볼륨 아이콘 */}
      <button onClick={toggleMute} className="shrink-0 text-white/30 hover:text-white/60 transition-colors">
        {muted || volPct === 0 ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : volPct < 50 ? (
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

      {/* 볼륨 슬라이더 */}
      <div className="relative w-24 h-1">
        <div className="absolute inset-0 rounded-full bg-white/10" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/30"
          style={{ width: `${volPct}%` }}
        />
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={muted ? 0 : volume}
          onChange={changeVolume}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>

      <span className="text-xs text-white/25 tabular-nums">{Math.round(volPct)}%</span>
    </div>
  </div>
  )
}

export default function DropZone() {
  const router = useRouter()

  const openSpectrogram = (file: File) => {
    fileStore.set(file)
    router.push('/spectrogram')
  }

  const openNotes = (file: File) => {
    fileStore.set(file)
    router.push('/notes')
  }

  const [files, setFiles]       = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragError, setDragError]   = useState<string | null>(null)
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
        .map(f => ({ id: `${f.name}-${f.size}-${f.lastModified}`, file: f, status: 'idle' as const, progress: 0 }))
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

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id))

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

  const idleCount = files.filter(f => f.status === 'idle').length
  const doneCount = files.filter(f => f.status === 'done').length

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* 드롭존 */}
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
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

      {/* 파일 목록 */}
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

          <div className="space-y-2">
            {files.map(entry => (
              <div key={entry.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
                {/* 파일 정보 행 */}
                <div className="flex items-center gap-3">
                  <FileIcon type={entry.file.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/80 truncate">{entry.file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-white/30">{formatBytes(entry.file.size)}</span>
                      {entry.status === 'uploading' && (
                        <span className="text-xs text-violet-400">{Math.round(entry.progress)}%</span>
                      )}
                      {entry.status === 'done' && (
                        <span className="text-xs text-emerald-400">완료</span>
                      )}
                    </div>
                    {entry.status === 'uploading' && (
                      <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-violet-500 transition-all duration-100" style={{ width: `${entry.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {entry.status === 'idle' && (
                      <button
                        onClick={() => simulateUpload(entry.id)}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 text-xs font-medium transition-colors"
                      >
                        업로드
                      </button>
                    )}
                    {entry.status === 'done' && (
                      <>
                        <button
                          onClick={() => openSpectrogram(entry.file)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/20 text-violet-400 hover:text-violet-300 text-xs font-medium transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V5m4 14V3m4 16V8M5 19v-4" />
                          </svg>
                          스펙트로그램
                        </button>
                        <button
                          onClick={() => openNotes(entry.file)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                          </svg>
                          음 분석
                        </button>
                        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </>
                    )}
                    {entry.status !== 'uploading' && (
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

                {/* 오디오 플레이어 — 업로드 완료 후 표시 */}
                {entry.status === 'done' && (
                  <AudioPlayer file={entry.file} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
