export default function PageShell({ children, maxW = 'max-w-md', className = '' }) {
  return (
    <div className={`min-h-screen bg-[#F8F8F7]`}>
      <div className={`mx-auto px-4 pb-10 ${maxW} ${className}`}>
        {children}
      </div>
    </div>
  )
}
