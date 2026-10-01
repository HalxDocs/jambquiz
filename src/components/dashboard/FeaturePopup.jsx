import { HugeiconsIcon } from '@hugeicons/react'
import { CrownIcon, Coins01Icon, UserGroupIcon, HashtagIcon, Rocket01Icon } from '@hugeicons/core-free-icons'

const FEATURES = [
  {
    icon: CrownIcon,
    title: 'Lifelines are here',
    body: 'Stuck mid-test? Use Ask a GOAT — read each comment, pick one you trust: 3-star shows the question explanation, 2-star narrows to 2 options, 1-star narrows to 3. Also try Peek a Friend or 50-50. Each works 5x per test.',
  },
  {
    icon: Coins01Icon,
    title: 'Coins run everything',
    body: 'You start with 20 free coins. Earn more: +50 for inviting a friend with your number, +10 for finishing a test, +5 for sharing your result. Need more? Tap Get more on your dashboard to buy.',
  },
  {
    icon: UserGroupIcon,
    title: 'Build your squad',
    body: 'Go to Leaderboard → Find friends, tap + to add up to 4 friends. Before each test you pick 2 to peek at. Your squad is also how Peek-a-Friend works.',
  },
  {
    icon: HashtagIcon,
    title: 'Your number = free coins',
    body: 'Every student now has a referral number (check your Coins page). Share it — anyone who registers with it gets you +50 coins.',
  },
]

export default function FeaturePopup({ onClose }) {
  const dismiss = (remember) => {
    try {
      if (remember) localStorage.setItem('274lab_seen_lifelines_popup', '1')
    } catch {}
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center sm:p-4">
      <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 text-center shrink-0">
          <div className="w-12 h-12 mx-auto bg-[#111] rounded-2xl flex items-center justify-center mb-2">
            <HugeiconsIcon icon={Rocket01Icon} size={22} color="white" />
          </div>
          <h2 className="text-lg font-bold text-[#111] font-display">New on 274Lab!</h2>
          <p className="text-xs text-[#888] font-label mt-1">Lifelines, coins & squads — here's how it works</p>
        </div>

        {/* Scrollable body */}
        <div className="px-5 pb-2 overflow-y-auto grow">
          <div className="space-y-2.5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3 bg-[#F8F8F7] border border-[#EBEBEB] rounded-2xl p-3.5">
                <span className="w-10 h-10 rounded-xl bg-[#111] border border-[#111] flex items-center justify-center shrink-0">
                  <HugeiconsIcon icon={f.icon} size={20} color="white" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#111] font-display">{f.title}</p>
                  <p className="text-xs text-[#555] font-body leading-relaxed mt-0.5">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky footer — always visible while scrolling */}
        <div className="p-4 border-t border-[#F1F1F0] bg-white shrink-0 sticky bottom-0">
          <div className="flex gap-2">
            <button
              onClick={() => dismiss(false)}
              className="flex-1 border border-[#E5E5E5] text-[#555] rounded-xl py-3 text-sm font-bold font-label hover:bg-[#F8F8F7] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => dismiss(true)}
              className="flex-1 bg-[#111] text-white rounded-xl py-3 text-sm font-bold font-display hover:bg-[#222] active:scale-[0.99] transition-all"
            >
              Don't show again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
