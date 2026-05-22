import { WEEKS } from '../../store/useStore'

// 5-pointed star centered at (12, 28), outer r=3.5, inner r=1.6
const STAR = '12,24.5 12.9,26.7 15.3,26.9 13.5,28.5 14.1,30.8 12,29.6 9.9,30.8 10.5,28.5 8.7,26.9 11.1,26.7'

function GoldMedal() {
  return (
    <svg width="24" height="38" viewBox="0 0 24 38" fill="none">
      {/* V-fold ribbon — pennant shape */}
      <path d="M4 0H20V13L12 9L4 13Z" fill="url(#gld-ribbon)" />
      {/* Center fold crease on ribbon */}
      <line x1="12" y1="0" x2="12" y2="9" stroke="#7A4E00" strokeWidth="0.7" opacity="0.4" />
      {/* Side sheen on ribbon */}
      <path d="M4 0H8V12L4 13Z" fill="white" opacity="0.07" />

      {/* Clasp bar */}
      <rect x="8" y="10.5" width="8" height="5" rx="2" fill="#C68A00" />
      <rect x="8" y="10.5" width="8" height="2" rx="1.5" fill="#FFE27A" opacity="0.45" />

      {/* Connector pin */}
      <rect x="11" y="15" width="2" height="3" fill="#B8760A" />

      {/* Outer bevel ring — creates 3-D raised edge */}
      <circle cx="12" cy="28" r="9.5" fill="#7A4E00" />
      {/* Second bevel layer */}
      <circle cx="12" cy="28" r="9" fill="#B87010" />
      {/* Coin face */}
      <circle cx="12" cy="28" r="8.2" fill="url(#gld-coin)" />
      {/* Rim highlight — polished bevel edge */}
      <circle cx="12" cy="28" r="8.2" fill="none" stroke="#FFE566" strokeWidth="0.7" opacity="0.4" />
      {/* Engraved inner ring */}
      <circle cx="12" cy="28" r="6.1" fill="none" stroke="#8B5E00" strokeWidth="1" opacity="0.6" />
      {/* Primary shine — top-left light catch */}
      <ellipse cx="8.8" cy="24.5" rx="3.2" ry="2.2" fill="white" opacity="0.26" />
      {/* Secondary micro-shine — bottom-right bounce */}
      <ellipse cx="15.2" cy="31" rx="1.2" ry="0.8" fill="white" opacity="0.09" />
      {/* Star emblem */}
      <polygon points={STAR} fill="#7A4E00" opacity="0.82" />
    </svg>
  )
}

function AshMedal() {
  return (
    <svg width="24" height="38" viewBox="0 0 24 38" fill="none">
      {/* V-fold ribbon */}
      <path d="M4 0H20V13L12 9L4 13Z" fill="url(#ash-ribbon)" />
      <line x1="12" y1="0" x2="12" y2="9" stroke="#0A0A0A" strokeWidth="0.7" opacity="0.5" />
      <path d="M4 0H8V12L4 13Z" fill="white" opacity="0.04" />

      {/* Clasp bar */}
      <rect x="8" y="10.5" width="8" height="5" rx="2" fill="#242424" />
      <rect x="8" y="10.5" width="8" height="2" rx="1.5" fill="#555" opacity="0.3" />

      {/* Connector pin */}
      <rect x="11" y="15" width="2" height="3" fill="#1A1A1A" />

      {/* Outer bevel ring */}
      <circle cx="12" cy="28" r="9.5" fill="#0A0A0A" />
      <circle cx="12" cy="28" r="9" fill="#1C1C1C" />
      {/* Coin face */}
      <circle cx="12" cy="28" r="8.2" fill="url(#ash-coin)" />
      {/* Rim highlight */}
      <circle cx="12" cy="28" r="8.2" fill="none" stroke="#555" strokeWidth="0.7" opacity="0.3" />
      {/* Engraved inner ring */}
      <circle cx="12" cy="28" r="6.1" fill="none" stroke="#3A3A3A" strokeWidth="1" opacity="0.5" />
      {/* Subtle shine */}
      <ellipse cx="8.8" cy="24.5" rx="3.2" ry="2.2" fill="white" opacity="0.07" />
      {/* Star emblem */}
      <polygon points={STAR} fill="#3A3A3A" opacity="0.5" />
    </svg>
  )
}

function MedalCell({ week, hasTaken, isPast, isCurrent }) {
  const opacity = !hasTaken && !isPast ? (isCurrent ? 0.45 : 0.15) : 1
  return (
    <div
      title={`${week}${hasTaken ? ' — Taken' : isPast ? ' — Missed' : ''}`}
      className="flex flex-col items-center flex-1 max-w-[10%]"
      style={{ opacity }}
    >
      <span className="text-[8px] text-[#666] font-label mb-0.5 hidden sm:block truncate w-full text-center">
        {week.replace('Week ', '')}
      </span>
      {hasTaken ? <GoldMedal /> : <AshMedal />}
    </div>
  )
}

export default function MedalTrack({ weeklyMedals, currentWeekIdx }) {
  return (
    <div className="relative space-y-2">
      {/* Gradient defs — one definition, referenced by all medal instances */}
      <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <linearGradient id="gld-ribbon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD740" />
            <stop offset="55%" stopColor="#F0A800" />
            <stop offset="100%" stopColor="#C57F00" />
          </linearGradient>
          <radialGradient id="gld-coin" cx="38%" cy="30%" r="72%">
            <stop offset="0%"   stopColor="#FFF8CC" />
            <stop offset="15%"  stopColor="#FFE566" />
            <stop offset="45%"  stopColor="#F5C518" />
            <stop offset="78%"  stopColor="#D4900A" />
            <stop offset="100%" stopColor="#A86000" />
          </radialGradient>
          <linearGradient id="ash-ribbon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3E3E3E" />
            <stop offset="100%" stopColor="#181818" />
          </linearGradient>
          <radialGradient id="ash-coin" cx="38%" cy="30%" r="72%">
            <stop offset="0%"   stopColor="#5E5E5E" />
            <stop offset="40%"  stopColor="#383838" />
            <stop offset="100%" stopColor="#111111" />
          </radialGradient>
        </defs>
      </svg>

      {[WEEKS.slice(0, 9), WEEKS.slice(9, 18), WEEKS.slice(18)].map((row, rowIdx) => (
        <div key={rowIdx} className="flex justify-between">
          {row.map((week, i) => {
            const idx = rowIdx * 9 + i
            return (
              <MedalCell
                key={week}
                week={week}
                hasTaken={!!weeklyMedals[idx]}
                isPast={idx < currentWeekIdx}
                isCurrent={idx === currentWeekIdx}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
