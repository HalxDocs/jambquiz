import { safeUrl } from '../../lib/safeUrl'

export default function TopicsList({ topics, currentWeek, theme }) {
  if (!topics.length) return null
  return (
    <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="text-sm font-bold text-[#111] font-display">Topics to Study</p>
          <p className="text-[11px] text-[#AAA] font-label mt-0.5">{currentWeek} · Prepare before the quiz</p>
        </div>
        <span className={`text-[10px] font-bold ${theme.bg} text-white px-2.5 py-1 rounded-full font-label`}>{currentWeek}</span>
      </div>
      <div className="space-y-2">
        {topics.map(({ subject, topic }) => (
          <div key={subject} className="flex items-center gap-3 py-2 border-b border-[#F3F3F2] last:border-0">
            <div className={`w-1.5 h-1.5 ${theme.bg} rounded-full shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-[#888] uppercase tracking-wide font-label leading-none mb-0.5">{subject}</p>
              <p className="text-sm font-semibold text-[#111] font-body">{topic.name}</p>
            </div>
            {topic.video && (
              <a href={safeUrl(topic.video)} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg font-label hover:bg-red-100 transition-colors">
                ▶ Watch
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
