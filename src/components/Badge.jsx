export default function Badge({ children, className = '' }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-label tracking-widest ${className}`}>
      {children}
    </span>
  )
}
