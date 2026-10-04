import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import visualCheck from './visual-check.js'

const channel = process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)
const browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true })
try {
  const page = await browser.newPage()
  console.log(JSON.stringify(await visualCheck(page, fileURLToPath(new URL('../', import.meta.url))), null, 2))
} finally { await browser.close() }
