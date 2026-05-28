# Google OAuth (StreakMeet)

Client ID type must be **Web application** (the same value in `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`).

## Google Cloud Console

[APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → your OAuth 2.0 Client ID.

### Authorized JavaScript origins (required for Sign in with Google button)

Add every origin users open the app from (scheme + host + port, no path):

- `https://spectrmod.com`
- `http://spectrmod.com` (if you serve HTTP without TLS)
- `http://localhost:5173`
- `https://localhost:5173` (Vite dev with basic-ssl)

If you open the site by IP, add that origin too, e.g. `http://144.31.143.193`.

### Authorized redirect URIs (only if you use the legacy mobile redirect flow)

The app now signs in on the web via **id_token** (GIS button), so redirect URIs are optional.

If you still use `startGoogleRedirectLogin()` or `ux_mode="redirect"`, add **exact** URIs:

- `https://spectrmod.com/login`
- `http://spectrmod.com/login`

`redirect_uri_mismatch` means the URI in the request is not listed here (or http vs https / www vs bare domain differs).

## After changing Console settings

Changes can take a few minutes. Rebuild the frontend if you change `VITE_GOOGLE_CLIENT_ID`:

```bash
cd /home/streakmeet/frontend && npm run build
```
