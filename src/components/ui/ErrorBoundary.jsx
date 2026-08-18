import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught render error:', error)
    console.error('[ErrorBoundary] Component stack:', info && info.componentStack)
    this.setState({ info })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleCopy = async () => {
    const { error, info } = this.state
    const text = `Error: ${error && error.message}\nStack: ${error && error.stack}\nComponent: ${info && info.componentStack}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      console.error('[ErrorBoundary] Clipboard write failed', text)
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    const { error, info } = this.state
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#EEE] p-6 text-center">
          <div className="w-14 h-14 mx-auto bg-red-50 rounded-2xl flex items-center justify-center mb-4 text-2xl">
            ⚠️
          </div>
          <h1 className="text-lg font-bold text-[#111] font-display mb-2">Something went wrong</h1>
          <p className="text-sm text-[#666] font-label mb-5 leading-relaxed">
            An unexpected error occurred. Reload to try again, or copy the details below and send them to support.
          </p>

          <pre className="text-left text-[11px] bg-[#111] text-[#EEE] rounded-xl p-3 mb-4 font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
            {error && error.message}
            {'\n'}
            {(info && info.componentStack || '').split('\n').slice(0, 6).join('\n')}
          </pre>

          <div className="flex gap-2 justify-center">
            <button
              onClick={this.handleReload}
              className="bg-[#111] text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#333] transition-colors font-label"
            >
              Reload
            </button>
            <button
              onClick={this.handleCopy}
              className="border border-[#DDD] text-[#111] text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#F3F3F2] transition-colors font-label"
            >
              Copy details
            </button>
          </div>
        </div>
      </div>
    )
  }
}
