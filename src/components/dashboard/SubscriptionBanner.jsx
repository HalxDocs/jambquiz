import { getAccessStatus } from '../../store/useStore'

export default function SubscriptionBanner({ student, onSubscribe }) {
  const access = getAccessStatus(student)
  if (access.status === 'active' && access.daysLeft > 7) return null

  const styles = {
    trial: { bg: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-yellow-800', label: `Free trial · ${access.daysLeft} day${access.daysLeft !== 1 ? 's' : ''} left` },
    active: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-800', label: `Subscription expires in ${access.daysLeft} day${access.daysLeft !== 1 ? 's' : ''}` },
    expired: { bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-700', label: 'Access expired — renew to continue' },
  }[access.status]

  return (
    <button onClick={onSubscribe} className={`w-full text-left ${styles.bg} ${styles.border} border rounded-xl px-4 py-3 mb-4 flex items-center justify-between hover:opacity-90 transition-opacity`}>
      <div>
        <p className={`text-xs font-bold ${styles.text} font-display`}>{styles.label}</p>
        <p className="text-[10px] text-[#888] font-label mt-0.5">
          {access.status === 'expired' ? 'Tap to subscribe (₦800/month)' : 'Tap to manage subscription'}
        </p>
      </div>
      <span className={`text-xs font-bold ${styles.text} font-label`}>→</span>
    </button>
  )
}
