import DropZone from '@/app/components/DropZone'

export default function Page() {
  return (
    <main className="min-h-screen bg-[#0d0d0f] flex flex-col">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-violet-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-blue-600/8 blur-[100px] rounded-full" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/40 tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Music Separator
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold text-white/90 tracking-tight">
            음악 파일 업로드
          </h1>
          <p className="mt-3 text-base text-white/35 max-w-sm mx-auto leading-relaxed">
            MP3 또는 WAV 파일을 업로드하면<br />
            보컬, 드럼, 베이스 등을 분리해 드립니다
          </p>
        </div>

        <DropZone />

        <p className="mt-10 text-xs text-white/20">
          최대 파일 크기 200MB · MP3, WAV 지원
        </p>
      </div>
    </main>
  )
}
