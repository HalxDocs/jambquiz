import { HugeiconsIcon } from '@hugeicons/react'
import {
  BookOpen01Icon, ChartLineData01Icon, Notification01Icon,
  RankingIcon, UserGroupIcon, CreditCardIcon,
  Clock01Icon, Target01Icon, ArrowRight01Icon,
  MedalFirstPlaceIcon, StarIcon, CheckmarkCircle02Icon,
  PlayCircleIcon,
} from '@hugeicons/core-free-icons'
import SEO from '../components/seo/SEO'

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "274Lab",
  "description": "JAMB Weekly Quiz and revision platform. 274 days to identify weaknesses and ace JAMB.",
  "url": "https://fitness-gym-fc040.web.app",
}

function DashboardMockup() {
  return (
    <div className="relative w-full max-w-[320px]">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 via-orange-400/10 to-transparent rounded-[3rem] blur-3xl scale-110" />

      <div className="relative bg-[#111] rounded-[2.5rem] p-[6px] shadow-2xl shadow-black/40 ring-1 ring-white/10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#111] rounded-b-2xl z-10" />

        <div className="bg-[#F8F8F7] rounded-[2rem] overflow-hidden pt-7">
          <div className="px-5 pb-2 flex justify-between items-center">
            <span className="text-[9px] text-[#555] font-label font-semibold">9:41</span>
            <div className="flex items-center gap-1">
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><rect x="0" y="4" width="2" height="4" rx="0.5" fill="#111" opacity="0.3"/><rect x="3" y="2.5" width="2" height="5.5" rx="0.5" fill="#111" opacity="0.5"/><rect x="6" y="1" width="2" height="7" rx="0.5" fill="#111" opacity="0.7"/><rect x="9" y="0" width="2" height="8" rx="0.5" fill="#111"/></svg>
              <div className="w-5 h-2.5 border border-[#111] rounded-[3px] relative"><div className="absolute inset-[1.5px] bg-green-500 rounded-[1px]" style={{width:'70%'}} /></div>
            </div>
          </div>

          <div className="px-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[8px] text-[#888] font-label uppercase tracking-[0.15em]">Welcome back</p>
                <p className="text-[13px] font-bold text-[#111] font-display leading-tight">Chukwuemeka</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[6px] px-1.5 py-[2px] bg-green-100 text-green-700 rounded-full font-bold font-label flex items-center gap-0.5">
                    <HugeiconsIcon icon={StarIcon} size={7} color="currentColor" /> ELITE
                  </span>
                  <span className="text-[7px] text-[#AAA] font-label">32 sessions</span>
                </div>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
                <HugeiconsIcon icon={MedalFirstPlaceIcon} size={16} color="white" />
              </div>
            </div>

            <div className="bg-[#111] rounded-2xl p-3 mb-2.5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[7px] text-[#666] font-label uppercase tracking-wider">Total Score</p>
                  <p className="text-[20px] font-bold text-white font-display leading-none">312<span className="text-[10px] text-[#555]">/400</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[7px] text-[#666] font-label uppercase tracking-wider">Rank</p>
                  <div className="flex items-center gap-1">
                    <HugeiconsIcon icon={MedalFirstPlaceIcon} size={12} color="#F59E0B" />
                    <p className="text-[16px] font-bold text-yellow-400 font-display">#3</p>
                  </div>
                </div>
              </div>
              <div className="w-full bg-[#222] rounded-full h-1.5 mb-1.5">
                <div className="bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 h-1.5 rounded-full" style={{ width: '78%' }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[7px] text-[#555] font-label">78% of 400</span>
                <span className="text-[7px] text-green-400 font-label flex items-center gap-0.5">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={7} color="currentColor" /> 4/4 subjects done
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2.5">
              {[
                { name: 'Mathematics', abbr: 'MTH', pct: 85, color: 'from-green-400 to-emerald-500', trend: '+8' },
                { name: 'Physics', abbr: 'PHY', pct: 72, color: 'from-blue-400 to-cyan-500', trend: '+5' },
                { name: 'Chemistry', abbr: 'CHM', pct: 65, color: 'from-purple-400 to-violet-500', trend: '+12' },
                { name: 'English', abbr: 'ENG', pct: 90, color: 'from-amber-400 to-orange-500', trend: '+3' },
              ].map((s) => (
                <div key={s.name} className="bg-white rounded-xl p-2.5 border border-[#EBEBEB]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[7px] font-bold text-[#888] font-label">{s.abbr}</span>
                    <span className="text-[6px] text-green-600 font-bold font-label">+{s.trend}</span>
                  </div>
                  <p className="text-[14px] font-bold text-[#111] font-display leading-none">{s.pct}<span className="text-[8px] text-[#CCC]">%</span></p>
                  <div className="mt-1.5 w-full bg-[#F3F3F2] rounded-full h-[3px]">
                    <div className={`bg-gradient-to-r ${s.color} h-[3px] rounded-full transition-all`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-[#111] to-[#222] rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[8px] text-[#888] font-label uppercase tracking-wider">Next Quiz</p>
                <p className="text-[10px] font-bold text-white font-display">Friday 5:00 PM</p>
              </div>
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                <HugeiconsIcon icon={PlayCircleIcon} size={16} color="white" />
              </div>
            </div>
          </div>

          <div className="bg-white border-t border-[#EBEBEB] px-4 py-2 flex justify-between items-center">
            {[
              { icon: BookOpen01Icon, label: 'Home', active: true },
              { icon: ChartLineData01Icon, label: 'Scores', active: false },
              { icon: RankingIcon, label: 'Ranks', active: false },
              { icon: Notification01Icon, label: 'Alerts', active: false },
            ].map((n) => (
              <div key={n.label} className="flex flex-col items-center gap-0.5">
                <HugeiconsIcon icon={n.icon} size={14} color={n.active ? '#111' : '#CCC'} />
                <span className={`text-[6px] font-label font-semibold ${n.active ? 'text-[#111]' : 'text-[#CCC]'}`}>{n.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute top-8 -right-6 bg-white rounded-2xl px-3 py-2 shadow-xl shadow-black/10 border border-[#EBEBEB] z-20">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center">
            <HugeiconsIcon icon={Target01Icon} size={12} color="#16A34A" />
          </div>
          <div>
            <p className="text-[8px] font-bold text-green-600 font-label">+12 today</p>
            <p className="text-[6px] text-[#AAA] font-label">Best streak</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-16 -left-6 bg-white rounded-2xl px-3 py-2 shadow-xl shadow-black/10 border border-[#EBEBEB] z-20">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
            <HugeiconsIcon icon={Clock01Icon} size={12} color="#2563EB" />
          </div>
          <div>
            <p className="text-[8px] font-bold text-[#111] font-label">Week 3 active</p>
            <p className="text-[6px] text-[#AAA] font-label">23 weeks left</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home({ setView, setHomeMode }) {
  return (
    <>
      <SEO title="Home" jsonLd={ORG_JSONLD} />
    <div className="min-h-screen bg-white">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#EBEBEB]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#111] rounded-lg flex items-center justify-center">
              <span className="text-xs font-bold text-white font-display leading-none">274</span>
            </div>
            <span className="text-sm font-bold text-[#111] font-display hidden sm:block">274Lab</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-xs text-[#666] hover:text-[#111] font-label transition-colors">Features</a>
            <a href="#how-it-works" className="text-xs text-[#666] hover:text-[#111] font-label transition-colors">How it Works</a>
          </div>
          <button
            onClick={() => setView('home')}
            className="bg-[#111] text-white text-xs font-bold font-label px-4 py-2 rounded-lg hover:bg-[#222] transition-colors"
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-24 pb-12 sm:pt-32 sm:pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-[#F3F3F2] rounded-full px-3 py-1.5 mb-6">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[11px] font-semibold text-[#666] font-label">Week 3 is live — Fri & Sat 5PM</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#111] font-display leading-[1.15] tracking-tight">
                Ace JAMB with<br />
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">274 days</span> of<br />
                smart practice
              </h1>
              <p className="mt-5 text-sm sm:text-base text-[#666] font-body leading-relaxed max-w-lg mx-auto lg:mx-0">
                Weekly mock tests, real-time leaderboards, and targeted revision — everything you need to identify weaknesses and fix them before the real exam.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
          <button
            onClick={() => { setHomeMode?.('register'); setView('home') }}
            className="bg-[#111] text-white text-sm font-bold font-display px-6 py-3 rounded-xl hover:bg-[#222] active:scale-[0.98] transition-all"
          >
            Start Free
          </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('how-it-works')
                    el?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="bg-white border border-[#E5E5E5] text-[#555] text-sm font-bold font-label px-6 py-3 rounded-xl hover:border-[#111] hover:text-[#111] transition-all"
                >
                  See How it Works
                </button>
              </div>
              <div className="mt-8 flex items-center gap-6 justify-center lg:justify-start">
                <div>
                  <p className="text-lg font-bold text-[#111] font-display">2,400+</p>
                  <p className="text-[10px] text-[#888] font-label">Students</p>
                </div>
                <div className="w-px h-8 bg-[#EBEBEB]" />
                <div>
                  <p className="text-lg font-bold text-[#111] font-display">12,000+</p>
                  <p className="text-[10px] text-[#888] font-label">Tests Taken</p>
                </div>
                <div className="w-px h-8 bg-[#EBEBEB]" />
                <div>
                  <p className="text-lg font-bold text-[#111] font-display">98%</p>
                  <p className="text-[10px] text-[#888] font-label">Improvement</p>
                </div>
              </div>
            </div>
            <div className="flex-1 flex justify-center">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-16 sm:py-20 bg-[#F8F8F7]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-2">Features</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111] font-display">Everything you need to score higher</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: BookOpen01Icon, title: 'Weekly Mock Tests', desc: 'Every Friday & Saturday at 5PM. Real JAMB-style questions with instant grading.', color: 'bg-blue-50 text-blue-600' },
              { icon: RankingIcon, title: 'Live Leaderboard', desc: 'Compete with thousands of students. Track your rank and consistency in real time.', color: 'bg-amber-50 text-amber-600' },
              { icon: ChartLineData01Icon, title: 'Weak Spot Analysis', desc: 'Automatically identifies your weak subjects and serves targeted revision content.', color: 'bg-purple-50 text-purple-600' },
              { icon: Notification01Icon, title: 'Smart Notifications', desc: 'Daily key points and reminders delivered via push notifications and SMS.', color: 'bg-green-50 text-green-600' },
              { icon: UserGroupIcon, title: 'Accountability Partners', desc: 'Add parents or teachers who receive your weekly performance reports via SMS.', color: 'bg-orange-50 text-orange-600' },
              { icon: CreditCardIcon, title: 'Patch & Retake', desc: 'Activate Patches mode to revisit weak topics and retake missed questions.', color: 'bg-red-50 text-red-600' },
            ].map((f) => (
              <div key={f.title} className="bg-white border border-[#EBEBEB] rounded-2xl p-5 hover:shadow-md hover:border-[#D5D5D5] transition-all">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.color}`}>
                  <HugeiconsIcon icon={f.icon} size={20} color="currentColor" />
                </div>
                <h3 className="text-sm font-bold text-[#111] font-display mt-3">{f.title}</h3>
                <p className="text-xs text-[#666] font-body leading-relaxed mt-1.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold text-[#888] uppercase tracking-[0.2em] font-label mb-2">How it Works</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111] font-display">Three steps to JAMB success</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { icon: CheckmarkCircle02Icon, title: 'Register Free', desc: 'Create your account in 30 seconds. Choose your subjects and set your JAMB year.' },
              { icon: Clock01Icon, title: 'Take Weekly Tests', desc: 'Every Friday & Saturday at 5PM. 4 subjects, 100 questions each, timed and graded.' },
              { icon: Target01Icon, title: 'Improve & Repeat', desc: 'Get instant feedback, track weak spots, and use Patches to retake until you master it.' },
            ].map((s) => (
              <div key={s.title} className="text-center">
                <div className="w-12 h-12 bg-[#111] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <HugeiconsIcon icon={s.icon} size={22} color="white" />
                </div>
                <h3 className="text-sm font-bold text-[#111] font-display">{s.title}</h3>
                <p className="text-xs text-[#666] font-body leading-relaxed mt-2 max-w-xs mx-auto">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 sm:py-20 bg-[#F8F8F7]">
        <div className="max-w-lg mx-auto px-4 text-center">
          <p className="text-lg font-bold text-[#111] font-display mb-1">Ready to start?</p>
          <p className="text-xs text-[#555] font-label mb-5">Join students preparing the smart way.</p>
          <button
            onClick={() => { setHomeMode?.('register'); setView('home') }}
            className="bg-[#111] text-white rounded-xl px-8 py-3.5 text-sm font-bold font-display hover:bg-[#222] active:scale-[0.98] transition-all inline-flex items-center gap-2"
          >
            Create Your Account
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="currentColor" />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 border-t border-[#EBEBEB]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#111] rounded-md flex items-center justify-center">
              <span className="text-[8px] font-bold text-white font-display leading-none">274</span>
            </div>
            <span className="text-xs text-[#888] font-label">Supported by A.M.C</span>
          </div>
          <p className="text-[10px] text-[#AAA] font-label">contact@274lab.com</p>
        </div>
      </footer>
    </div>
    </>
  )
}
