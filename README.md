# SimaTube

Mobile-first YouTube-watching PWA for iPhone/Safari.

## Live Site

https://personal-youtube-app.vercel.app

## GitHub Repo

https://github.com/thatsimaguy/simatube

To continue on another computer, sign in to GitHub as `thatsimaguy`, then clone:

```bash
git clone https://github.com/thatsimaguy/simatube.git
cd simatube
npm run build
```

Vercel is connected to this GitHub repo. Pushing to `main` can update the live Vercel project.

## Local Commands

```bash
npm run verify
npm run deploy
```

`npm run verify` checks the browser code and rebuilds the production `dist` folder.

For a quick local server:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

## Vercel

The project is linked to:

```text
thatsimaguys-projects/personal-youtube-app
```

Production env vars already configured in Vercel:

```text
YOUTUBE_API_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
```

The app uses server OAuth so Safari can stay signed in through a secure HTTP-only cookie.

## Google Cloud

OAuth redirect URI:

```text
https://personal-youtube-app.vercel.app/api/auth/callback
```

Authorized JavaScript origins:

```text
https://personal-youtube-app.vercel.app
http://127.0.0.1:4173
http://localhost:4173
```

## Notes

- Shorts are filtered out.
- Home blends subscriptions, local watch/search history, liked-video seeds, and popular discovery.
- The app has no custom ads.
- Secrets are not committed. `config.local.js`, `.env*`, `.vercel`, and `dist` are ignored.
