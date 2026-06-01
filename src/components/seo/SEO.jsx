import { Helmet } from 'react-helmet-async'

const SITE = 'https://fitness-gym-fc040.web.app'
const DEFAULT_DESC = '274 days to identify weaknesses and fix them to ace JAMB. Take weekly quizzes, track progress, and improve your scores.'
const DEFAULT_IMG = `${SITE}/pwa-512x512.png`

export default function SEO({ title, description, image, url, type = 'website', jsonLd }) {
  const pageTitle = title ? `${title} · 274Lab` : '274Lab — JAMB Weekly Quiz & Revision'
  const pageDesc = description || DEFAULT_DESC
  const pageImg = image || DEFAULT_IMG
  const pageUrl = url || SITE

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDesc} />
      <link rel="canonical" href={pageUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDesc} />
      <meta property="og:image" content={pageImg} />
      <meta property="og:url" content={pageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDesc} />
      <meta name="twitter:image" content={pageImg} />
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  )
}
