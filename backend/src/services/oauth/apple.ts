import appleSignin from 'apple-signin-auth'

export async function verifyAppleIdToken(idToken: string): Promise<{ email?: string }> {
  return appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
    ignoreExpiration: false,
  })
}

export function isAppleConfigured(): boolean {
  return !!process.env.APPLE_CLIENT_ID
}
