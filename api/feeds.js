// api/feeds.js — Vercel Serverless Function
// Fetches and aggregates RSS feeds from maritime news sources
// Deployed automatically by Vercel — no server needed

const FEEDS = [
  { name: 'The Maritime Executive', url: 'https://maritime-executive.com/rss/all', tag: 'news', color: '#D85A30' },
  { name: 'Offshore Energy', url: 'https://www.offshore-energy.biz/feed/', tag: 'energy', color: '#7F77DD' },
  { name: 'IMO Newsroom', url: 'https://www.imo.org/en/MediaCentre/PressBriefings/rss.xml', tag: 'policy', color: '#993C1D' },
  { name: 'Seatrade Maritime', url: 'https://www.seatrade-maritime.com/rss.xml', tag: 'news', color: '#1D9E75' },
  { name: 'Safety4Sea', url: 'https://safety4sea.com/feed/', tag: 'safety', color: '#378ADD' },
  { name: 'Ship Technology', url: 'https://www.ship-technology.com/feed/', tag: 'tech', color: '#534AB7' },
  { name: 'Riviera Maritime', url: 'https://www.rivieramm.com/rss', tag: 'news', color: '#BA7517' },
];

function parseRSS(xml, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const get = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const title = get('title');
    const link = get('link') || item.match(/<link>(.*?)<\/link>/)?.[1] || '';
    const desc = get('description').replace(/<[^>]+>/g, '').slice(0, 200);
    const pubDate = get('pubDate');
    const date = pubDate ? new Date(pubDate) : new Date();
    if (title) {
      items.push({
        id: Buffer.from(link || title).toString('base64').slice(0, 16),
        title: title.slice(0, 120),
        snippet: desc,
        link,
        source: source.name,
        tag: source.tag,
        color: source.color,
        date: date.toISOString(),
        ts: date.getTime()
      });
    }
  }
  return items.slice(0, 50);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

  const results = await Promise.allSettled(
    FEEDS.map(async (source) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const r = await fetch(source.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'ScheepsbouwPortal/1.0' }
        });
        clearTimeout(timeout);
        const xml = await r.text();
        return parseRSS(xml, source);
      } catch {
        clearTimeout(timeout);
        return [];
      }
    })
  );

  const articles = results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => b.ts - a.ts);

  res.json({ articles, updated: new Date().toISOString() });
}
