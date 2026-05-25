import { readFileSync } from 'fs'
import { ensureFaceModels, detectFacesFromBase64 } from '../src/lib/face.js'

async function main() {
  await ensureFaceModels()
  const testImg = readFileSync('/home/streakmeet/frontend/public/pwa-192x192.png')
  const b64 = 'data:image/png;base64,' + testImg.toString('base64')
  const r = await detectFacesFromBase64(b64)
  console.log('OK faces:', r.length)
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
