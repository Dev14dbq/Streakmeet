import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'StreakMeet <onboarding@resend.dev>'
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL ?? 'https://spectrmod.com').replace(/\/$/, '')

function getResendClient(): Resend {
  if (!resend) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  return resend
}

async function sendViaResend(payload: Parameters<Resend['emails']['send']>[0]): Promise<void> {
  const client = getResendClient()
  const { data, error } = await client.emails.send(payload)
  if (error) {
    console.error('[email] Resend API error:', error)
    throw new Error(error.message)
  }
  if (!data?.id) {
    console.error('[email] Resend returned no message id:', { data, error })
    throw new Error('Resend did not accept the email')
  }
  console.log('[email] Sent', data.id, 'to', payload.to)
}

export function verificationLink(token: string): string {
  return `${APP_PUBLIC_URL}/verify-email?token=${encodeURIComponent(token)}`
}

export function resetPasswordLink(token: string): string {
  return `${APP_PUBLIC_URL}/reset-password?token=${encodeURIComponent(token)}`
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = verificationLink(token)
  await sendViaResend({
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
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = resetPasswordLink(token)
  await sendViaResend({
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
}
