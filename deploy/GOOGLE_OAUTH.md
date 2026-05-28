# Google OAuth (StreakMeet)

You need **three separate** OAuth clients in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (same project).

| Client type                 | Client ID (StreakMeet)                                                     | Used in code / env                                    |
| --------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Web application**         | `442480638149-mqdlqfiof7riq5a526d2m0sl7d413au1.apps.googleusercontent.com` | `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID` (backend) |
| **Android**                 | `442480638149-q1hvfp5j8msrsurbuuu6a0g7njhcootl.apps.googleusercontent.com` | **Not** in `.env` — only in Console (package + SHA-1) |
| **iOS** (when you ship iOS) | create in Console                                                          | `VITE_GOOGLE_IOS_CLIENT_ID`                           |

Do **not** put the Android client ID into `VITE_GOOGLE_CLIENT_ID`. Native Android sign-in still passes the **Web** client ID as `webClientId` so the backend can verify `id_token`.

---

## Web application (site + Android `webClientId`)

### Authorized JavaScript origins

Add every origin users open the app from (scheme + host + port, no path):

- `https://spectrmod.com`
- `http://spectrmod.com` (if you serve HTTP without TLS)
- `http://localhost:5173`
- `https://localhost:5173` (Vite dev with basic-ssl)

If you open the site by IP, add that origin too, e.g. `http://144.31.143.193`.

### Authorized redirect URIs (legacy redirect flow only)

The app signs in on the web via **id_token** (GIS button), so redirect URIs are optional.

If you use `startGoogleRedirectLogin()` or `ux_mode="redirect"`, add **exact** URIs:

- `https://spectrmod.com/login`
- `http://spectrmod.com/login`

`redirect_uri_mismatch` means the URI in the request is not listed here.

---

## Android application

Create client type **Android** with:

| Field         | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| Package name  | `com.streakmeet.app`                                          |
| SHA-1 (debug) | `C2:D6:64:0D:91:B8:50:2E:E0:7D:D5:A3:E2:F8:21:24:82:2D:14:97` |

Debug keystore fingerprint:

```bash
keytool -keystore ~/.android/debug.keystore -list -v -storepass android -keypass android
```

Release APK (when you ship to Play):

```bash
keytool -printcert -jarfile path/to/app-release.apk
```

Add that SHA-1 as a **second** fingerprint on the same Android OAuth client (or a separate release client).

After changing Console, wait 5–15 minutes, then reinstall the APK.

### Build Android app

```bash
cd frontend
npm run build
npx cap sync android
# open android/ in Android Studio → Run
```

`initGoogleAuth()` uses `webClientId` = Web client ID from `VITE_GOOGLE_CLIENT_ID`.

---

## Backend

`GOOGLE_CLIENT_ID` in `backend/.env` must be the **Web** client ID (same as `VITE_GOOGLE_CLIENT_ID`). Used to verify Google `id_token` from web and native apps.

---

## After changing Console settings

Changes can take a few minutes. Rebuild the frontend if you change `VITE_GOOGLE_CLIENT_ID`:

```bash
cd /home/streakmeet/frontend && npm run build
```
