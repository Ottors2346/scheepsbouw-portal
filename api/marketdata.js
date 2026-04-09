// api/marketdata.js — Vercel Serverless Function
// Aggregates live market data from free public APIs and sources

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const results = {};

  // 1. Steel price proxy via commodity API (free tier: stxl = steel index)
  try {
    const r = await fetch(
      'https://commodities-api.com/api/latest?access_key=demo&base=USD&symbols=STEEL',
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await r.json();
    results.steel = d?.data?.rates?.STEEL
      ? { value: Math.round(1 / d.data.rates.STEEL * 1000), unit: '$/ton', change: null }
      : { value: 487, unit: '$/ton', change: -2.1, demo: true };
  } catch {
    results.steel = { value: 487, unit: '$/ton', change: -2.1, demo: true };
  }

  // 2. Bunker prices via Bunker Index RSS (free)
  try {
    const r = await fetch('https://www.bunkerindex.com/rss/prices.php', {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'ScheepsbouwPortal/1.0' }
    });
    const xml = await r.text();
    const vlsfoParse = xml.match(/VLSFO.*?<value>([\d.]+)<\/value>/s);
    const mgoParse = xml.match(/MGO.*?<value>([\d.]+)<\/value>/s);
    results.bunker = {
      vlsfo: vlsfoParse ? parseFloat(vlsfoParse[1]) : 612,
      mgo: mgoParse ? parseFloat(mgoParse[1]) : 748,
      unit: '$/mt',
      demo: !vlsfoParse
    };
  } catch {
    results.bunker = { vlsfo: 612, mgo: 748, unit: '$/mt', demo: true };
  }

  // 3. EUR/USD via open exchange rates (free, no key needed via frankfurter.app)
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD', {
      signal: AbortSignal.timeout(5000)
    });
    const d = await r.json();
    results.eurusd = {
      value: d?.rates?.USD ? d.rates.USD.toFixed(3) : '1.082',
      change: null,
      demo: !d?.rates?.USD
    };
  } catch {
    results.eurusd = { value: '1.082', change: -0.4, demo: true };
  }

  // 4. Crude oil price via open-source commodity feed
  try {
    const r = await fetch('https://api.api-ninjas.com/v1/commodityprice?name=crude_oil', {
      signal: AbortSignal.timeout(5000),
      headers: { 'X-Api-Key': 'demo' }
    });
    const d = await r.json();
    results.brent = d?.price
      ? { value: d.price.toFixed(1), unit: '$/bbl', change: null }
      : { value: '81.4', unit: '$/bbl', change: -0.8, demo: true };
  } catch {
    results.brent = { value: '81.4', unit: '$/bbl', change: -0.8, demo: true };
  }

  // 5. Baltic Dry Index — scraped from public source
  try {
    const r = await fetch('https://markets.businessinsider.com/index/baltic-dry-index', {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await r.text();
    const m = html.match(/class="price-section__current-value"[^>]*>([\d,]+)</);
    results.bdi = m
      ? { value: m[1], change: null, demo: false }
      : { value: '1.842', change: 1.2, demo: true };
  } catch {
    results.bdi = { value: '1.842', change: 1.2, demo: true };
  }

  results.updated = new Date().toISOString();
  res.json(results);
}
