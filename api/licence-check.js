// Multi-State Licence Deep Check — Vercel Serverless Function
// Supports: WA (live), NSW/VIC (pre-processed lookup), TAS (live GeoServer)
// Others: coming soon
// GET /api/licence-check?state=WA&suburbs=ALBANY,BASSENDEAN

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load pre-processed data files (bundled with deployment)
const DATA_DIR = path.join(__dirname, '..', 'data');
let nswData = null;
let vicData = null;

function loadData() {
  try {
    const nswPath = path.join(DATA_DIR, 'nsw_licences.json');
    if (fs.existsSync(nswPath)) {
      nswData = JSON.parse(fs.readFileSync(nswPath, 'utf-8'));
      console.log(`NSW data loaded: ${Object.keys(nswData).length} suburbs`);
    }
  } catch (e) { console.error('NSW data load error:', e.message); }
  try {
    const vicPath = path.join(DATA_DIR, 'vic_licences.json');
    if (fs.existsSync(vicPath)) {
      vicData = JSON.parse(fs.readFileSync(vicPath, 'utf-8'));
      console.log(`VIC data loaded: ${Object.keys(vicData).length} suburbs`);
    }
  } catch (e) { console.error('VIC data load error:', e.message); }
}

// Helper: fetch URL (for WA and TAS live queries)
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HospoFinder/1.0)' },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk.toString());
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

// ====================================================================
// State Handlers
// ====================================================================

// WA: query the live DLGSC portal by suburb
async function checkWA(suburbs) {
  const results = {};
  const errors = [];
  for (const raw of suburbs) {
    const suburb = raw.trim().toUpperCase();
    const url = `https://portal.dlgsc.wa.gov.au/licencesearch?status=Current&suburb=${encodeURIComponent(suburb)}&group=Liquor+Premises`;
    try {
      const html = await fetchUrl(url);
      const names = [];
      // Find the results table
      let si = html.indexOf('id="table_id1"');
      if (si === -1) { results[suburb] = []; continue; }
      const to = html.lastIndexOf('<table', si);
      const tc = html.indexOf('</table>', si);
      if (to === -1 || tc === -1) { results[suburb] = []; continue; }
      const th = html.slice(to, tc + 8);
      let pos = 0;
      while (pos < th.length) {
        const trs = th.indexOf('<tr', pos);
        if (trs === -1) break;
        const tre = th.indexOf('</tr>', trs);
        if (tre === -1) break;
        const row = th.slice(trs, tre + 5);
        pos = tre + 5;
        const cells = [];
        let tp = 0;
        while (tp < row.length) {
          const tds = row.indexOf('<td', tp);
          if (tds === -1) break;
          const tde = row.indexOf('</td>', tds);
          if (tde === -1) break;
          const cs = row.indexOf('>', tds) + 1;
          const c = row.slice(cs, tde)
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
            .trim();
          cells.push(c);
          tp = tde + 5;
        }
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          names.push({ name: cells[2], licensee: cells[3] || '', type: cells[1] });
        }
      }
      results[suburb] = names;
    } catch (err) {
      errors.push({ suburb, error: err.message });
      results[suburb] = [];
    }
  }
  return { results, errors };
}

// NSW: pre-processed JSON lookup
function checkNSW(suburbs) {
  if (!nswData) return { results: {}, errors: [{ error: 'NSW data not loaded' }] };
  const results = {};
  for (const raw of suburbs) {
    const suburb = raw.trim().toUpperCase();
    results[suburb] = nswData[suburb] || [];
  }
  return { results, errors: [] };
}

// VIC: pre-processed JSON lookup
function checkVIC(suburbs) {
  if (!vicData) return { results: {}, errors: [{ error: 'VIC data not loaded' }] };
  const results = {};
  for (const raw of suburbs) {
    const suburb = raw.trim().toUpperCase();
    results[suburb] = vicData[suburb] || [];
  }
  return { results, errors: [] };
}

// TAS: live GeoServer API query by address contains suburb
async function checkTAS(suburbs) {
  const results = {};
  const errors = [];
  for (const raw of suburbs) {
    const suburb = raw.trim().toUpperCase();
    const where = encodeURIComponent(`UPPER(PREMISE_AD) LIKE '%${suburb.replace(/'/g, "''")}%'`);
    const url = `https://services.thelist.tas.gov.au/arcgis/rest/services/Public/EmergencyManagementPublic/MapServer/16/query?where=${where}&outFields=PREMISE_NA,CATEGORY,SUB_CATEGO,PREMISE_AD&returnGeometry=false&f=json`;
    try {
      const json = await fetchUrl(url);
      const data = JSON.parse(json);
      const names = (data.features || []).map(f => ({
        name: f.attributes.PREMISE_NA || '',
        licensee: f.attributes.PREMISE_NA || '',
        type: (f.attributes.CATEGORY || '') + (f.attributes.SUB_CATEGO ? ' - ' + f.attributes.SUB_CATEGO : '')
      })).filter(r => r.name);
      results[suburb] = names;
    } catch (err) {
      errors.push({ suburb, error: err.message });
      results[suburb] = [];
    }
  }
  return { results, errors };
}

// ====================================================================
// Main handler
// ====================================================================
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Load data on first call
  if (!nswData && !vicData) loadData();

  // Parse state + suburbs
  let state = '';
  let suburbs = [];
  if (req.method === 'POST' && req.body) {
    state = (req.body.state || '').toUpperCase();
    suburbs = req.body.suburbs || [];
  } else {
    state = ((req.query.state || 'WA')).toUpperCase();
    suburbs = ((req.query.suburbs || '')).split(',').filter(Boolean);
  }

  if (!suburbs.length) {
    return res.status(400).json({ error: 'Provide suburbs param (comma-separated) or POST { suburbs: [...], state: "..." }' });
  }
  if (!state || !['WA', 'NSW', 'VIC', 'TAS', 'QLD', 'SA', 'ACT', 'NT'].includes(state)) {
    return res.status(400).json({ error: `Invalid state: ${state}` });
  }

  const unsupportedStates = { QLD: 'QLD', SA: 'SA', ACT: 'ACT', NT: 'NT' };
  if (unsupportedStates[state]) {
    return res.json({
      state,
      results: Object.fromEntries(suburbs.map(s => [s.toUpperCase(), []])),
      errors: [{ error: `${state} register not yet supported — coming soon` }],
      unsupported: true
    });
  }

  let result;
  try {
    switch (state) {
      case 'WA':
        result = await checkWA(suburbs);
        break;
      case 'NSW':
        result = checkNSW(suburbs);
        break;
      case 'VIC':
        result = checkVIC(suburbs);
        break;
      case 'TAS':
        result = await checkTAS(suburbs);
        break;
      default:
        result = { results: {}, errors: [{ error: 'Unknown state' }] };
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({ state, ...result });
};
