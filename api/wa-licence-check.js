// WA Liquor Licence Deep Check — Vercel Serverless Function
// Queries the WA DLGSC public portal for licensed premises by suburb
// GET /api/wa-licence-check?suburbs=ALBANY,ESPERANCE

const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HospoFinder/1.0)' },
      timeout: 15000 
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk.toString('latin1'));
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  let suburbs;
  if (req.method === 'POST') {
    suburbs = (req.body && req.body.suburbs) || [];
  } else {
    suburbs = (req.query.suburbs || '').split(',').filter(Boolean);
  }
  
  if (!suburbs || !suburbs.length) {
    return res.status(400).json({ error: 'Provide suburbs param (comma-separated) or POST { suburbs: [...] }' });
  }
  
  const results = {};
  const errors = [];
  
  for (const rawSuburb of suburbs.slice(0, 30)) {
    const suburb = rawSuburb.trim().toUpperCase();
    const url = `https://portal.dlgsc.wa.gov.au/licencesearch?status=Current&suburb=${encodeURIComponent(suburb)}&group=Liquor+Premises`;
    
    try {
      const html = await fetchUrl(url);
      
      // Find the results table
      const tableStart = html.indexOf('id="table_id1"');
      if (tableStart === -1) { results[suburb] = []; continue; }
      
      // Find the table boundaries
      const tableOpen = html.lastIndexOf('<table', tableStart);
      const tableClose = html.indexOf('</table>', tableStart);
      if (tableOpen === -1 || tableClose === -1) { results[suburb] = []; continue; }
      
      const tableHtml = html.slice(tableOpen, tableClose + 8);
      
      // Extract data rows (skip header row)
      const names = [];
      let pos = 0;
      while (pos < tableHtml.length) {
        const trStart = tableHtml.indexOf('<tr', pos);
        if (trStart === -1) break;
        const trEnd = tableHtml.indexOf('</tr>', trStart);
        if (trEnd === -1) break;
        
        const row = tableHtml.slice(trStart, trEnd + 5);
        pos = trEnd + 5;
        
        // Extract all <td> cells
        const cells = [];
        let tdPos = 0;
        while (tdPos < row.length) {
          const tdStart = row.indexOf('<td', tdPos);
          if (tdStart === -1) break;
          const tdClose = row.indexOf('</td>', tdStart);
          if (tdClose === -1) break;
          
          // Get content between > and </td>
          const contentStart = row.indexOf('>', tdStart) + 1;
          const content = row.slice(contentStart, tdClose)
            .replace(/<[^>]+>/g, '')  // strip inner tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
            .trim();
          cells.push(content);
          tdPos = tdClose + 5;
        }
        
        // Data rows have 9 cells and first cell is a number (licence ref)
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          names.push({
            licence_ref: cells[0],
            licence_type: cells[1],
            name: cells[2],
            licensee: cells[3] || '',
            suburb: suburb
          });
        }
      }
      
      results[suburb] = names;
    } catch (err) {
      errors.push({ suburb, error: err.message });
      results[suburb] = [];
    }
  }
  
  res.json({ state: 'WA', results, errors });
};
