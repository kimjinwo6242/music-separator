'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fileStore } from '@/app/lib/fileStore'
import { computeAndDraw } from '@/app/lib/computeSpectrogram'

export default function SpectrogramPage() {
  const router    = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState(0)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    const file = fileStore.get()
    if (!file) {
      router.replace('/')
      return
    }
    setFileName(file.name)

    computeAndDraw(file, canvasRef.current!, setProgress)
      .then(() => setDone(true))
      .catch(() => setError('오디오 분석에 실패했습니다.'))
  }, [])

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

      {/* 본문 */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <>
            {/* 캔버스 */}
            <div className="w-full max-w-5xl rounded-xl overflow-hidden border border-white/[0.06] bg-black">
              <canvas
                ref={canvasRef}
                className="w-full"
                style={{ imageRendering: 'pixelated', display: 'block' }}
              />
            </div>

            {/* 진행 상태 */}
            {!done && (
              <div className="w-full max-w-5xl space-y-2">
                <div className="flex justify-between text-xs text-white/30">
                  <span>스펙트로그램 분석 중...</span>
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

            {done && (
              <p className="text-xs text-white/25">
                아래(저주파) → 위(고주파) · 로그 주파수 스케일
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
