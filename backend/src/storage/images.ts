import crypto from 'crypto'
import sharp from 'sharp'
import { getObjectBuffer, uploadAvif, urlToS3Key } from './media.js'

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

  const fileName = `${nameWithoutExt}.avif`
  const relativeUrl = `/uploads/${fileName}`
  const key = urlToS3Key(relativeUrl)

  const buffer = await sharp(parseBase64Image(photoBase64))
    .rotate()
    .avif({ quality: 65, effort: 4 })
    .toBuffer()

  await uploadAvif(key, buffer)
  return relativeUrl
}

export async function combineRemoteSelfieImages(
  photoUrlA: string,
  photoBase64B: string,
  nameWithoutExt: string
): Promise<string> {
  const bufA = await getObjectBuffer(photoUrlA)
  const bufB = parseBase64Image(photoBase64B)

  const targetWidth = 960
  const targetHeight = 540

  const resizedA = await sharp(bufA)
    .rotate()
    .resize(targetWidth, targetHeight, { fit: 'cover' })
    .toBuffer()
  const resizedB = await sharp(bufB)
    .rotate()
    .resize(targetWidth, targetHeight, { fit: 'cover' })
    .toBuffer()

  const fileName = `${nameWithoutExt}.avif`
  const relativeUrl = `/uploads/${fileName}`
  const key = urlToS3Key(relativeUrl)

  const buffer = await sharp({
    create: {
      width: targetWidth * 2,
      height: targetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: resizedA, top: 0, left: 0 },
      { input: resizedB, top: 0, left: targetWidth },
    ])
    .avif({ quality: 65, effort: 4 })
    .toBuffer()

  await uploadAvif(key, buffer)
  return relativeUrl
}

export async function hashImageFile(relativeUrl: string): Promise<string> {
  const buf = await getObjectBuffer(relativeUrl)
  return crypto.createHash('sha256').update(buf).digest('hex')
}
