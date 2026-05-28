/**
 * One-time migration: local uploads/ -> MinIO bucket.
 * Idempotent: skips keys that already exist in S3.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: path.join(scriptDir, '../.env') })

const UPLOADS_DIR = path.join(scriptDir, '../../uploads')

async function main() {
  const { HeadObjectCommand } = await import('@aws-sdk/client-s3')
  const { s3, S3_BUCKET } = await import('../src/lib/s3.js')
  const { ensureBucket, uploadAvif } = await import('../src/lib/mediaStorage.js')

  async function objectExists(key: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }))
      return true
    } catch {
      return false
    }
  }

  await ensureBucket()
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log('No local uploads directory, nothing to migrate.')
    return
  }
  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => f.endsWith('.avif'))
  let uploaded = 0
  let skipped = 0
  for (const file of files) {
    const key = `uploads/${file}`
    if (await objectExists(key)) {
      skipped++
      continue
    }
    const buf = fs.readFileSync(path.join(UPLOADS_DIR, file))
    await uploadAvif(key, buf)
    uploaded++
    console.log(`Uploaded ${key}`)
  }
  console.log(`Done: ${uploaded} uploaded, ${skipped} skipped.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
