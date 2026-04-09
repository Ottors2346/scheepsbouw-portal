// api/marketdata.js — Vercel Serverless Function
// Aggregates live market data from free public APIs and sources

function toNumber(value) {
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : Number(value);
  return Number.isFinite(num) ? num : null;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : null;
}

function formatIndex(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('nl-NL').format(Math.round(value)) : null;
}

function parseXmlTag(block = '', tag = '') {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i'));
  return match?.[1]?.trim() || '';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const results = {};

  // 1. Steel proxy / fallback card
  try {
    const d = await fetchJson(
      'https://commodities-api.com/api/latest?access_key=demo&base=USD&symbols=STEEL',
      { signal: AbortSignal.timeout(5000) }
    );
    results.steel = d?.data?.rates?.STEEL
      ? { value: Math.round(1 / d.data.rates.STEEL * 1000), unit: '$/ton', change: null }
      : { value: 487, unit: '$/ton', change: -2.1, demo: true };
  } catch {
    results.steel = { value: 487, unit: '$/ton', change: -2.1, demo: true };
  }

  // 2. Bunker prices from Bunker Index RSS
  try {
    const xml = await fetchText('https://www.bunkerindex.com/rss/prices.php', {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'MaritimeInformationPortal/1.0' }
    });

    const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
    let item;
    let vlsfo = null;
    let mgo = null;
    while ((item = itemRegex.exec(xml)) !== null) {
      const block = item[0];
      const title = parseXmlTag(block, 'title');
      const value = toNumber(parseXmlTag(block, 'value') || parseXmlTag(block, 'description'));
      if (!Number.isFinite(value)) continue;
      if (!vlsfo && /VLSFO/i.test(title)) vlsfo = value;
      if (!mgo && /(MGO|MGO\s*0\.1|MGOLSMGO)/i.test(title)) mgo = value;
    }

    results.bunker = {
      vlsfo: vlsfo ?? 612,
      mgo: mgo ?? 748,
      unit: '$/mt',
      demo: !(vlsfo || mgo)
    };
  } catch {
    results.bunker = { vlsfo: 612, mgo: 748, unit: '$/mt', demo: true };
  }

  // 3. EUR/USD from Frankfurter
  try {
    const latest = await fetchJson('https://api.frankfurter.app/latest?from=EUR&to=USD', {
      signal: AbortSignal.timeout(5000)
    });
    const series = await fetchJson('https://api.frankfurter.app/2026-01-01..9999-12-31?from=EUR&to=USD', {
      signal: AbortSignal.timeout(5000)
    }).catch(() => null);

    const current = toNumber(latest?.rates?.USD);
    let previous = null;
    if (series?.rates) {
      const vals = Object.values(series.rates).map(v => toNumber(v?.USD)).filter(Number.isFinite);
      previous = vals.length >= 2 ? vals.at(-2) : null;
    }

    results.eurusd = {
      value: fmt(current, 3) || '1.082',
      change: pctChange(current, previous),
      demo: !Number.isFinite(current)
    };
  } catch {
    results.eurusd = { value: '1.082', change: -0.4, demo: true };
  }

  // 4. Brent crude from Yahoo Finance chart API
  try {
    const d = await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=5d&interval=1d', {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    const nums = closes.map(toNumber).filter(Number.isFinite);
    const current = nums.at(-1);
    const previous = nums.length >= 2 ? nums.at(-2) : null;

    results.brent = Number.isFinite(current)
      ? { value: current.toFixed(2), unit: '$/bbl', change: pctChange(current, previous), demo: false }
      : { value: '81.40', unit: '$/bbl', change: -0.8, demo: true };
  } catch {
    results.brent = { value: '81.40', unit: '$/bbl', change: -0.8, demo: true };
  }

  // 5. Baltic Dry Index from Stooq CSV endpoint
  try {
    const csv = await fetchText('https://stooq.com/q/l/?s=bdi&i=d', {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    const rows = lines.slice(1).map(line => line.split(','));
    const latest = rows.at(-1);
    const previous = rows.length >= 2 ? rows.at(-2) : null;
    const currentVal = toNumber(latest?.[6]);
    const prevVal = toNumber(previous?.[6]);

    results.bdi = Number.isFinite(currentVal)
      ? { value: formatIndex(currentVal), change: pctChange(currentVal, prevVal), demo: false }
      : { value: '1.842', change: 1.2, demo: true };
  } catch {
    results.bdi = { value: '1.842', change: 1.2, demo: true };
  }

  results.updated = new Date().toISOString();
  res.json(results);
}
