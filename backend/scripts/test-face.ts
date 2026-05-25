import { TextDecoder, TextEncoder } from 'node:util'

globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder

import { ensureFaceModels } from '../src/lib/face.js'

async function main() {
  await ensureFaceModels()
  console.log('OK')
}

main().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
