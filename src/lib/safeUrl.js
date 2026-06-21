export function safeUrl(url) {
  if (!url) return ''
  if (typeof url !== 'string') return ''
  const trimmed = url.trim()
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
      return trimmed
    }
    return ''
  } catch {
    return ''
  }
}
