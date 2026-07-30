// Vercel Serverless Function — scrape emails from a business website
// Called from the browser app to bypass CORS restrictions
// URL:  /api/email-scrape?url=https://example.com

export default async function handler(req, res) {
  // CORS headers for browser calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query?.url || (req.body && req.body.url);
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    const html = await response.text();

    // Find all email addresses in the page
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const rawEmails = html.match(emailRegex) || [];

    // Deduplicate and filter out noise
    const seen = new Set();
    const emails = rawEmails.filter(e => {
      const key = e.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      // Filter obvious garbage
      if (key.includes('example.com') || key.includes('.png') || key.includes('.jpg')
          || key.includes('.css') || key.includes('.svg') || key.includes('.ico')
          || key.includes('@dummy') || key.includes('@test') || key.includes('@domain')) return false;
      return true;
    });

    return res.status(200).json({ url, emails });
  } catch (err) {
    return res.status(200).json({ url, emails: [], error: err.message });
  }
}
