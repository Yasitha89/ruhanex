# Install Ruhanex as a standalone app

The app links `/manifest.webmanifest`, with stable app ID `/`, start URL `/`, scope `/` and `display: standalone`. PNG icons are supplied at 192 and 512 pixels, plus a padded maskable icon and an Apple touch icon. The existing push service worker stays registered; no second worker or data cache is introduced. Live dashboards and login still require network access.

## Deploy and install

1. Run `npm run build` and deploy the complete resulting `dist` directory, including `manifest.webmanifest`, `icons/` and `push-sw.js`.
2. Serve the same hostname over trusted HTTPS. The manifest and icon files must be public static assets, not redirected to login or replaced by the SPA index. Serve `.webmanifest` as `application/manifest+json` or another valid JSON MIME type.
3. In Chrome DevTools → Application → Manifest, check that the manifest, display mode and icons are recognized without installability errors. In Application → Service Workers, verify `/push-sw.js` is active on scope `/`.
4. On Android, remove the old browser-style shortcut/installation, open the deployed site in Chrome and install again. Launch from the new app icon, not a regular browser tab.

Standalone mode removes the normal browser address/menu toolbar for in-scope app pages; Android status and navigation bars remain. Keep login redirects, dashboard routes and links on the installed origin. Moving to another domain/subdomain or leaving the app scope can display browser controls again. The root-relative manifest works on the deployed origin (for example `app.ruhanex.com`) without hardcoding a hostname.

You can check the launch mode from that page's DevTools console:

```js
window.matchMedia('(display-mode: standalone)').matches
```

It should be true when launched as the installed standalone app. Installation behavior is controlled by the browser/device; manifest settings do not hide the toolbar of an ordinary browser tab.
