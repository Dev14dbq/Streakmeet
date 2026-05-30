import fs from 'fs'
import path from 'path'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { s3, S3_BUCKET } from './client.js'
import { UPLOADS_DIR } from '../config/paths.js'

const useS3 = Boolean(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID)

export function urlToS3Key(relativeUrl: string): string {
  return relativeUrl.replace(/^\//, '')
}

export function isMediaUrl(path: string): boolean {
  return path.startsWith('/uploads/')
}

function localPath(relativeUrl: string): string {
  return path.join(UPLOADS_DIR, relativeUrl.replace(/^\/uploads\//, ''))
}

function ensureLocalDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
}

export async function ensureBucket(): Promise<void> {
  if (!useS3) {
    ensureLocalDir()
    return
  }
  try {
    await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }))
  }
}

export async function uploadAvif(key: string, buffer: Buffer): Promise<void> {
  await ensureBucket()
  if (!useS3) {
    const filePath = path.join(UPLOADS_DIR, key.replace(/^uploads\//, ''))
    ensureLocalDir()
    await fs.promises.writeFile(filePath, buffer)
    return
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/avif',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )
}

export async function getObjectBuffer(relativeUrl: string): Promise<Buffer> {
  if (!useS3) {
    return fs.promises.readFile(localPath(relativeUrl))
  }
  const key = urlToS3Key(relativeUrl)
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  )
  const body = res.Body
  if (!body) throw new Error(`Empty object: ${key}`)
  const chunks: Uint8Array[] = []
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function getObjectStream(relativeUrl: string) {
  if (!useS3) {
    const filePath = localPath(relativeUrl)
    const stat = await fs.promises.stat(filePath)
    return { stream: fs.createReadStream(filePath), contentLength: stat.size }
  }
  const key = urlToS3Key(relativeUrl)
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  )
  return { stream: res.Body, contentLength: res.ContentLength }
}

export async function deleteMediaObject(relativeUrl: string): Promise<void> {
  if (!isMediaUrl(relativeUrl)) return
  if (!useS3) {
    try {
      await fs.promises.unlink(localPath(relativeUrl))
    } catch {
      // ignore
    }
    return
  }
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: urlToS3Key(relativeUrl),
      })
    )
  } catch {
    // ignore missing objects
  }
}
