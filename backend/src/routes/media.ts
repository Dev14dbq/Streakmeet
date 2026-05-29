import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { UPLOADS_DIR } from '../lib/paths.js'
import { getObjectStream, isMediaUrl } from '../lib/mediaStorage.js'

const router = Router()

// Media from MinIO (fallback to local folder during migration)
router.get('/:filename', async (req, res) => {
  const fileName = req.params.filename
  if (!fileName || fileName.includes('..')) {
    res.status(400).end()
    return
  }
  const relativeUrl = `/uploads/${fileName}`
  if (!isMediaUrl(relativeUrl)) {
    res.status(400).end()
    return
  }
  try {
    const { stream, contentLength } = await getObjectStream(relativeUrl)
    if (!stream) {
      res.status(404).end()
      return
    }
    res.setHeader('Content-Type', 'image/avif')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (contentLength) res.setHeader('Content-Length', String(contentLength))
    const readable = stream as NodeJS.ReadableStream
    readable.pipe(res)
  } catch {
    const localPath = path.join(UPLOADS_DIR, fileName)
    if (fs.existsSync(localPath)) {
      res.sendFile(localPath)
      return
    }
    res.status(404).end()
  }
})

export default router
