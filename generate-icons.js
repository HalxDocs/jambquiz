import sharp from 'sharp'
import { mkdirSync } from 'fs'

try { mkdirSync('public') } catch {}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#111827"/>
  <text x="256" y="320" font-size="280" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold">J</text>
</svg>`

const buf = Buffer.from(svg)

await sharp(buf).resize(192, 192).png().toFile('public/pwa-192x192.png')
await sharp(buf).resize(512, 512).png().toFile('public/pwa-512x512.png')
await sharp(buf).resize(180, 180).png().toFile('public/apple-touch-icon.png')
await sharp(buf).resize(32, 32).png().toFile('public/favicon.ico')

console.log('Icons generated successfully!')