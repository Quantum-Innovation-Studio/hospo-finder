// Vercel Serverless Function — find emails from a business website
// URL:  /api/email-fetch?url=https://example.com     — scrape that URL for emails
//       /api/email-fetch?search=name+town             — find website + scrape emails

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Mode 1: direct URL scrape
  const url = req.query?.url || (req.body && req.body.url);
  if (url) {
    const result = await scrapeUrl(url);
    return res.status(200).json(result);
  }

  // Mode 2: search for a website first
  const searchQuery = req.query?.search;
  if (!searchQuery) return res.status(400).json({ error: 'url or search parameter required' });

  try {
    // Try DuckDuckGo HTML search
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });
    clearTimeout(timeout);
    const html = await response.text();

    // Extract the first real business website link
    const linkRegex = /<a[^>]+class="result__a"[^>]+href="https?:\/\/([^"]+)"[^>]*>/g;
    let match;
    const skipDomains = ['google.com', 'facebook.com', 'instagram.com', 'twitter.com', 'youtube.com',
      'linkedin.com', 'yelp.com', 'tripadvisor.com', 'true.local', 'yellowpages.com'];
    let foundUrl = null;
    while ((match = linkRegex.exec(html)) !== null) {
      const domain = match[1].toLowerCase();
      if (!skipDomains.some(sd => domain.includes(sd))) {
        foundUrl = 'https://' + match[1].split('/')[0];
        break;
      }
    }

    if (foundUrl) {
      const result = await scrapeUrl(foundUrl);
      return res.status(200).json({ ...result, website: foundUrl });
    }

    // Fallback: URL heuristics based on business name
    const nameSlug = searchQuery
      .split(',')[0]
      .toLowerCase()
      .replace(/[^a-z0-9&']/g, '')
      .replace(/&/g, 'and')
      .substring(0, 30);
    const attempts = [
      `https://www.${nameSlug}.com.au`,
      `https://www.${nameSlug}.com`,
      `https://${nameSlug}.com.au`,
    ];
    for (const guessUrl of attempts) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 5000);
        const resp = await fetch(guessUrl, { method: 'HEAD', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        clearTimeout(to);
        if (resp.ok || resp.status === 403) {
          const result = await scrapeUrl(guessUrl);
          return res.status(200).json({ ...result, website: guessUrl });
        }
      } catch (e) { /* skip */ }
    }

    return res.status(200).json({ url: null, emails: [], website: null, error: 'No website found for this business' });
  } catch (err) {
    return res.status(200).json({ url: null, emails: [], website: null, error: err.message });
  }
}

async function scrapeUrl(targetUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    });
    clearTimeout(timeout);
    const html = await response.text();

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const rawEmails = html.match(emailRegex) || [];
    const seen = new Set();
    const emails = rawEmails.filter(e => {
      const key = e.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      if (key.includes('example.com') || key.includes('.png') || key.includes('.jpg')
          || key.includes('.css') || key.includes('.svg') || key.includes('.ico')
          || key.includes('@dummy') || key.includes('@test') || key.includes('@domain')) return false;
      return true;
    });

    return { url: targetUrl, emails };
  } catch (err) {
    return { url: targetUrl, emails: [], error: err.message };
  }
}
