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
  { name: 'Marineschepen.nl', url: 'https://marineschepen.nl/nieuws/', tag: 'news', color: '#4D6FB3' },
  { name: 'Windassist', url: 'https://windassist.nl/feed', tag: 'energy', color: '#45B39D' },
  { name: 'Scheepspost', url: 'https://scheepspost.info/feed', tag: 'news', color: '#F39C12' },
  { name: 'Vaart.nl', url: 'https://www.vaart.nl/Handlers/RSS.ashx?rss=VaartNieuws&categorieID=1000000030', tag: 'news', color: '#5D6D7E' },
  { name: 'Offshore Energy – Middle East', url: 'https://www.offshore-energy.biz/region/middle-east/', tag: 'energy', color: '#8E44AD' },
  { name: 'Splash247', url: 'https://splash247.com/feed/', tag: 'news', color: '#3498DB' },
  { name: 'Middle East Construction News', url: 'https://meconstructionnews.com/feed/', tag: 'news', color: '#AF601A' },
  { name: 'GlobalTenders Middle East Marine', url: 'https://www.globaltenders.com/middle-east/me-marine-tenders', tag: 'orders', color: '#B9770E' },
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


function parseDateLoose(value = '') {
  const cleaned = stripHtml(value).replace(/\s+/g, ' ').trim();
  if (!cleaned) return new Date();
  const direct = new Date(cleaned);
  if (!Number.isNaN(direct.getTime())) return direct;
  const short = cleaned.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/);
  if (short) {
    const d = new Date(`${short[1]} ${short[2]} ${short[3]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function makeItem({ title, snippet = '', link = '', source, date = new Date() }) {
  const parsedDate = safeDate(date instanceof Date ? date.toISOString() : date);
  return {
    id: Buffer.from(link || title).toString('base64').slice(0, 16),
    title: stripHtml(title).slice(0, 120),
    snippet: stripHtml(snippet).slice(0, 220),
    link,
    source: source.name,
    tag: source.tag,
    color: source.color,
    date: parsedDate.toISOString(),
    ts: parsedDate.getTime()
  };
}

function absoluteUrl(base, href = '') {
  if (!href) return '';
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function parseHtmlCards(html, source) {
  const items = [];
  const seen = new Set();

  const pushItem = ({ title, link, snippet = '', date = new Date() }) => {
    const absLink = absoluteUrl(source.url, link);
    if (!title || !absLink || seen.has(absLink)) return;
    seen.add(absLink);
    items.push(makeItem({ title, snippet, link: absLink, source, date }));
  };

  if (source.name === 'Bureau Veritas Marine') {
    const articleRegex = /<a[^>]*href="([^"]*\/newsroom\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
      pushItem({ title: match[2], link: match[1] });
    }
  }

  if (source.name === 'Marineschepen.nl') {
    const articleRegex = /<a[^>]*href="([^"]*\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
      const title = stripHtml(match[2]).replace(/\s+/g, ' ').trim();
      if (title.length >= 10) pushItem({ title, link: match[1] });
    }
  }

  if (source.name === 'Offshore Energy – Middle East') {
    const cardRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]{0,1200}?)<\/a>/gi;
    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const chunk = match[2];
      const titleMatch = chunk.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i) || chunk.match(/title="([^"]+)"/i);
      const dateMatch = chunk.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
      const title = stripHtml(titleMatch?.[1] || '');
      if (title.length >= 10) pushItem({ title, link: match[1], date: parseDateLoose(dateMatch?.[1] || '') });
    }
  }

  if (source.name === 'GlobalTenders Middle East Marine') {
    const plain = stripHtml(html)
      .replace(/\s+/g, ' ')
      .replace(/View Detail/g, '\nView Detail\n')
      .replace(/posting date/g, '\nposting date ')
      .replace(/deadline/g, ' deadline ');
    const titleMatches = [...plain.matchAll(/\n?([A-Z0-9][A-Za-z0-9/&(),.'’\-\s]{15,180}?)\s+(?:Turkey|Saudi Arabia|Oman|United Arab Emirates|Egypt|Jordan|Cyprus|Qatar|Bahrain|Kuwait|Iran|Iraq|Israel|Lebanon|Syria|Yemen)\s+\d{2}\s+[A-Za-z]{3}\s+\d{4}/g)];
    const dateMatches = [...plain.matchAll(/posting date\s*(\d{2}\s+[A-Za-z]{3}\s+\d{4})/gi)];
    for (let i = 0; i < Math.min(titleMatches.length, 20); i++) {
      const title = stripHtml(titleMatches[i][1]);
      const date = dateMatches[i]?.[1] || '';
      pushItem({ title, link: source.url + `#notice-${i + 1}`, snippet: 'Tenderlisting uit GlobalTenders Middle East Marine.', date: parseDateLoose(date) });
    }
  }

  if (source.name === 'Middle East Construction News') {
    const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const title = stripHtml(match[2]);
      if (title.length >= 12) pushItem({ title, link: match[1] });
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

  const results = await Promise.all(
    FEEDS.map(async (source) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), source.url.startsWith('ted://') ? 12000 : 8000);
      try {
        let articles = [];
        if (source.url.startsWith('ted://')) {
          clearTimeout(timeout);
          articles = await fetchTedMaritimeNotices(source);
        } else {
          const r = await fetch(source.url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'MaritimeInformationPortal/1.0' }
          });
          clearTimeout(timeout);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const body = await r.text();
          articles = parseFeedResponse(body, source);
        }
        return {
          source: source.name,
          url: source.url,
          ok: articles.length > 0,
          count: articles.length,
          error: articles.length ? '' : 'Geen artikelen gevonden',
          articles
        };
      } catch (error) {
        clearTimeout(timeout);
        return {
          source: source.name,
          url: source.url,
          ok: false,
          count: 0,
          error: error?.name === 'AbortError' ? 'Timeout' : (error?.message || 'Onbekende fout'),
          articles: []
        };
      }
    })
  );

  const articles = results
    .flatMap(r => r.articles)
    .sort((a, b) => b.ts - a.ts);

  const sourceStatus = results.map(({ source, url, ok, count, error }) => ({ source, url, ok, count, error }));

  res.json({ articles, sourceStatus, updated: new Date().toISOString() });
}
