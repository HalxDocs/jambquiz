export default function QuizTimer({ timeLeft }) {
  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  return (
    <div className={`text-sm font-bold px-3 py-1.5 rounded-xl font-display shrink-0 ${timeLeft < 300 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-[#F3F3F2] text-[#111]'}`}>
      ⏱ {fmt(timeLeft)}
    </div>
  )
}
