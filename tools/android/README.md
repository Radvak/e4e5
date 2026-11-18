# Android app (Trusted Web Activity)

A thin Android shell that opens https://tabiya.fly.dev full screen through Chrome. No app code
here: a deploy of the site updates the app at once, without a new Play Store release. Only
`twa-manifest.json` is versioned; Bubblewrap regenerates the Android project from it.

## Prerequisites

- Node, and `npm i -g @bubblewrap/cli` (on first run it offers to download a JDK and the
  Android SDK into `~/.bubblewrap`).
- The site deployed, with its manifest reachable at https://tabiya.fly.dev/manifest.webmanifest.

## First build

```bash
cd tools/android
# Signing key (upload key): keep it and its password outside the repository, backed up.
keytool -genkeypair -v -keystore tabiya-upload.keystore -alias tabiya \
  -keyalg RSA -keysize 2048 -validity 10000
bubblewrap update   # generates the Android project from twa-manifest.json
bubblewrap build    # app-release-bundle.aab (Play Store) and app-release-signed.apk
```

## Digital Asset Links (no address bar)

The app is full screen only if the site lists the fingerprints of the keys that sign it:

```bash
keytool -list -v -keystore tabiya-upload.keystore -alias tabiya | grep SHA256
```

With Play App Signing, Google re-signs the app: also add the fingerprint of the *app signing
key* (Play Console › Test and release › App integrity). Both, comma-separated:

```bash
fly secrets set ANDROID_SHA256_FINGERPRINTS="AA:BB:...,CC:DD:..."
curl https://tabiya.fly.dev/.well-known/assetlinks.json
```

Without them the app works, but shows Chrome's address bar.

## New version

Only needed when the shell itself changes (icon, name, colours…): bump `appVersionCode` (and
`appVersionName`) in `twa-manifest.json`, then `bubblewrap update && bubblewrap build`.

## Testing on a phone

`bubblewrap install` installs the APK on a phone plugged in via USB (developer mode, USB
debugging).
