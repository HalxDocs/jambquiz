export default function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div className="px-3.5 py-2.5 bg-red-50 border border-red-100 rounded-xl">
      <p className="text-red-600 text-xs font-label">{message}</p>
    </div>
  )
}
