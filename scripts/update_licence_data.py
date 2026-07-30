#!/usr/bin/env python3
"""
Update NSW/VIC liquor licence data files from open data portals.
Commits and pushes to GitHub → triggers Vercel redeploy.
Designed to run as a monthly cron job.
"""

import csv, json, io, os, subprocess, sys, urllib.request

REPO_DIR = os.path.expanduser('/home/benni/hospitality-scraper')
DATA_DIR = os.path.join(REPO_DIR, 'data')

def log(msg):
    print(f"[{__file__}] {msg}")

def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': 'HospoFinder-Updater/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8')

# =========================================================================
# NSW — download latest CSV from data.nsw.gov.au
# =========================================================================
def update_nsw():
    log("Updating NSW data...")
    # Find latest resource via CKAN API
    api_url = "https://data.nsw.gov.au/data/api/3/action/package_show?id=liquor-licence-premises-list"
    data = json.loads(fetch(api_url))
    resources = data['result']['resources']
    resources.sort(key=lambda r: r.get('last_modified') or '', reverse=True)
    latest = None
    for r in resources:
        if r.get('format') == 'CSV' and r.get('url'):
            latest = r
            break
    if not latest:
        log("No NSW CSV resource found")
        return False

    log(f"  Latest: {latest.get('name')} ({latest.get('last_modified')})")
    csv_content = fetch(latest['url'], timeout=120)

    reader = csv.DictReader(io.StringIO(csv_content))
    nsw_lookup = {}
    current_total = 0
    for row in reader:
        status = (row.get('Status') or '').strip()
        if status != 'Current':
            continue
        suburb = (row.get('Suburb') or '').strip().upper()
        if not suburb:
            continue
        name = (row.get('Licence name') or '').strip()
        licensee = (row.get('Licensee') or '').strip()
        licence_type = (row.get('Licence type') or '').strip()
        if not name:
            continue
        nsw_lookup.setdefault(suburb, []).append({
            'name': name, 'licensee': licensee, 'type': licence_type
        })
        current_total += 1

    log(f"  {current_total} current licences, {len(nsw_lookup)} suburbs")

    path = os.path.join(DATA_DIR, 'nsw_licences.json')
    with open(path, 'w') as f:
        json.dump(nsw_lookup, f)
    log(f"  Written {os.path.getsize(path) / 1024 / 1024:.1f} MB")
    return True

# =========================================================================
# VIC — download all 12 per-category CSVs from discover.data.vic.gov.au
# =========================================================================
def update_vic():
    log("Updating VIC data...")
    api_url = "https://discover.data.vic.gov.au/api/3/action/package_show?id=a265ef83-1190-4c63-ac51-a0ca3966c666"
    data = json.loads(fetch(api_url))
    csv_urls = [r['url'] for r in data['result']['resources'] if r.get('format') == 'CSV']

    if not csv_urls:
        log("No VIC CSV resources found")
        return False

    log(f"  {len(csv_urls)} CSV files to download")

    vic_lookup = {}
    total = 0

    for csv_url in csv_urls:
        cat_name = ' '.join(csv_url.split('/')[-1].replace('.csv', '').split('_')).title()
        try:
            content = fetch(csv_url, timeout=60)
            reader = csv.DictReader(io.StringIO(content))
            for row in reader:
                total += 1
                suburb = (row.get('Suburb') or '').strip().upper()
                if not suburb:
                    continue
                name = (row.get('PremisesName') or '').strip()
                if not name:
                    continue
                vic_lookup.setdefault(suburb, []).append({
                    'name': name, 'licensee': name, 'type': cat_name
                })
        except Exception as e:
            log(f"    Error downloading {cat_name}: {e}")

    log(f"  {total} rows, {len(vic_lookup)} suburbs")

    path = os.path.join(DATA_DIR, 'vic_licences.json')
    with open(path, 'w') as f:
        json.dump(vic_lookup, f)
    log(f"  Written {os.path.getsize(path) / 1024 / 1024:.1f} MB")
    return True

# =========================================================================
# Git commit and push
# =========================================================================
def git_push():
    log("Committing and pushing...")
    os.chdir(REPO_DIR)

    # Check if anything changed
    result = subprocess.run(
        ['git', 'diff', '--stat', '--', 'data/nsw_licences.json', 'data/vic_licences.json'],
        capture_output=True, text=True
    )
    if not result.stdout.strip():
        log("  No changes to data files")
        # Still check if there's a newer upstream commit to pull
        return True

    subprocess.run(['git', 'add', 'data/nsw_licences.json', 'data/vic_licences.json'],
                   capture_output=True)
    result = subprocess.run(
        ['git', 'commit', '-m', 'chore: monthly refresh of NSW/VIC licence data'],
        capture_output=True, text=True
    )
    log(f"  {result.stdout.strip()}")

    result = subprocess.run(['git', 'push'], capture_output=True, text=True)
    log(f"  {result.stdout.strip()}")
    return True

# =========================================================================
# Main
# =========================================================================
if __name__ == '__main__':
    log("Starting licence data update...")
    nsw_ok = update_nsw()
    vic_ok = update_vic()
    if nsw_ok or vic_ok:
        git_push()
    log("Done")
