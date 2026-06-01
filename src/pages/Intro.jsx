export default function Intro({ onContinue }) {
  const steps = [
    {
      n: 1,
      title: 'Diagnose',
      window: 'Aug – Feb',
      body: 'Weekly tests to identify strengths and weaknesses.',
    },
    {
      n: 2,
      title: 'Discipline',
      window: 'Always',
      body: 'Choose an accountability partner.',
    },
    {
      n: 3,
      title: 'Patch',
      window: 'Mar – Apr',
      body: 'Targeted key points on weak topics.',
    },
  ]

  return (
    <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8 pt-6">
          <div className="w-16 h-16 mx-auto bg-[#111] rounded-2xl flex flex-col items-center justify-center mb-2 shadow-md">
            <span className="text-xl font-bold text-white font-display leading-none tracking-tighter">274</span>
            <span className="text-[9px] font-bold text-white/50 font-display leading-none tracking-widest uppercase mt-0.5">Lab</span>
          </div>
          <p className="text-[11px] font-semibold text-[#888] font-label tracking-[0.25em] uppercase">
            Diagnose • Discipline • Patch
          </p>
          <p className="text-[13px] text-[#555] mt-3 font-body leading-snug max-w-[18rem] mx-auto">
            Hi there! Welcome to the Lab.
          </p>
          <p className="text-xs text-[#AAA] mt-1.5 font-label leading-relaxed">
            A simple 3-step system to help you pass your exams.
          </p>
        </div>

        <div className="space-y-2.5 mb-6">
          {steps.map((s) => (
            <div key={s.n} className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#111] text-white flex items-center justify-center text-sm font-bold font-display shrink-0">
                  {s.n}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-sm font-bold text-[#111] font-display">Step {s.n} — {s.title}</p>
                    <span className="text-[10px] font-semibold text-[#888] bg-[#F3F3F2] px-2 py-0.5 rounded-full font-label whitespace-nowrap">
                      {s.window}
                    </span>
                  </div>
                  <p className="text-xs text-[#555] font-body leading-relaxed">{s.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>



        <button
          onClick={onContinue}
          className="w-full bg-[#111] text-white rounded-xl py-3.5 text-sm font-bold hover:bg-[#222] active:scale-[0.99] transition-all font-display"
        >
          Continue →
        </button>

        <p className="text-center text-[11px] text-[#AAA] mt-5 font-label">
          Supported by <span className="text-[#555] font-semibold">A.M.C</span>
        </p>
      </div>
    </div>
  )
}
