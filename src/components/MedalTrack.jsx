import { WEEKS } from '../store/useStore'

function MedalCell({ week, medal, isPast, isCurrent }) {
  return (
    <div
      title={`${week}${medal ? ` — ${medal}` : isPast ? ' — Missed' : ''}`}
      className={`flex flex-col items-center flex-1 max-w-[10%] ${
        medal || isCurrent ? '' : isPast ? 'opacity-40' : 'opacity-15'
      }`}
    >
      <span className="text-[8px] text-[#666] font-label mb-0.5 hidden sm:block truncate w-full text-center">
        {week.replace('Week ', '')}
      </span>
      <div
        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-sm sm:text-base ${
          medal ? 'border-2 border-opacity-50' : isCurrent ? 'bg-[#2A2A2A] border border-[#555]' : 'bg-[#222] border border-[#333]'
        } ${
          medal === '🥇' ? 'bg-yellow-400/30 border-yellow-400' : medal === '🥈' ? 'bg-gray-300/30 border-gray-400' : medal === '🥉' ? 'bg-amber-600/30 border-amber-500' : ''
        }`}
      >
        {medal && <span>{medal}</span>}
        {!medal && isPast && <span className="text-[8px] text-[#555]">●</span>}
      </div>
      <div
        className={`w-full max-w-[20px] sm:max-w-[26px] h-1 rounded-sm mt-0.5 ${
          medal === '🥇' ? 'bg-yellow-500' : medal === '🥈' ? 'bg-gray-400' : medal === '🥉' ? 'bg-amber-700' : isCurrent ? 'bg-[#555]' : 'bg-[#333]'
        }`}
      />
    </div>
  )
}

export default function MedalTrack({ weeklyMedals, currentWeekIdx }) {
  return (
    <div className="space-y-2">
      {[WEEKS.slice(0, 9), WEEKS.slice(9, 18), WEEKS.slice(18)].map((row, rowIdx) => (
        <div key={rowIdx} className="flex justify-between">
          {row.map((week, i) => {
            const idx = rowIdx * 9 + i
            return (
              <MedalCell
                key={week}
                week={week}
                medal={weeklyMedals[idx]}
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
