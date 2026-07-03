import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BookOpen01Icon, ChartLineData01Icon, Notification01Icon,
  RankingIcon, CreditCardIcon,
  Clock01Icon, Target01Icon, ArrowRight01Icon,
  MedalFirstPlaceIcon, StarIcon, CheckmarkCircle02Icon,
  PlayCircleIcon, Rocket01Icon,
  Mail01Icon, HeartAddIcon,
} from '@hugeicons/core-free-icons'
import SEO from '../components/seo/SEO'

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "274Lab",
  "description": "JAMB Weekly Quiz and revision platform. 274 days to identify weaknesses and ace JAMB.",
  "url": "https://fitness-gym-fc040.web.app",
}

/* ───────────────────────────────────────────────
   Real Dashboard Mockup (mobile-first, max-w-sm)
   ─────────────────────────────────────────────── */
const WEEKS_MOCK = Array.from({ length: 26 }, (_, i) => `Week ${i + 1}`)

function GoldMedalS() {
  return (
    <svg width="16" height="26" viewBox="0 0 24 38" fill="none">
      <path d="M4 0H20V13L12 9L4 13Z" fill="url(#gld-ribbon-s)" />
      <rect x="8" y="10.5" width="8" height="5" rx="2" fill="#C68A00" />
      <rect x="11" y="15" width="2" height="3" fill="#B8760A" />
      <circle cx="12" cy="28" r="9.5" fill="#7A4E00" />
      <circle cx="12" cy="28" r="9" fill="#B87010" />
      <circle cx="12" cy="28" r="8.2" fill="url(#gld-coin-s)" />
      <circle cx="12" cy="28" r="6.1" fill="none" stroke="#8B5E00" strokeWidth="1" opacity="0.6" />
      <ellipse cx="8.8" cy="24.5" rx="3.2" ry="2.2" fill="white" opacity="0.26" />
      <polygon points="12,24.5 12.9,26.7 15.3,26.9 13.5,28.5 14.1,30.8 12,29.6 9.9,30.8 10.5,28.5 8.7,26.9 11.1,26.7" fill="#7A4E00" opacity="0.82" />
    </svg>
  )
}

function AshMedalS() {
  return (
    <svg width="16" height="26" viewBox="0 0 24 38" fill="none">
      <path d="M4 0H20V13L12 9L4 13Z" fill="url(#ash-ribbon-s)" />
      <rect x="8" y="10.5" width="8" height="5" rx="2" fill="#242424" />
      <rect x="11" y="15" width="2" height="3" fill="#1A1A1A" />
      <circle cx="12" cy="28" r="9.5" fill="#0A0A0A" />
      <circle cx="12" cy="28" r="9" fill="#1C1C1C" />
      <circle cx="12" cy="28" r="8.2" fill="url(#ash-coin-s)" />
      <circle cx="12" cy="28" r="6.1" fill="none" stroke="#3A3A3A" strokeWidth="1" opacity="0.5" />
      <ellipse cx="8.8" cy="24.5" rx="3.2" ry="2.2" fill="white" opacity="0.07" />
      <polygon points="12,24.5 12.9,26.7 15.3,26.9 13.5,28.5 14.1,30.8 12,29.6 9.9,30.8 10.5,28.5 8.7,26.9 11.1,26.7" fill="#3A3A3A" opacity="0.5" />
    </svg>
  )
}

function RealDashboardMockup() {
  const [mockPct, setMockPct] = useState(50)
  useEffect(() => {
    const t = setInterval(() => setMockPct((p) => (p >= 91 ? 42 : p + 7)), 800)
    return () => clearInterval(t)
  }, [])

  const mockMedals = Array.from({ length: 26 }, (_, i) => i < 15)

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative mx-auto max-w-sm"
    >
      <div className="absolute -inset-10 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent rounded-[3rem] blur-[80px] pointer-events-none" />

      <div className="relative bg-[#0A0A0A] rounded-[2.5rem] overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_40px_80px_-15px_rgba(0,0,0,0.6),0_8px_24px_-6px_rgba(0,0,0,0.3)]">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-[#0A0A0A] rounded-b-2xl z-10 flex items-center justify-center gap-2">
          <div className="w-14 h-1.5 bg-white/10 rounded-full" />
        </div>

        {/* Content */}
        <div className="px-4 pt-8 pb-4">
          {/* ── Header ── */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.2em] font-label">Welcome back</p>
              <h2 className="text-lg font-bold text-[#EDEDED] font-display leading-tight">Chukwuemeka</h2>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[9px] text-neutral-500 font-label">Consistency Rank</span>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-purple-300 bg-purple-950 px-2 py-0.5 rounded-full font-label tracking-widest border border-purple-800">
                  <span className="text-[8px]">⚡</span>CADET
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-3 h-[18px] rounded-[2px] bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.4)]" />
                <div className="w-3 h-[18px] rounded-[2px] bg-yellow-100/30" />
                <div className="w-3 h-[18px] rounded-[2px] bg-red-100/30" />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <HugeiconsIcon icon={StarIcon} size={16} color="white" />
              </div>
              <div className="w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#0A0A0A] -mt-2.5 mr-4" />
            </div>
          </div>

          {/* ── MedalTrack ── */}
          <div className="mb-4">
            <svg aria-hidden style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
              <defs>
                <linearGradient id="gld-ribbon-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFD740" /><stop offset="100%" stopColor="#C57F00" /></linearGradient>
                <radialGradient id="gld-coin-s" cx="38%" cy="30%" r="72%"><stop offset="0%" stopColor="#FFF8CC" /><stop offset="45%" stopColor="#F5C518" /><stop offset="100%" stopColor="#A86000" /></radialGradient>
                <linearGradient id="ash-ribbon-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3E3E3E" /><stop offset="100%" stopColor="#181818" /></linearGradient>
                <radialGradient id="ash-coin-s" cx="38%" cy="30%" r="72%"><stop offset="0%" stopColor="#5E5E5E" /><stop offset="100%" stopColor="#111111" /></radialGradient>
              </defs>
            </svg>
            {[WEEKS_MOCK.slice(0, 9), WEEKS_MOCK.slice(9, 18), WEEKS_MOCK.slice(18)].map((row, ri) => (
              <div key={ri} className="flex justify-between">
                {row.map((w, i) => {
                  const idx = ri * 9 + i
                  return (
                    <div key={w} className="flex flex-col items-center flex-1 max-w-[10%]">
                      <span className="text-[6px] text-neutral-600 font-label mb-0.5">{w.replace('Week ', '')}</span>
                      {mockMedals[idx] ? <GoldMedalS /> : <AshMedalS />}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* ── ScoreHero ── */}
          <div className="bg-[#1A1A1A] text-white rounded-2xl p-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[9px] font-semibold text-white/40 uppercase tracking-[0.2em] font-label mb-1">Total Score</p>
                <div className="flex items-end gap-1.5">
                  <span className="text-3xl font-bold font-display">{Math.round(mockPct * 3.12)}</span>
                  <span className="text-white/40 text-xs mb-1 font-label">/ 400</span>
                </div>
              </div>
              <button className="text-[10px] font-semibold text-white/40 hover:text-white transition-colors font-label mt-1">View →</button>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 mt-3">
              <motion.div
                className="bg-white h-1.5 rounded-full"
                animate={{ width: `${mockPct}%` }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <p className="text-[9px] text-white/30 font-label">{mockPct}%</p>
              <p className="text-[9px] font-semibold text-green-400 font-label">Strong</p>
            </div>
          </div>

          {/* ── Subject Cards (2-column) ── */}
          <div className="mb-3">
            <p className="text-xs font-bold text-[#EDEDED] font-display mb-2">My Subjects</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Mathematics', pct: 78 },
                { name: 'Physics', pct: 65 },
                { name: 'Chemistry', pct: 42 },
                { name: 'English', pct: 88 },
              ].map((s) => {
                const barColor = s.pct >= 70 ? 'bg-green-500' : s.pct >= 50 ? 'bg-yellow-500' : 'bg-red-400'
                const pillBg = s.pct >= 70 ? 'bg-green-900/60 text-green-400' : s.pct >= 50 ? 'bg-yellow-900/60 text-yellow-400' : 'bg-red-900/60 text-red-400'
                return (
                  <div key={s.name} className="bg-[#161616] border border-[#2A2A2A] rounded-xl p-3 text-left">
                    <p className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wide font-label mb-1">Subject</p>
                    <p className="text-[11px] font-bold text-[#EDEDED] leading-snug font-body mb-2">{s.name}</p>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${pillBg} font-label`}>{s.pct}%</span>
                      <span className="text-[9px] text-neutral-600 font-label">→</span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-1">
                      <div className={`${barColor} h-1 rounded-full`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── QuizCard ── */}
          <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl p-4 mb-3">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs font-bold text-[#EDEDED] font-display">This Week's Quiz</p>
              <span className="text-[10px] font-semibold text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-lg font-label">Week 4</span>
            </div>
            <p className="text-[10px] text-neutral-500 mb-2 font-label">Next quiz in</p>
            <div className="flex gap-2 mb-2">
              <div><span className="text-xl font-bold text-[#EDEDED] font-display">1</span><span className="text-[10px] text-neutral-500 ml-0.5 font-label">d</span></div>
              <div><span className="text-xl font-bold text-[#EDEDED] font-display">16</span><span className="text-[10px] text-neutral-500 ml-0.5 font-label">hr</span></div>
              <div><span className="text-xl font-bold text-[#EDEDED] font-display">42</span><span className="text-[10px] text-neutral-500 ml-0.5 font-label">min</span></div>
            </div>
            <p className="text-[10px] text-neutral-600 font-label">Fri & Sat · 5:00 pm – 6:00 pm login window</p>
          </div>

          {/* ── Bottom Nav ── */}
          <div className="flex gap-2">
            <button className="flex-1 bg-[#161616] border border-[#2A2A2A] rounded-xl py-2.5 text-[11px] text-neutral-400 hover:text-[#EDEDED] transition-colors font-label">My Results</button>
            <button className="flex-1 bg-[#161616] border border-[#2A2A2A] rounded-xl py-2.5 text-[11px] text-neutral-400 hover:text-[#EDEDED] transition-colors font-label">🏆 Leaderboard</button>
            <button className="flex-1 bg-[#161616] border border-[#2A2A2A] rounded-xl py-2.5 text-[11px] text-neutral-400 hover:text-[#EDEDED] transition-colors font-label inline-flex items-center justify-center gap-1"><HugeiconsIcon icon={Mail01Icon} size={12} color="currentColor" /> Contact</button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ───────────────────────────────────────────────
   Reusable Feature Card
   ─────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, color, index }) {
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 hover:bg-neutral-800/50 hover:border-neutral-700 transition-all duration-300"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <HugeiconsIcon icon={icon} size={20} color="currentColor" />
      </div>
      <h3 className="text-sm font-bold text-white font-display">{title}</h3>
      <p className="text-xs text-neutral-400 font-body leading-relaxed mt-1.5">{desc}</p>
    </motion.div>
  )
}

/* ───────────────────────────────────────────────
   Section Heading
   ─────────────────────────────────────────────── */
function SectionHeading({ label, title, subtitle }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5 }}
      className="text-center mb-12"
    >
      <span className="inline-block text-[10px] font-semibold text-neutral-500 uppercase tracking-[0.25em] font-label mb-3">
        {label}
      </span>
      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white font-display tracking-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-sm text-neutral-400 font-body max-w-md mx-auto">{subtitle}</p>
      )}
    </motion.div>
  )
}

/* ───────────────────────────────────────────────
   Main Home Component
   ─────────────────────────────────────────────── */
export default function Home({ setView, setHomeMode }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <SEO title="274Lab — Ace JAMB with Weekly Mock Tests" jsonLd={ORG_JSONLD} />

      <div className="min-h-screen bg-neutral-950 text-white font-body overflow-x-hidden selection:bg-amber-500/30">
        {/* ── Ambient glow ── */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-amber-500/5 rounded-full blur-[120px]" />
          <div className="absolute top-[500px] right-0 w-[400px] h-[400px] bg-orange-500/4 rounded-full blur-[100px]" />
          <div className="absolute top-[1000px] left-0 w-[500px] h-[500px] bg-violet-500/4 rounded-full blur-[100px]" />
        </div>

        {/* ─── Dark Liquid Glass Navbar ─── */}
        <motion.nav
          animate={{
            height: scrolled ? 46 : 56,
            maxWidth: scrolled ? '480px' : '720px',
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed top-4 left-0 right-0 mx-auto z-50 bg-black/60 backdrop-blur-2xl border border-white/10 shadow-lg shadow-black/30 rounded-[2rem] px-5 flex items-center justify-between"
        >
          <motion.a
            href="#"
            animate={{ scale: scrolled ? 0.9 : 1 }}
            className="flex items-center gap-2"
          >
            <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-neutral-950 font-display leading-none">274</span>
            </div>
            <motion.span
              animate={{ opacity: scrolled ? 0 : 1, width: scrolled ? 0 : 'auto' }}
              className="text-sm font-bold text-white font-display overflow-hidden whitespace-nowrap"
            >
              274Lab
            </motion.span>
          </motion.a>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-xs text-neutral-400 hover:text-white font-label transition-colors">Features</a>
            <a href="#pricing" className="text-xs text-neutral-400 hover:text-white font-label transition-colors">Pricing</a>
          </div>

          <button
            onClick={() => setView('home')}
            className="bg-white text-neutral-950 text-xs font-bold font-label px-4 py-1.5 rounded-full hover:bg-neutral-200 active:scale-95 transition-all whitespace-nowrap"
          >
            Sign In
          </button>
        </motion.nav>

        {/* ─── Hero ─── */}
        <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-center max-w-3xl mx-auto"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-full px-3.5 py-1.5 mb-6 shadow-sm"
              >
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-semibold text-neutral-300 font-label">
                  Week 4 is live — Friday & Saturday 5PM
                </span>
              </motion.div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-white font-display leading-[1.05] tracking-tight">
                Ace JAMB with{' '}
                <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
                  274 days
                </span>
                <br />
                of smart practice
              </h1>

              <p className="mt-5 text-sm sm:text-base text-neutral-400 font-body leading-relaxed max-w-xl mx-auto">
                Weekly mock tests, real-time leaderboards, and targeted revision — everything you need to identify weaknesses and fix them before the real exam.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setHomeMode?.('register'); setView('home') }}
                  className="bg-white text-neutral-950 text-sm font-bold font-display px-7 py-3 rounded-xl shadow-lg shadow-black/30 hover:bg-neutral-200 transition-all"
                >
                  Start Free
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-sm font-bold font-label px-7 py-3 rounded-xl hover:border-neutral-600 hover:text-white transition-all"
                >
                  See Features
                </motion.button>
              </div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-10 flex items-center justify-center gap-8"
              >
                {[
                  { val: '2,400+', lab: 'Students' },
                  { val: '12,000+', lab: 'Tests Taken' },
                  { val: '98%', lab: 'Improvement' },
                ].map((s, i) => (
                  <div key={s.lab} className="text-center">
                    <p className="text-lg sm:text-xl font-bold text-white font-display">{s.val}</p>
                    <p className="text-[10px] text-neutral-500 font-label mt-0.5">{s.lab}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <div className="mt-14 sm:mt-20">
              <RealDashboardMockup />
            </div>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className="relative py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <SectionHeading
              label="Features"
              title="Everything you need to score higher"
              subtitle="Built specifically for JAMB candidates who want to track progress and improve week over week."
            />

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: BookOpen01Icon, title: 'Weekly Mock Tests', desc: 'Every Friday & Saturday at 5PM. Real JAMB-style questions with instant grading and detailed feedback.', color: 'bg-amber-500/10 text-amber-400' },
                { icon: Target01Icon, title: 'Weak Spot Analysis', desc: 'Automatically identifies your weak subjects and serves targeted revision content until you improve.', color: 'bg-purple-500/10 text-purple-400' },
                { icon: HeartAddIcon, title: 'Expert Mentorship', desc: 'Add parents or teachers as accountability partners. They receive weekly SMS reports on your progress.', color: 'bg-blue-500/10 text-blue-400' },
                { icon: RankingIcon, title: 'Live Leaderboard', desc: 'Compete with thousands of students. Track your rank, consistency, and improvement in real time.', color: 'bg-emerald-500/10 text-emerald-400' },
                { icon: Notification01Icon, title: 'Smart Notifications', desc: 'Daily key points and quiz reminders via push notifications and SMS. Never miss a test.', color: 'bg-rose-500/10 text-rose-400' },
                { icon: StarIcon, title: 'Patch & Retake', desc: 'Activate Patches mode to revisit weak topics, retake missed questions, and lock in your knowledge.', color: 'bg-orange-500/10 text-orange-400' },
              ].map((f, i) => (
                <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} color={f.color} index={i} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── Pricing ─── */}
        <section id="pricing" className="relative py-20 sm:py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <SectionHeading
              label="Pricing"
              title="Start for free, upgrade when ready"
              subtitle="No hidden fees. All core features are free — premium mentorship and SMS reports are optional."
            />

            <div className="grid sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
              {/* Free */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5 }}
                className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 flex flex-col"
              >
                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest font-label mb-1">Free</p>
                <p className="text-3xl font-bold text-white font-display">
                  <span className="text-lg text-neutral-500 font-label font-normal">₦</span>0
                </p>
                <p className="text-[10px] text-neutral-600 font-label mt-1">Forever free</p>
                <ul className="mt-5 space-y-2.5 flex-1">
                  {['Weekly mock tests', 'Instant grading', 'Live leaderboard', 'Basic progress tracking'].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-neutral-300 font-label">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} color="#16A34A" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => { setHomeMode?.('register'); setView('home') }}
                  className="mt-6 w-full bg-neutral-800 text-white text-[11px] font-bold font-label py-2.5 rounded-xl hover:bg-neutral-700 transition-all"
                >
                  Get Started
                </button>
              </motion.div>

              {/* Premium */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="relative bg-gradient-to-b from-neutral-800 to-neutral-900 border border-amber-600/30 rounded-2xl p-6 flex flex-col shadow-xl shadow-amber-500/5"
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] font-bold font-label px-3 py-1 rounded-full uppercase tracking-wider">
                  Popular
                </div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest font-label mb-1">Premium</p>
                <p className="text-3xl font-bold text-white font-display">
                  <span className="text-lg text-neutral-400 font-label font-normal">₦</span>800
                  <span className="text-xs text-neutral-500 font-label font-normal">/week</span>
                </p>
                <p className="text-[10px] text-neutral-500 font-label mt-1">Cancel anytime</p>
                <ul className="mt-5 space-y-2.5 flex-1">
                  {[
                    'Everything in Free',
                    'SMS accountability reports',
                    'Expert mentor pairing',
                    'Priority support',
                    'Patches mode',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-neutral-200 font-label">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} color="#F59E0B" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => { setHomeMode?.('register'); setView('home') }}
                  className="mt-6 w-full bg-white text-neutral-950 text-[11px] font-bold font-label py-2.5 rounded-xl hover:bg-neutral-200 transition-all"
                >
                  Join Premium
                </button>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ─── Bottom CTA ─── */}
        <section className="relative py-16 sm:py-24">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="w-12 h-12 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <HugeiconsIcon icon={Rocket01Icon} size={22} color="white" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">
                Ready to ace JAMB?
              </h2>
              <p className="mt-3 text-sm text-neutral-400 font-body max-w-sm mx-auto">
                Join thousands of students already preparing the smart way. Start today — it's free.
              </p>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setHomeMode?.('register'); setView('home') }}
                className="mt-8 bg-white text-neutral-950 rounded-xl px-10 py-3.5 text-sm font-bold font-display shadow-lg shadow-black/30 hover:bg-neutral-200 transition-all inline-flex items-center gap-2"
              >
                Create Your Account
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="currentColor" />
              </motion.button>
            </motion.div>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-neutral-800 py-8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
                  <span className="text-[7px] font-bold text-neutral-950 font-display leading-none">274</span>
                </div>
                <span className="text-xs font-semibold text-white font-label">274Lab</span>
              </div>
              <div className="flex items-center gap-6">
                <a href="mailto:contact@274lab.com" className="text-[10px] text-neutral-500 hover:text-neutral-300 font-label transition-colors flex items-center gap-1.5">
                  <HugeiconsIcon icon={Mail01Icon} size={12} color="currentColor" />
                  contact@274lab.com
                </a>
              </div>
              <p className="text-[9px] text-neutral-600 font-label">
                &copy; {new Date().getFullYear()} 274Lab. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          animation: gradient-shift 4s ease infinite;
        }
      `}</style>
    </>
  )
}
