# Deployment

## Web
`pnpm turbo run build --filter=@acme/web` → static `apps/web/dist`.
Deploy to Cloudflare Pages / Vercel / Netlify (uncomment the step in
`.github/workflows/release.yml`).

## Desktop
Tag a release (`git tag v1.2.3 && git push --tags`). The `release` workflow runs
`electron-builder` on macOS/Windows/Linux and publishes to GitHub Releases.

### Signing
- macOS: `CSC_LINK` (base64 .p12) + `CSC_KEY_PASSWORD`, `hardenedRuntime` +
  `entitlements.mac.plist` (already wired) → notarize with `APPLE_ID` creds.
- Windows: `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` for the NSIS installer.

### Auto-update
`electron-updater` reads `publish: github` from `electron-builder.yml`. The
published `latest.yml` / `latest-mac.yml` are the update manifests the app polls
on launch (`autoUpdater.checkForUpdatesAndNotify()` in `electron/main.ts`).
