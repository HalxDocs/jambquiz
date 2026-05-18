export default function QuizCard({
  currentWeek,
  quizTime,
  quizDates,
  timeLeft,
  hasAttemptedAllSubjects,
  todaySubjectsAttempted,
  theme,
  onStartQuiz,
  onSubscribe,
}) {
  return (
    <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 mb-4">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm font-bold text-[#111] font-display">This Week's Quiz</p>
        <span className="text-[11px] font-semibold text-[#888] bg-[#F3F3F2] px-2.5 py-1 rounded-lg font-label">{currentWeek}</span>
      </div>

      {quizTime ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-sm font-bold text-green-700 font-display">Quiz is LIVE now</p>
          </div>
          <p className="text-xs text-[#888] mb-4 font-label">Login closes at end of window · 1 hour once started</p>
          {hasAttemptedAllSubjects ? (
            <div className="bg-[#F3F3F2] rounded-xl p-3 text-center">
              <p className="text-sm font-bold text-[#111] font-display mb-0.5">All done!</p>
              <p className="text-xs text-[#888] font-label">You've completed all subjects this week</p>
            </div>
          ) : (
            <>
              {todaySubjectsAttempted.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {todaySubjectsAttempted.map((s) => (
                    <span key={s} className={`text-[10px] font-semibold ${theme.bg} text-white px-2 py-0.5 rounded-full font-label`}>✓ {s}</span>
                  ))}
                </div>
              )}
              <button onClick={onStartQuiz} className={`w-full ${theme.bg} text-white rounded-xl py-3.5 text-sm font-bold ${theme.hoverBg} active:scale-[0.99] transition-all font-display`}>
                {todaySubjectsAttempted.length > 0 ? `Continue Quiz (${4 - todaySubjectsAttempted.length} left) →` : 'Start Quiz →'}
              </button>
            </>
          )}
        </div>
      ) : (
        <div>
          <p className="text-xs text-[#888] mb-2 font-label">Next quiz in</p>
          <div className="flex gap-3 mb-3">
            {timeLeft.days > 0 && (
              <div><span className="text-2xl font-bold text-[#111] font-display">{timeLeft.days}</span><span className="text-xs text-[#AAA] ml-1 font-label">d</span></div>
            )}
            <div><span className="text-2xl font-bold text-[#111] font-display">{timeLeft.hours}</span><span className="text-xs text-[#AAA] ml-1 font-label">hr</span></div>
            <div><span className="text-2xl font-bold text-[#111] font-display">{timeLeft.mins}</span><span className="text-xs text-[#AAA] ml-1 font-label">min</span></div>
          </div>
          <p className="text-[11px] text-[#CCC] font-label">
            {quizDates?.date1 || quizDates?.date2
              ? [quizDates.date1, quizDates.date2].filter(Boolean).map((d) =>
                  new Date(d).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                ).join(' & ')
              : 'Fri & Sat · 5:00 pm – 6:00 pm login window'}
          </p>
        </div>
      )}
    </div>
  )
}
