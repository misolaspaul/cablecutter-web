# CableCutter Web

The web (PWA) version of CableCutter: free live TV from [iptv-org](https://github.com/iptv-org/iptv)
with a YouTube-style layout, a TV guide, favorites and captions. Works in Chrome on Android and
Safari on iPhone/iPad, and can be installed to the home screen.

## Install on a phone

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**
- **Android:** open the site in Chrome → menu → **Install app** (or **Add to Home screen**)

## How it works

- `scripts/build-data.mjs` downloads the iptv-org database and the programme guides from
  [i.mjh.nz](https://i.mjh.nz), and writes a compact `public/data/catalog.json` plus one small
  guide file per region to `public/data/epg/`. It keeps only streams a browser can play:
  `https://` and not needing special request headers.
- The GitHub Action in `.github/workflows/deploy.yml` runs that script, builds the site and
  publishes it to GitHub Pages on every push and every 6 hours.
- Playback uses Safari's built-in HLS on Apple devices and [hls.js](https://github.com/video-dev/hls.js)
  elsewhere. Favorites, history and settings stay in the browser.

Compared with the Android app, some channels don't play in a browser (streams that block other
websites), and swipe brightness/volume isn't available.

## Develop

```sh
npm install
npm run data      # fetch channels and guides (about 15 seconds)
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
```

## Publish on GitHub Pages

1. Create an empty repository on GitHub, e.g. `cablecutter-web`.
2. Push this folder to it (branch `main`).
3. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab and wait for "Build and deploy" to finish; the site is then at
   `https://<your-username>.github.io/cablecutter-web/`.
