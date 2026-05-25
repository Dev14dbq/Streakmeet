import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { UPLOADS_DIR } from './paths.js'

export function parseBase64Image(photoBase64: string): Buffer {
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '')
  return Buffer.from(base64Data, 'base64')
}

/** Normalized fingerprint — same scene gives same hash even with different JPEG compression. */
export async function computePhotoHash(photoBase64: string): Promise<string> {
  const normalized = await sharp(parseBase64Image(photoBase64))
    .rotate()
    .resize(256, 256, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer()
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

export async function saveBase64ImageAsAvif(
  photoBase64: string,
  nameWithoutExt: string
): Promise<string> {
  if (!photoBase64.startsWith('data:image/')) {
    throw new Error('Invalid image format')
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }

  const fileName = `${nameWithoutExt}.avif`
  const filePath = path.join(UPLOADS_DIR, fileName)

  await sharp(parseBase64Image(photoBase64))
    .rotate()
    .avif({ quality: 65, effort: 4 })
    .toFile(filePath)

  return `/uploads/${fileName}`
}
