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

export async function combineTwoImages(
  photoUrlA: string,
  photoBase64B: string,
  nameWithoutExt: string
): Promise<string> {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }

  // photoUrlA is something like "/uploads/filename.avif"
  const filePathA = path.join(UPLOADS_DIR, photoUrlA.replace('/uploads/', ''))
  const bufA = fs.readFileSync(filePathA)
  const bufB = parseBase64Image(photoBase64B)

  const imgA = sharp(bufA).rotate()
  const imgB = sharp(bufB).rotate()

  const metaA = await imgA.metadata()
  const metaB = await imgB.metadata()

  const isVertical = (metaA.height || 0) > (metaA.width || 0)

  // Standardize size
  const targetWidth = isVertical ? 1080 : 1440
  const targetHeight = isVertical ? 1440 : 1080

  const resizedA = await imgA.resize(targetWidth, targetHeight, { fit: 'cover' }).toBuffer()
  const resizedB = await imgB.resize(targetWidth, targetHeight, { fit: 'cover' }).toBuffer()

  // If vertical, side-by-side: width = targetWidth * 2, height = targetHeight
  // If horizontal, top-bottom: width = targetWidth, height = targetHeight * 2
  const combinedWidth = isVertical ? targetWidth * 2 : targetWidth
  const combinedHeight = isVertical ? targetHeight : targetHeight * 2

  const fileName = `${nameWithoutExt}.avif`
  const filePath = path.join(UPLOADS_DIR, fileName)

  await sharp({
    create: {
      width: combinedWidth,
      height: combinedHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: resizedA, top: 0, left: 0 },
      { input: resizedB, top: isVertical ? 0 : targetHeight, left: isVertical ? targetWidth : 0 },
    ])
    .avif({ quality: 65, effort: 4 })
    .toFile(filePath)

  return `/uploads/${fileName}`
}
