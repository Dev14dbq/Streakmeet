import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'StreakMeet <onboarding@resend.dev>'
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL ?? 'https://spectrmod.com').replace(/\/$/, '')

export function verificationLink(token: string): string {
  return `${APP_PUBLIC_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`
}

export function resetPasswordLink(token: string): string {
  return `${APP_PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set, skipping verification email to', to)
    console.warn('[email] Verify URL:', verificationLink(token))
    return
  }
  const link = verificationLink(token)
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Подтвердите email — StreakMeet',
    html: `
      <p>Здравствуйте!</p>
      <p>Нажмите кнопку, чтобы подтвердить email для StreakMeet:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Подтвердить email</a></p>
      <p>Или скопируйте ссылку: <br/><a href="${link}">${link}</a></p>
      <p>Ссылка действует 24 часа.</p>
    `,
  })
  if (error) throw new Error(error.message)
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set, skipping reset email to', to)
    console.warn('[email] Reset URL:', resetPasswordLink(token))
    return
  }
  const link = resetPasswordLink(token)
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Сброс пароля — StreakMeet',
    html: `
      <p>Здравствуйте!</p>
      <p>Вы запросили сброс пароля. Нажмите кнопку:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Сбросить пароль</a></p>
      <p>Или скопируйте ссылку: <br/><a href="${link}">${link}</a></p>
      <p>Ссылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо.</p>
    `,
  })
  if (error) throw new Error(error.message)
}
