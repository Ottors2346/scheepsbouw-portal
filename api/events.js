const CURATED_EVENTS = [
  {
    title: 'Posidonia 2026',
    location: 'Athene, Griekenland',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
    link: 'https://posidonia-events.com/',
    source: 'Curated maritime calendar'
  },
  {
    title: 'SMM Hamburg 2026',
    location: 'Hamburg, Duitsland',
    startDate: '2026-09-01',
    endDate: '2026-09-04',
    link: 'https://www.smm-hamburg.com/',
    source: 'Curated maritime calendar'
  },
  {
    title: 'Offshore Energy Exhibition & Conference 2026',
    location: 'Amsterdam, Nederland',
    startDate: '2026-11-24',
    endDate: '2026-11-25',
    link: 'https://oeec.biz/',
    source: 'Curated maritime calendar'
  },
  {
    title: 'Europort 2027',
    location: 'Rotterdam, Nederland',
    startDate: '2027-11-02',
    endDate: '2027-11-05',
    link: 'https://www.europort.nl/',
    source: 'Curated maritime calendar'
  },
  {
    title: 'Nor-Shipping 2027',
    location: 'Oslo / Lillestrøm, Noorwegen',
    startDate: '2027-06-07',
    endDate: '2027-06-11',
    link: 'https://nor-shipping.com/',
    source: 'Curated maritime calendar'
  }
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

function normalizeEvent(event) {
  return {
    id: Buffer.from(`${event.link || event.title}-${event.startDate}`).toString('base64').slice(0, 18),
    title: event.title,
    location: event.location || '',
    startDate: safeDate(event.startDate).toISOString(),
    endDate: safeDate(event.endDate || event.startDate).toISOString(),
    link: event.link || '',
    source: event.source || 'Agenda',
    ts: safeDate(event.startDate).getTime()
  };
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.title}|${event.startDate}|${event.location}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseJsonLdEvents(html, sourceName = 'Wake Media Maritime Calendar') {
  const results = [];
  const scripts = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];

  for (const script of scripts) {
    const jsonText = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(jsonText);
      const nodes = Array.isArray(parsed) ? parsed : (Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]);
      for (const node of nodes) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
        if (!types.includes('Event')) continue;
        if (!node.name || !node.startDate) continue;
        results.push(normalizeEvent({
          title: stripHtml(node.name),
          location: stripHtml(node.location?.name || node.location?.address?.addressLocality || ''),
          startDate: node.startDate,
          endDate: node.endDate || node.startDate,
          link: node.url || '',
          source: sourceName
        }));
      }
    } catch {}
  }

  return results;
}

function parseWakeHtmlCards(html) {
  const results = [];
  const regex = /<a[^>]*href=["']([^"']*\/api\/view\/\d+\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const link = match[1].startsWith('http') ? match[1] : `https://maritime-calendar.com${match[1]}`;
    const text = stripHtml(match[2]);
    if (!text || text.length < 6) continue;
    results.push(normalizeEvent({
      title: text.slice(0, 140),
      location: '',
      startDate: new Date().toISOString(),
      endDate: new Date().toISOString(),
      link,
      source: 'Wake Media Maritime Calendar'
    }));
  }
  return results;
}

async function fetchWakeMediaEvents() {
  const urls = [
    'https://maritime-calendar.com/',
    'https://wake-media.co.uk/maritime-calendar/'
  ];

  const collected = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ScheepsbouwPortal/1.0' }
      });
      if (!response.ok) continue;
      const html = await response.text();
      collected.push(...parseJsonLdEvents(html));
      collected.push(...parseWakeHtmlCards(html));
    } catch {}
  }

  return dedupeEvents(collected)
    .filter(event => event.ts >= Date.now() - 86400000)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 12);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');

  const curated = CURATED_EVENTS.map(normalizeEvent);
  const wakeEvents = await fetchWakeMediaEvents();
  const events = dedupeEvents([...wakeEvents, ...curated])
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 20);

  res.json({
    events,
    updated: new Date().toISOString(),
    source_mode: wakeEvents.length ? 'wake-media-plus-curated' : 'curated-fallback'
  });
}
