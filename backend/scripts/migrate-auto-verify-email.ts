/**
 * One-time migration: mark existing email/password users as verified.
 * Run manually after deploy if upgrading from pre-verification builds:
 *   cd backend && npx tsx scripts/migrate-auto-verify-email.ts
 */
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { prisma } from '../src/lib/prisma.js'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: path.join(scriptDir, '../.env') })

async function main() {
  const result = await prisma.user.updateMany({
    where: { passwordHash: { not: '' }, emailVerifiedAt: null, deletedAt: null },
    data: { emailVerifiedAt: new Date() },
  })
  console.log(`[auth] Auto-verified ${result.count} existing email user(s)`)
}

main()
  .catch((e) => {
    console.error('[auth] Auto-verify migration failed:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
