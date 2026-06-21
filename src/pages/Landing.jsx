import { HugeiconsIcon } from '@hugeicons/react'
import {
  BookOpen01Icon, ChartLineData01Icon, Mail01Icon, Notification01Icon,
  Rocket01Icon, ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import SEO from '../components/seo/SEO'

const FEATURES = [
  { icon: BookOpen01Icon, title: 'Weekly Quizzes', body: 'Real exam-styled questions on assigned topics every Friday and Saturday at 5pm.' },
  { icon: ChartLineData01Icon, title: 'Progress Tracking', body: 'Live scores, rankings, and consistency streaks. Know exactly where you stand.' },
  { icon: Mail01Icon, title: 'SMS Reports', body: 'Your accountability partner gets an automated weekly SMS with topic-by-topic scores.' },
  { icon: Notification01Icon, title: 'Push Reminders', body: 'Quiz countdowns, key points, and weak-topic revision alerts straight to your phone.' },
]

export default function Landing({ setView, setHomeMode, deferredPrompt, handleInstall, showIosHint }) {
  return (
    <>
      <SEO title="Home" />
      <div className="bg-[#F8F8F7]">
        {/* ─── Nav ─── */}
        <div className="border-b border-[#EBEBEB] bg-white">
          <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-[#111] rounded-xl flex flex-col items-center justify-center shadow-sm">
                <span className="text-[10px] font-bold text-white font-display leading-none tracking-tighter">274</span>
                <span className="text-[4.5px] font-bold text-white/50 font-display leading-none tracking-widest">Lab</span>
              </div>
              <span className="text-[15px] font-bold text-[#111] font-display tracking-tight">274Lab</span>
            </div>
            <button
              onClick={() => { setHomeMode('login'); setView('home') }}
              className="text-xs font-semibold text-white bg-[#111] hover:bg-[#222] px-4 py-2 rounded-xl font-label transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>

        {/* ─── Hero ─── */}
        <section className="max-w-lg mx-auto px-5 pt-14 pb-14">
          <div className="bg-[#111] rounded-3xl p-7 sm:p-9 text-center">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
              <HugeiconsIcon icon={Rocket01Icon} size={26} color="white" />
            </div>
            <h1 className="text-[28px] font-bold text-white font-display leading-tight tracking-tight mb-3">
              Ace JAMB in{' '}
              <span className="text-white/70">274 days</span>
            </h1>
            <p className="text-sm text-[#AAA] font-body leading-relaxed mb-7 max-w-sm mx-auto">
              A weekly cycle — quiz, review, patch, repeat. Know your weaknesses early and fix them before exam day.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => { setHomeMode('register'); setView('home') }}
                className="w-full bg-white text-[#111] rounded-xl py-3.5 text-sm font-bold font-display hover:bg-[#F3F3F2] active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2"
              >
                Get Started Free
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="currentColor" />
              </button>
              <button
                onClick={() => { setHomeMode('login'); setView('home') }}
                className="w-full text-sm font-bold text-white/70 hover:text-white font-label py-2 transition-colors"
              >
                Already have an account? Sign in
              </button>
            </div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section className="max-w-lg mx-auto px-5 pb-14">
          <div className="text-center mb-6">
            <p className="text-[10px] font-semibold text-[#888] tracking-[0.25em] uppercase font-label mb-1">How It Works</p>
            <h2 className="text-xl font-bold text-[#111] font-display">A Simple 3-step System</h2>
          </div>
          <div className="space-y-2.5">
            <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 flex items-start gap-3">
              <div className="w-8 h-8 bg-[#111] rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white font-display">1</div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-[#111] font-display">Diagnose</p>
                  <span className="text-[10px] font-semibold text-[#888] bg-[#F3F3F2] px-2 py-0.5 rounded font-label">Aug – Feb</span>
                </div>
                <p className="text-xs text-[#555] font-body leading-snug">Weekly tests to identify strengths and weaknesses.</p>
              </div>
            </div>
            <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 flex items-start gap-3">
              <div className="w-8 h-8 bg-[#111] rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white font-display">2</div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-[#111] font-display">Discipline</p>
                  <span className="text-[10px] font-semibold text-[#888] bg-[#F3F3F2] px-2 py-0.5 rounded font-label">Always</span>
                </div>
                <p className="text-xs text-[#555] font-body leading-snug">Choose an accountability partner.</p>
              </div>
            </div>
            <div className="bg-white border border-[#EBEBEB] rounded-xl p-4 flex items-start gap-3">
              <div className="w-8 h-8 bg-[#111] rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white font-display">3</div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-[#111] font-display">Patch</p>
                  <span className="text-[10px] font-semibold text-[#888] bg-[#F3F3F2] px-2 py-0.5 rounded font-label">Mar – Apr</span>
                </div>
                <p className="text-xs text-[#555] font-body leading-snug">Targeted key points on weak topics.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section className="bg-white border-t border-b border-[#EBEBEB]">
          <div className="max-w-lg mx-auto px-5 py-12">
            <div className="text-center mb-7">
              <p className="text-[10px] font-semibold text-[#888] tracking-[0.25em] uppercase font-label mb-1">Features</p>
              <h2 className="text-xl font-bold text-[#111] font-display">Everything you need</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-[#F8F8F7] rounded-2xl p-4 border border-[#EBEBEB]">
                  <div className="w-9 h-9 bg-white rounded-xl border border-[#E5E5E5] flex items-center justify-center mb-2.5 shadow-sm">
                    <HugeiconsIcon icon={f.icon} size={16} color="#111" />
                  </div>
                  <p className="text-xs font-bold text-[#111] font-display mb-1">{f.title}</p>
                  <p className="text-[11px] text-[#555] font-body leading-snug">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Stats ─── */}
        <section className="max-w-lg mx-auto px-5 py-10">
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { value: '11', label: 'Subjects' },
              { value: '26', label: 'Weeks' },
              { value: '17,000+', label: 'Questions' },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-[#EBEBEB] rounded-2xl py-5 shadow-sm">
                <p className="text-2xl font-bold text-[#111] font-display">{s.value}</p>
                <p className="text-[10px] text-[#888] font-label mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Install ─── */}
        {(deferredPrompt || showIosHint) && (
          <section className="max-w-lg mx-auto px-5 pb-14">
            <div className="bg-[#111] rounded-2xl p-6 text-center">
              <div className="w-11 h-11 mx-auto bg-white/10 rounded-xl flex items-center justify-center mb-3 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
                </svg>
              </div>
              <p className="text-base font-bold text-white font-display mb-1">Install the App</p>
              <p className="text-xs text-[#AAA] font-label mb-4">Add 274Lab to your home screen for quick access</p>
              {deferredPrompt ? (
                <button onClick={handleInstall}
                  className="bg-white text-[#111] rounded-xl px-7 py-2.5 text-sm font-bold font-display hover:bg-[#F3F3F2] active:scale-[0.98] transition-all inline-flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                  Install
                </button>
              ) : (
                <p className="text-xs text-[#AAA] font-label leading-relaxed">
                  Tap <strong className="text-white">Share</strong> → <strong className="text-white">"Add to Home Screen"</strong>
                </p>
              )}
            </div>
          </section>
        )}

        {/* ─── CTA ─── */}
        <section className="bg-white border-t border-[#EBEBEB]">
          <div className="max-w-lg mx-auto px-5 py-10 text-center">
            <p className="text-lg font-bold text-[#111] font-display mb-1">Ready to start?</p>
            <p className="text-xs text-[#555] font-label mb-4">Join students preparing the smart way.</p>
            <button
              onClick={() => { setHomeMode('register'); setView('home') }}
              className="bg-[#111] text-white rounded-xl px-8 py-3.5 text-sm font-bold font-display hover:bg-[#222] active:scale-[0.98] transition-all inline-flex items-center gap-2"
            >
              Create Your Account
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="currentColor" />
            </button>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="max-w-lg mx-auto px-5 py-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-5 h-5 bg-[#111] rounded flex flex-col items-center justify-center">
              <span className="text-[6px] font-bold text-white font-display leading-none tracking-tighter">274</span>
              <span className="text-[2.5px] font-bold text-white/50 font-display leading-none tracking-widest">Lab</span>
            </div>
            <span className="text-[11px] text-[#AAA] font-label">274Lab</span>
            <span className="text-[#DDD] text-[11px]">·</span>
            <span className="text-[11px] text-[#AAA] font-label">Supported by A.M.C</span>
          </div>
          <p className="text-[9px] text-[#CCC] font-label">JAMB Weekly Quiz & Revision</p>
        </footer>
      </div>
    </>
  )
}
