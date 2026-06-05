import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0d0d0f] flex flex-col overflow-hidden">
      {/* 배경 글로우 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-violet-600/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-10%] right-1/4 w-[500px] h-[400px] bg-blue-600/8 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-[10%] w-[300px] h-[300px] bg-indigo-600/6 blur-[100px] rounded-full" />
      </div>

      {/* 헤더 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <span className="text-sm font-medium text-white/60 tracking-wide">MusicSep</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-xs text-white/30 tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Beta
        </div>
      </header>

      {/* 히어로 */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300/70 tracking-widest uppercase font-medium">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V5m4 14V3m4 16V8M5 19v-4" />
          </svg>
          AI 음악 분석 도구
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white/90 tracking-tight leading-[1.1] max-w-3xl">
          음악을{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">
            분석
          </span>
          하고<br />
          악보를 만드세요
        </h1>

        <p className="mt-6 text-lg text-white/35 max-w-lg leading-relaxed">
          MP3, WAV 파일을 업로드하면 스펙트로그램 분석,<br className="hidden sm:block" />
          음 감지, 피아노 롤 시각화를 제공합니다.
        </p>

        {/* CTA 버튼 */}
        <div className="mt-12 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/upload"
            className="group relative flex items-center gap-3 px-8 py-4 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-base transition-all duration-200 shadow-lg shadow-violet-900/40 hover:shadow-violet-800/50 hover:scale-[1.02]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            악보제작 시작하기
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>

        {/* 기능 카드 */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full">
          {[
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V5m4 14V3m4 16V8M5 19v-4" />
                </svg>
              ),
              color: 'violet',
              title: '스펙트로그램',
              desc: '주파수 분포를 시각적으로 분석',
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              ),
              color: 'emerald',
              title: '음 감지',
              desc: '피아노 롤로 멜로디를 추적',
            },
            {
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ),
              color: 'blue',
              title: '실시간 녹음',
              desc: '시스템 오디오를 바로 캡처',
            },
          ].map(({ icon, color, title, desc }) => (
            <div
              key={title}
              className="flex flex-col items-start gap-3 px-5 py-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                ${color === 'violet' ? 'bg-violet-500/15 text-violet-400' : ''}
                ${color === 'emerald' ? 'bg-emerald-500/15 text-emerald-400' : ''}
                ${color === 'blue' ? 'bg-blue-500/15 text-blue-400' : ''}
              `}>
                {icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-white/75">{title}</p>
                <p className="text-xs text-white/30 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 푸터 */}
      <footer className="relative z-10 flex items-center justify-center px-8 py-5 border-t border-white/[0.04]">
        <p className="text-xs text-white/20">MP3 · WAV · 최대 200MB</p>
      </footer>
    </main>
  )
}
