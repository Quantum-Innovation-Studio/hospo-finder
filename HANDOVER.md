# Hospo-Finder — Session Handover (2026-07-30)

## Project
**hospo-finder** — Hospitality Business Finder. Desktop web app for discovering hospitality businesses in Australian towns, enriched with contact info and licence verification.

- **Location**: `/home/benni/GoogleDrive/AI_Sandbox_MAIR/Co-Work/Quantum Innovation Home/Quantum Innovation Projects/hospo-finder/`
- **GitHub**: `github.com/Quantum-Innovation-Studio/hospo-finder` (main branch)
- **Live**: `https://hospo-finder.vercel.app/`
- **Vercel**: Auto-deploys from GitHub pushes

## Key Files

| File | Notes |
|---|---|
| `index.html` | Single-page app (888 lines, all frontend logic) |
| `api/licence-check.js` | Unified WA/NSW/VIC/TAS licence deep-check |
| `api/email-fetch.js` | Email discovery (scrape URL or search+scrape) |
| `api/email-scrape.js` | OLD name — renamed to `email-fetch.js` |
| `scripts/update_licence_data.py` | Monthly NSW/VIC data refresh |
| `data/nsw_licences.json` | ~19K licences, suburb-indexed (pre-processed) |
| `data/vic_licences.json` | ~23K licences, suburb-indexed (pre-processed) |
| `data/australian_postcodes.json` | 18,535 postcode entries |
| `vercel.json` | Static site config, clean URLs |
| `logo.png` / `logo@2x.png` | Brand logos (36px / 72px) |
| `.github/workflows/refresh-licence-data.yml` | Weekly data refresh action |

## What Was Built This Session

1. **Multi-state deep licence checks** — WA (live DLGSC portal), NSW (CSV pre-processed), VIC (CSVs pre-processed), TAS (live GeoServer API). QLD/SA/ACT/NT deferred ("Coming soon").
2. **Rebranded** — "Scraper"→"Finder", all "scrape" language removed from UI. New brand logo.
3. **Auto-refresh cron** — 1st of each month at 10am AWST, `scripts/update_licence_data.py` fetches latest NSW/VIC data, commits, pushes → Vercel redeploys.
4. **Per-row "Find Email" button** — Shows in Email column for every business without an email. Auto-discovers website if Google didn't provide one (Place Details retry → DuckDuckGo search → URL heuristic).
5. **Project moved** — From `~/hospitality-scraper/` to Google Drive shared folder (hospo-finder/).
6. **Suburb filter fix** — Address-based filtering after Google Places text search to exclude neighbouring suburbs.

## Current UI State

- State selector (8 states) + free-text town input
- Postcode lookup → auto-fills towns
- Category checkboxes for type filter
- Results table: Name, Address, Phone, **Email**, Categories, Town, ⭐
- **Flow**: Search → phones auto-enriched → results shown → user clicks **📧 Retrieve Emails** (bulk) → emails populated → user clicks **🍺 Verify Licences** → licence check → user exports CSV/JSON
- Top buttons: 📧 Retrieve Emails, 🍺 Verify Licences, 📥 Export CSV, 📥 Export JSON
- "Coming soon" licensing for QLD, SA, ACT, NT with manual check links
- Footer: © Quantum Innovation WA + disclaimer

## Known Issues

### Email Button Not Visible (FIXED)
Root cause: The `<button>` only showed when `r.website` was set — Google Places doesn't return websites for most businesses.
Fix applied: Button now shows on **every row without an email**. When clicked:
1. Retries Place Details API for website (may have cached empty from initial batch)
2. Falls back to DuckDuckGo search via the serverless function
3. Last resort: URL heuristics (tries `www.{name}.com.au` etc.)
→ **2026-07-30**: Per-row buttons removed entirely. Email retrieval is now a single bulk button: **📧 Retrieve Emails**.

### Lockridge Showing Neighbouring Suburbs (FIXED)
Root cause: Google Places Text Search returns results from a broad radius.
Fix applied: Post-search address filter — only keeps results whose `formatted_address` contains the target suburb (word-boundary matched).

### Email Button Duplicate API Calls (FIXED)
Minor: `fetchSingleEmail` has a duplicate `const apiBase = ...` line. Already fixed.

### getDetails INVALID_REQUEST on Phone Enrichment (FIXED 2026-07-30)
Root cause: `placesService.getDetails()` (JS library method backed by a hidden div) was returning `INVALID_REQUEST` for all places, despite `textSearch` working fine on the same instance. Even retrying without the `fields` parameter failed.
Fix applied (commit `a75a60b`): Replaced the PlacesService `getDetails` call with a direct **Places Details REST API** call via `fetch()`. This bypasses the JS library's quirky div-backed PlacesService compatibility issue entirely. The function is now `async` and uses `getKey()` to pass the user's API key directly — same key already exposed client-side to the JS library.

## Pending / Next Steps

1. **QLD, SA, ACT, NT deep licence checks** — No accessible open data sources found yet. Tagged "Coming soon" with manual check links.
2. **TAS data refresh** — TAS uses live API so no pre-processing needed, but could add caching.
3. **Email highlighter** — Would be useful to visually highlight rows with emails found.
4. **Website/Email discovery performance** — For businesses without a website, DuckDuckGo search takes ~10s each. Could optimise with a local business-name-to-URL heuristic cache.

## Recent Changes

- **[2026-07-30]** Fixed `getDetails` INVALID_REQUEST — switched Places JS library call to REST API `fetch()`.
- **[2026-07-30]** Email flow streamlined: removed per-row "Find Email" buttons. Replaced bulk button with **📧 Retrieve Emails** — one-click full email discovery (website finding + scraping) for all businesses. Licence verification untouched.

## Cron Jobs

| ID | Schedule | Script | Purpose |
|---|---|---|---|
| `71a30cf26f98` | 1st of month, 10:00 AWST | `scripts/update_licence_data.py` | Fetch latest NSW/VIC licence data, commit, push |
| Workdir: | `/home/benni/GoogleDrive/.../hospo-finder/` | | |

## Environment

- **Google Places API Key**: Visitor-supplied (client-side), never embedded
- **Deployment**: Vercel (static + serverless functions)
- **Email API**: `/api/email-fetch` — Vercel serverless function, scrapes HTML for emails
- **Licence API**: `/api/licence-check` — multi-state dispatcher
- **Data refresh**: Hermes cron + GitHub Actions weekly

## Language / Tone

- UI text: never use "scrape" — use "search", "find", "extract", "check"
- Brand: "Quantum Innovation WA"
- Voice: direct, Australian, no filler
