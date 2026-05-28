# Android release build

## 1. Create keystore (once)

```bash
keytool -genkey -v -keystore streakmeet-release.keystore -alias streakmeet \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore **outside** git. Never commit passwords or the `.keystore` file.

## 2. Configure signing

```bash
cp frontend/android/keystore.properties.example frontend/android/keystore.properties
```

Edit `keystore.properties`:

```properties
storeFile=/absolute/path/to/streakmeet-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=streakmeet
keyPassword=YOUR_KEY_PASSWORD
```

`keystore.properties` is gitignored.

## 3. Build web + sync Capacitor

```bash
cd frontend
echo 'VITE_API_URL=' > .env.production
echo "VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID" >> .env.production
npm run build
npx cap sync android
```

## 4. Assemble release APK / AAB

```bash
cd frontend/android
./gradlew assembleRelease
# or for Play Store:
./gradlew bundleRelease
```

Output:

- APK: `frontend/android/app/build/outputs/apk/release/app-release.apk`
- AAB: `frontend/android/app/build/outputs/bundle/release/app-release.aab`

## 5. Google Play Console

1. Create app `com.streakmeet.app`
2. Upload AAB to Internal testing
3. Add privacy policy URL (`/privacy` on your domain)
4. Complete Data safety form (camera, location, photos)
