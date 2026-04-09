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
  { name: 'MarineLink', url: 'https://www.marinelink.com/news/rss', tag: 'news', color: '#2E86C1' },
  { name: 'gCaptain', url: 'https://feeds.feedburner.com/gcaptain', tag: 'news', color: '#1F618D' },
  { name: 'Hellenic Shipping News', url: 'https://www.hellenicshippingnews.com/feed/', tag: 'news', color: '#117A65' },
  { name: 'Renewables Now', url: 'https://renewablesnow.com/news/rss/', tag: 'energy', color: '#27AE60' },
  { name: 'Port Technology International', url: 'https://www.porttechnology.org/feed/', tag: 'tech', color: '#8E44AD' },
  { name: 'Infomarine', url: 'https://infomarine.net/en/?format=feed&type=rss', tag: 'news', color: '#2874A6' },
  { name: 'Bureau Veritas Marine', url: 'https://marine-offshore.bureauveritas.com/newsroom', tag: 'policy', color: '#A93226' },
  { name: 'Windpower Monthly', url: 'https://www.windpowermonthly.com/news/rss', tag: 'energy', color: '#16A085' },
  { name: 'TED Maritime Tenders', url: 'ted://maritime', tag: 'orders', color: '#C97A1E' },
];

function stripHtml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function safeDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getTagValue(block, tags) {
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = block.match(regex);
    if (match?.[1]) return stripHtml(match[1]);
  }
  return '';
}

function parseRssItems(xml, source) {
  const items = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const title = getTagValue(block, ['title']);
    const desc = getTagValue(block, ['description', 'content:encoded']).slice(0, 220);
    const pubDate = getTagValue(block, ['pubDate', 'dc:date', 'published', 'updated']);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const link = stripHtml(linkMatch?.[1] || '');
    const date = safeDate(pubDate);
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
  return items;
}

function parseAtomItems(xml, source) {
  const items = [];
  const entryRegex = /<entry\b[\s\S]*?<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[0];
    const title = getTagValue(block, ['title']);
    const desc = getTagValue(block, ['summary', 'content']).slice(0, 220);
    const pubDate = getTagValue(block, ['updated', 'published']);
    const link = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?/i)?.[1] || '';
    const date = safeDate(pubDate);
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
  return items;
}

function parseHtmlCards(html, source) {
  const items = [];

  if (source.name === 'Bureau Veritas Marine') {
    const articleRegex = /<a[^>]*href="([^"]*\/newsroom\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const seen = new Set();
    while ((match = articleRegex.exec(html)) !== null) {
      const link = match[1].startsWith('http') ? match[1] : `https://marine-offshore.bureauveritas.com${match[1]}`;
      const title = stripHtml(match[2]).replace(/\s+Read More$/i, '').trim();
      if (!title || title.length < 8 || seen.has(link)) continue;
      seen.add(link);
      items.push({
        id: Buffer.from(link || title).toString('base64').slice(0, 16),
        title: title.slice(0, 120),
        snippet: '',
        link,
        source: source.name,
        tag: source.tag,
        color: source.color,
        date: new Date().toISOString(),
        ts: Date.now()
      });
    }
  }

  return items;
}


function decodeBase64Unicode(value = '') {
  try {
    return Buffer.from(value, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function buildTedSnippet(xml = '') {
  const candidates = [
    getTagValue(xml, ['cbc:Description', 'Description', 'DESCRIPTION']),
    getTagValue(xml, ['cbc:Name', 'Name', 'OFFICIALNAME']),
    getTagValue(xml, ['cbc:ProcurementProjectName', 'ProcurementProjectName']),
  ].filter(Boolean);
  return (candidates.join(' • ') || 'Actieve TED-aanbesteding in maritiem / offshore domein.').slice(0, 220);
}

function buildTedTitle(xml = '', docid = '') {
  const candidates = [
    getTagValue(xml, ['cbc:Title', 'Title', 'TITLE']),
    getTagValue(xml, ['cbc:ProcurementProjectName', 'ProcurementProjectName']),
    getTagValue(xml, ['cbc:Description', 'Description']),
    getTagValue(xml, ['cbc:Name', 'Name', 'OFFICIALNAME']),
  ].filter(Boolean);

  const title = candidates.find(Boolean) || `TED notice ${docid}`;
  return title.slice(0, 140);
}

async function fetchTedMaritimeNotices(source) {
  const maritimeQuery = [
    'notice-type=[cn-standard OR cn-social OR cn-desg OR pin-cfc-standard OR veat OR can-standard]',
    '(ship OR shipping OR vessel OR marine OR maritime OR port OR harbour OR offshore OR dredging OR dock OR quay OR windfarm OR wind turbine OR floating OR mooring)'
  ].join(' AND ');

  const payload = {
    q: maritimeQuery,
    fields: ['ND', 'PD', 'CONTENT'],
    scope: 'ACTIVE',
    pageNum: 1,
    pageSize: 25,
    sortField: 'PD',
    reverseOrder: true
  };

  const response = await fetch('https://ted.europa.eu/api/v3.0/notices/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'MaritimeInformationPortal/1.0'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`TED API status ${response.status}`);
  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  return results.map((row) => {
    const docid = row.ND || row.nd || row.docid || '';
    const date = safeDate(row.PD || row.pd || row.date);
    const xml = decodeBase64Unicode(row.CONTENT || row.content || '');
    const title = buildTedTitle(xml, docid);
    const snippet = buildTedSnippet(xml);
    const link = docid ? `https://ted.europa.eu/en/notice/-/detail/${docid}` : 'https://ted.europa.eu/en/';
    return {
      id: Buffer.from(link || title).toString('base64').slice(0, 16),
      title,
      snippet,
      link,
      source: source.name,
      tag: source.tag,
      color: source.color,
      date: date.toISOString(),
      ts: date.getTime()
    };
  }).filter(item => item.title && item.link);
}

function parseFeedResponse(body, source) {
  const xml = body || '';
  let items = [];

  if (/<item\b/i.test(xml)) items = parseRssItems(xml, source);
  else if (/<entry\b/i.test(xml)) items = parseAtomItems(xml, source);
  else items = parseHtmlCards(xml, source);

  return items
    .filter(item => item.title && item.link)
    .sort((a, b) => b.ts - a.ts)
    ;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

  const results = await Promise.allSettled(
    FEEDS.map(async (source) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), source.url.startsWith('ted://') ? 10000 : 6000);
      try {
        if (source.url.startsWith('ted://')) {
          clearTimeout(timeout);
          return await fetchTedMaritimeNotices(source);
        }
        const r = await fetch(source.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'MaritimeInformationPortal/1.0' }
        });
        clearTimeout(timeout);
        const xml = await r.text();
        return parseFeedResponse(xml, source);
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
