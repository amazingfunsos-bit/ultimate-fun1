# Ultimate Fun

Jokes, riddles, facts, challenges, memes, mini-games and live community sync, built with Vite + React + Firebase.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `FIREBASE_SERVICE_ACCOUNT` (needed for the `/api` routes)
3. `npm run dev` → http://localhost:3000

## Deploy to Vercel

1. Import this repo in Vercel (framework preset: **Vite**, auto-detected from `vercel.json`).
2. Add the environment variable `FIREBASE_SERVICE_ACCOUNT` (see `.env.example`).
3. Deploy.
4. In the Firebase console → Authentication → Settings → **Authorized domains**, add your `*.vercel.app` domain (and any custom domain).

The frontend is built to `dist/` and served statically; the backend routes in `api/index.ts` run as a Vercel serverless function.
