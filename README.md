# SkyDesign Flight Deal Finder

Node.js, Express, and EJS flight deal finder for `skydesign.com.au`.

The app is designed for Hostinger Node.js Web App hosting with deployment from GitHub. Travelpayouts is integrated safely: the API token is used only on the backend and is never sent to frontend JavaScript.

## Hostinger Build Settings

- Install command: `npm install`
- Build command: leave empty
- Start command: `npm start`
- Node version: `20`

## Environment Variables

Set these in Hostinger's Node.js Web App environment settings:

```bash
NODE_ENV=production
PORT=3000
SITE_URL=https://skydesign.com.au
TP_MARKER=your_travelpayouts_marker
TP_API_TOKEN=your_travelpayouts_data_api_token
```

Optional:

```bash
TP_WIDGET_EMBED_URL=
```

Never place `TP_API_TOKEN` in frontend JavaScript, EJS output, public assets, GitHub secrets shown in pages, or browser-visible config.

## Routes

- `/` - Home
- `/flight-deal-finder` - Flight search form and Travelpayouts-backed results
- `/api/flight-prices` - Backend JSON route for Travelpayouts price lookup
- `/cheap-flights` - Cheap flights content
- `/about` - About page
- `/contact` - Contact page
- `/health` - Health check
- `/env-check` - Shows only `OK` or `MISSING` for required env vars

## Travelpayouts Integration

`/api/flight-prices` accepts:

```text
origin
destination
depart_date
return_date
currency
adults
```

The server calls the Travelpayouts Data API with:

```text
X-Access-Token: process.env.TP_API_TOKEN
```

The token is not logged and is not returned in any route response.

Price results are cached in memory for 24 hours by search parameters. If Travelpayouts fails or returns no results, the UI shows a clean Aviasales fallback link using `TP_MARKER`.

## Local Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Open:

```text
http://localhost:3000
```

Check environment status:

```text
http://localhost:3000/env-check
```

Expected shape:

```json
{
  "TP_MARKER": "OK",
  "TP_API_TOKEN": "OK"
}
```

## Test Steps

1. Visit `/health` and confirm it returns `status: ok`.
2. Visit `/env-check` and confirm `TP_MARKER` and `TP_API_TOKEN` are `OK`.
3. Visit `/flight-deal-finder`.
4. Search with IATA codes such as `SYD` to `DXB`, dates, adults, and currency.
5. Confirm returned results show `View Deal` buttons.
6. If no API results are available, confirm the Aviasales fallback button appears.

## Safe Future Changes

Keep partner credentials server-side. If you add Skyscanner, another Travelpayouts endpoint, or airline APIs later, call them from Express routes or private backend helpers only. The frontend should receive sanitized result data and affiliate links, never raw API tokens.
