import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** /home/streakmeet/uploads — один уровень выше backend/ */
export const UPLOADS_DIR = path.join(__dirname, '../../../uploads')
