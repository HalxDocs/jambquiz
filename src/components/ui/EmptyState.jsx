export default function EmptyState({ message = 'Nothing here yet', sub }) {
  return (
    <div className="bg-white border border-[#EBEBEB] rounded-2xl p-10 text-center">
      <p className="text-[#CCC] text-sm font-label">{message}</p>
      {sub && <p className="text-[#DDD] text-xs font-label mt-1">{sub}</p>}
    </div>
  )
}
