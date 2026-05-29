import { OAuth2Client } from 'google-auth-library'

export type GoogleProfile = { email: string; name?: string }

export async function resolveGoogleProfile(body: {
  accessToken?: string
  idToken?: string
}): Promise<GoogleProfile> {
  const { accessToken, idToken } = body
  if (!accessToken && !idToken) {
    throw new Error('token_required')
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('not_configured')
  }

  if (idToken) {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) throw new Error('no_email')
    return { email: payload.email, name: payload.name }
  }

  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!infoRes.ok) throw new Error('invalid_access_token')
  const info = (await infoRes.json()) as { email?: string; name?: string }
  if (!info.email) throw new Error('no_email')
  return { email: info.email, name: info.name }
}

export function isGoogleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID
}
