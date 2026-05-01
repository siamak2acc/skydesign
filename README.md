# SkyDesign Flight Deal Finder

Static airline and flight deal finder website for `skydesign.com.au`.

This version is designed for a WebTechX-style static FTP deployment:

- Build locally with Node.js tooling
- Upload static files to Hostinger `public_html` by FTP
- Keep DNS in Cloudflare
- Do not require a live Node.js server
- Keep private API keys out of frontend code

## Project Structure

```text
package.json
deploy_static_site.js
site/
  index.html
  flight-deals.html
  cheap-flights.html
  about.html
  contact.html
  sitemap.xml
  robots.txt
  .htaccess
  assets/
    style.css
    script.js
.env.example
README.md
```

The build script outputs deployable files to `dist/`. Clean URLs are generated as folders:

```text
dist/
  index.html
  flight-deals/index.html
  cheap-flights/index.html
  about/index.html
  contact/index.html
  assets/
  sitemap.xml
  robots.txt
  .htaccess
```

## Run Locally

Install dependencies:

```bash
npm install
```

Build the static site:

```bash
npm run build
```

Preview locally:

```bash
npm run serve
```

Open:

```text
http://localhost:4173
```

## Configure FTP

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set your Hostinger FTP details:

```bash
SITE_URL=https://skydesign.com.au
FTP_HOST=your-hostinger-ftp-host
FTP_PORT=21
FTP_USER=your-ftp-username
FTP_PASSWORD=your-ftp-password
FTP_SECURE=false
FTP_REMOTE_DIR=/public_html
FTP_CLEAR_REMOTE=false
```

Use `FTP_CLEAR_REMOTE=true` only if you want the deploy script to clear the current FTP directory before uploading the new build.

## Deploy

Deploy to Hostinger FTP:

```bash
npm run deploy
```

The deploy script will:

1. Build `dist/`
2. Connect to Hostinger FTP
3. Upload static HTML
4. Upload `/assets`
5. Upload `.htaccess`
6. Upload `sitemap.xml`
7. Upload `robots.txt`

## Cloudflare DNS

Keep DNS managed in Cloudflare. Point `skydesign.com.au` to Hostinger using the records Hostinger provides.

The included `.htaccess` handles:

- Non-www redirect to `https://skydesign.com.au`
- HTTPS redirect
- `.html` to clean URL redirect
- Clean URL rewrites for generated folder pages
- Directory listing disabled

## Affiliate Placeholder

The Flight Deal Finder page currently generates a placeholder URL:

```text
https://skydesign.com.au/affiliate-placeholder/?source=skydesign&from=SYD&to=NRT&departure_date=...
```

This is intentionally static and does not expose any private keys.

## Future Skyscanner or Affiliate API Integration

Do not put Skyscanner, Travelpayouts, airline API, or affiliate secrets in `site/assets/script.js`.

Use one of these safe patterns later:

- Add a private backend helper hosted separately from the static site
- Add a serverless function that reads secrets from environment variables
- Use a Python helper script for scheduled deal imports into static JSON
- Generate public static deal data at build time, then upload it with the site

The frontend should call only public endpoints or read public static JSON. Any API key, affiliate secret, signing key, or token must stay server-side.
