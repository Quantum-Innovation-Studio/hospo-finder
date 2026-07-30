# Hospitality Business Scraper

A browser-based tool that scrapes hospitality businesses from any Australian town using the Google Places API. Runs entirely client-side — **no backend server needed**.

**Live demo:** [your-vercel-url.vercel.app]

---

## How it works

1. Enter your Google Places API key (with Places API enabled)
2. Select towns and categories
3. Hit "Scrape" — searches happen in-browser via the Google Maps JavaScript API
4. View results in a table, then export as **CSV** or **JSON**

Covers: restaurants, pubs, cafes, hotels, service stations, takeaway, sporting clubs, supermarkets.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USER/hospitality-scraper)

Or manually:

```bash
npm install -g vercel
vercel deploy
```

## API Key setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an API key or use an existing one
3. Enable **Places API** at [Google Cloud Console API Library](https://console.cloud.google.com/apis/library/places-backend.googleapis.com)
4. *(Recommended)* Restrict the key to your Vercel domain under **Application restrictions > HTTP referrers**

## Tech

- Pure HTML/CSS/JS — no frameworks
- Google Maps JavaScript API (Places library)
- Exports via browser Blob API
- Hosted on Vercel (free tier)
