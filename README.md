# SkyDesign Flight Deal Finder

Node.js and Express flight deal finder website for `skydesign.com.au`.

## Tech stack

- Node.js 20
- Express
- EJS server-rendered views
- Static CSS and JavaScript in `public/assets`
- `.env` for server-side configuration

## Pages

- `/` - Home
- `/flight-deal-finder` - Flight search form and affiliate redirect placeholder
- `/cheap-flights` - Cheap flights content page
- `/about` - About page
- `/contact` - Contact page
- `/health` - Health check route

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Hostinger Node.js Web App settings

- Install command: `npm install`
- Build command: leave empty
- Start command: `npm start`
- Node version: `20`

## Environment variables

```bash
NODE_ENV=production
PORT=3000
SITE_URL=https://skydesign.com.au
AFFILIATE_BASE_URL=https://skydesign.com.au/affiliate-placeholder
```

`AFFILIATE_BASE_URL` is the server-side placeholder target used when a traveller submits the flight form. Replace it later with a Skyscanner or affiliate partner URL/API flow.

## Cloudflare DNS

Keep DNS managed in Cloudflare and point the relevant `A`, `AAAA`, or `CNAME` records to Hostinger as instructed by Hostinger for the Node.js Web App. Use proxied or DNS-only mode according to Hostinger's SSL guidance for the app.

## GitHub deployment

Push this repository to GitHub, then import the repository into Hostinger's Node.js Web App deployment flow. Hostinger should run `npm install` and start the app with `npm start`.
