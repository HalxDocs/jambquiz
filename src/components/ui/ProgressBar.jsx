export default function ProgressBar({ value, max = 100, bg = 'bg-[#F3F3F2]', fill = 'bg-green-500', height = 'h-1.5', className = '' }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className={`w-full ${bg} rounded-full ${height} ${className}`}>
      <div className={`${fill} ${height} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}
