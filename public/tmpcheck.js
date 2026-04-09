
// ── CONFIG ────────────────────────────────────────────────────────────
// When running locally: set BASE_URL to empty string ''
// When deployed on Vercel: set to your Vercel URL e.g. 'https://scheepsbouw.vercel.app'
// Or leave as '' and the portal uses fallback data + direct browser API calls
const BASE_URL = window.location.origin;

const SOURCES = [
  { name: 'The Maritime Executive', url: 'https://maritime-executive.com/rss/all', tag: 'news', color: '#4a9ed6', on: true },
  { name: 'Offshore Energy', url: 'https://www.offshore-energy.biz/feed/', tag: 'energy', color: '#2ecc71', on: true },
  { name: 'IMO Newsroom', url: 'https://www.imo.org/en/MediaCentre/PressBriefings/rss.xml', tag: 'policy', color: '#e87060', on: true },
  { name: 'Seatrade Maritime', url: 'https://www.seatrade-maritime.com/rss.xml', tag: 'news', color: '#1D9E75', on: true },
  { name: 'Safety4Sea', url: 'https://safety4sea.com/feed/', tag: 'safety', color: '#f0a830', on: true },
  { name: 'Ship Technology', url: 'https://www.ship-technology.com/feed/', tag: 'tech', color: '#a080e0', on: true },
  { name: 'Riviera Maritime', url: 'https://www.rivieramm.com/rss', tag: 'news', color: '#BA7517', on: true },
  { name: 'MarineLink', url: 'https://www.marinelink.com/news/rss', tag: 'news', color: '#2E86C1', on: true },
  { name: 'gCaptain', url: 'https://feeds.feedburner.com/gcaptain', tag: 'news', color: '#1F618D', on: true },
  { name: 'Hellenic Shipping News', url: 'https://www.hellenicshippingnews.com/feed/', tag: 'news', color: '#117A65', on: true },
  { name: 'Renewables Now', url: 'https://renewablesnow.com/news/rss/', tag: 'energy', color: '#27AE60', on: true },
  { name: 'Port Technology International', url: 'https://www.porttechnology.org/feed/', tag: 'tech', color: '#8E44AD', on: true },
  { name: 'Infomarine', url: 'https://infomarine.net/en/?format=feed&type=rss', tag: 'news', color: '#2874A6', on: true },
  { name: 'Bureau Veritas Marine', url: 'https://marine-offshore.bureauveritas.com/newsroom', tag: 'policy', color: '#A93226', on: true },
  { name: 'Windpower Monthly', url: 'https://www.windpowermonthly.com/news/rss', tag: 'energy', color: '#16A085', on: true },
  { name: 'TED Maritime Tenders', url: 'ted://maritime', tag: 'orders', color: '#C97A1E', on: true },
];

// ── STATE ─────────────────────────────────────────────────────────────
let allArticles = [];
let marketData = {};
let selectedIds = new Set();
let feedFilter = 'alle';
let customFeeds = JSON.parse(localStorage.getItem('customFeeds') || '[]');
let sourceStates = JSON.parse(localStorage.getItem('sourceStates') || '{}');
let searchQuery = '';
let allEvents = [];
const PAGE_SIZE = 100;
let dashVisibleCount = PAGE_SIZE;
let feedVisibleCount = PAGE_SIZE;


function syncSearchInputs() {
  const dashInput = document.getElementById('dash-search');
  const feedInput = document.getElementById('feed-search');
  if (dashInput && dashInput.value !== searchQuery) dashInput.value = searchQuery;
  if (feedInput && feedInput.value !== searchQuery) feedInput.value = searchQuery;
}

function updateSearch(value) {
  searchQuery = (value || '').trim().toLowerCase();
  syncSearchInputs();
  dashVisibleCount = PAGE_SIZE;
  feedVisibleCount = PAGE_SIZE;
  renderDash();
  renderFeed();
}

function clearSearch() {
  updateSearch('');
}

function getFilteredArticles() {
  return allArticles.filter(a => {
    const matchesFilter = feedFilter === 'alle' || a.tag === feedFilter;
    const haystack = [a.title, a.snippet, a.source].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !searchQuery || haystack.includes(searchQuery);
    return matchesFilter && matchesSearch;
  });
}

// ── INIT ──────────────────────────────────────────────────────────────
function init() {
  // Header date
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const wk = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  document.getElementById('header-date').textContent =
    now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('header-week').textContent = `Week ${wk}`;

  loadAll();
  renderSourcesPage();
}

async function loadAll() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.classList.add('spinning');
  await Promise.all([loadFeeds(), loadMarketData(), loadEvents()]);
  if (btn) btn.classList.remove('spinning');
}

// ── FEEDS ─────────────────────────────────────────────────────────────
async function loadFeeds() {
  try {
    let articles = [];
    dashVisibleCount = PAGE_SIZE;
    feedVisibleCount = PAGE_SIZE;

    if (BASE_URL) {
      // Production: use backend API
      const r = await fetch(`${BASE_URL}/api/feeds`);
      const d = await r.json();
      articles = d.articles || [];
    } else {
      // Local / no backend: fetch RSS directly via allorigins.win proxy
      const allSources = [...SOURCES, ...customFeeds].filter(s => sourceStates[s.name] !== false && s.on !== false);
      const results = await Promise.allSettled(
        allSources.map(s => fetchRSS(s))
      );
      articles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      articles.sort((a, b) => b.ts - a.ts);
    }

    // Filter by active sources
    const activeSources = [...SOURCES, ...customFeeds]
      .filter(s => sourceStates[s.name] !== false)
      .map(s => s.name);

    allArticles = articles.filter(a => activeSources.includes(a.source) || BASE_URL);

    renderDash();
    renderFeed();
    renderSidebarSources();
  } catch (e) {
    document.getElementById('dash-articles').innerHTML =
      `<div class="error-state">Kon nieuws niet laden: ${e.message}. Controleer je internetverbinding.</div>`;
  }
}

async function fetchRSS(source) {
  // Use allorigins.win as CORS proxy for local use
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(source.url)}`;
  const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  return parseRSS(d.contents || '', source);
}

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

function buildArticle({ title, snippet = '', link = '', date, source }) {
  return {
    id: btoa(encodeURIComponent(link || title)).slice(0, 16),
    title: title.slice(0, 130),
    snippet,
    link,
    source: source.name,
    tag: source.tag,
    color: source.color,
    date: date.toISOString(),
    ts: date.getTime()
  };
}

function formatEventMonth(date) {
  return date.toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '');
}

function formatEventDateRange(start, end) {
  const startDate = safeDate(start);
  const endDate = safeDate(end || start);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return startDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return `${startDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${endDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

async function loadEvents() {
  const fallbackEvents = [
    { title: 'Nor-Shipping', location: 'Lillestrøm / Oslo, Noorwegen', startDate: '2027-01-12', endDate: '2027-01-15', link: 'https://nor-shipping.com/', source: 'Curated fallback' },
    { title: 'Posidonia', location: 'Athene, Griekenland', startDate: '2026-06-01', endDate: '2026-06-05', link: 'https://posidonia-events.com/', source: 'Curated fallback' },
    { title: 'SMM Hamburg', location: 'Hamburg, Duitsland', startDate: '2026-09-01', endDate: '2026-09-04', link: 'https://www.smm-hamburg.com/', source: 'Curated fallback' },
    { title: 'Offshore Energy Exhibition & Conference', location: 'Amsterdam, Nederland', startDate: '2026-11-24', endDate: '2026-11-25', link: 'https://www.offshore-energy.biz/offshore-energy-exhibition-conference/', source: 'Curated fallback' },
    { title: 'Europort', location: 'Rotterdam, Nederland', startDate: '2027-11-02', endDate: '2027-11-05', link: 'https://www.europort.nl/', source: 'Curated fallback' }
  ];

  try {
    const r = await fetch(`${BASE_URL}/api/events`);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const d = await r.json();
    allEvents = Array.isArray(d.events) && d.events.length ? d.events : fallbackEvents;
  } catch (e) {
    allEvents = fallbackEvents;
  }
  renderEvents();
}

function renderEvents() {
  const now = new Date();
  const upcoming = allEvents
    .map(e => ({ ...e, ts: safeDate(e.startDate).getTime() }))
    .filter(e => e.ts >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime())
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 8);

  const html = upcoming.length
    ? upcoming.map(e => {
        const start = safeDate(e.startDate);
        const month = formatEventMonth(start);
        const day = start.getDate();
        const name = e.link
          ? `<a href="${e.link}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${e.title}</a>`
          : e.title;
        return `
          <div class="event-row">
            <div class="event-date-box"><div class="event-day">${day}</div><div class="event-mon">${month}</div></div>
            <div class="event-info">
              <div class="event-name">${name}</div>
              <div class="event-loc">${e.location || 'Locatie volgt'} · ${formatEventDateRange(e.startDate, e.endDate)}</div>
            </div>
          </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:1rem">Nog geen events gevonden.</div>`;

  document.getElementById('events-list').innerHTML = html;
}

function parseRSS(xml, source) {
  const items = [];

  if (/<item\b/i.test(xml)) {
    const re = /<item\b[\s\S]*?<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const block = m[0];
      const title = getTagValue(block, ['title']);
      const desc = getTagValue(block, ['description', 'content:encoded']).slice(0, 220);
      const pub = getTagValue(block, ['pubDate', 'dc:date', 'published', 'updated']);
      const rawLink = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] || '';
      const link = stripHtml(rawLink);
      if (title && link) items.push(buildArticle({ title, snippet: desc, link, date: safeDate(pub), source }));
    }
  } else if (/<entry\b/i.test(xml)) {
    const re = /<entry\b[\s\S]*?<\/entry>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const block = m[0];
      const title = getTagValue(block, ['title']);
      const desc = getTagValue(block, ['summary', 'content']).slice(0, 220);
      const pub = getTagValue(block, ['updated', 'published']);
      const link = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?/i)?.[1] || '';
      if (title && link) items.push(buildArticle({ title, snippet: desc, link, date: safeDate(pub), source }));
    }
  } else if (source.name === 'Bureau Veritas Marine') {
    const re = /<a[^>]*href="([^"]*\/newsroom\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    const seen = new Set();
    while ((m = re.exec(xml)) !== null) {
      const link = m[1].startsWith('http') ? m[1] : `https://marine-offshore.bureauveritas.com${m[1]}`;
      const title = stripHtml(m[2]).replace(/\s+Read More$/i, '').trim();
      if (!title || title.length < 8 || seen.has(link)) continue;
      seen.add(link);
      items.push(buildArticle({ title, link, date: new Date(), source }));
    }
  }

  return items.sort((a, b) => b.ts - a.ts);
}

// ── MARKET DATA ───────────────────────────────────────────────────────
async function loadMarketData() {
  try {
    if (BASE_URL) {
      const r = await fetch(`${BASE_URL}/api/marketdata`);
      marketData = await r.json();
    } else {
      // Fetch EUR/USD directly (no CORS issues)
      const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD',
        { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      marketData = {
        eurusd: { value: d?.rates?.USD?.toFixed(3) || '1.082', demo: !d?.rates?.USD },
        steel:  { value: 487, unit: '$/ton', change: -2.1, demo: true },
        bunker: { vlsfo: 612, mgo: 748, unit: '$/mt', demo: true },
        bdi:    { value: '1.842', change: 1.2, demo: true },
        brent:  { value: '81.4', unit: '$/bbl', change: -0.8, demo: true },
      };
    }
    renderMetrics();
    renderTicker();
  } catch {
    marketData = {
      eurusd: { value: '1.082', demo: true },
      steel:  { value: 487, unit: '$/ton', change: -2.1, demo: true },
      bunker: { vlsfo: 612, mgo: 748, unit: '$/mt', demo: true },
      bdi:    { value: '1.842', change: 1.2, demo: true },
      brent:  { value: '81.4', unit: '$/bbl', change: -0.8, demo: true },
    };
    renderMetrics();
    renderTicker();
  }
}

function renderMetrics() {
  const md = marketData;
  const demoNote = d => d ? '<span class="demo-tag">voorbeeld</span>' : '';
  document.getElementById('metrics-grid').innerHTML = `
    <div class="metric-card">
      <div class="metric-lbl">VLSFO bunkerprijs ${demoNote(md.bunker?.demo)}</div>
      <div class="metric-val">${md.bunker?.vlsfo ?? '—'}<span class="metric-unit">$/mt</span></div>
      <div class="metric-chg neu">MGO: ${md.bunker?.mgo ?? '—'} $/mt</div>
    </div>
    <div class="metric-card">
      <div class="metric-lbl">Brent crude ${demoNote(md.brent?.demo)}</div>
      <div class="metric-val">${md.brent?.value ?? '—'}<span class="metric-unit">$/bbl</span></div>
      <div class="metric-chg ${chgClass(md.brent?.change)}">${chgStr(md.brent?.change)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-lbl">EUR/USD ${demoNote(md.eurusd?.demo)}</div>
      <div class="metric-val">${md.eurusd?.value ?? '—'}</div>
      <div class="metric-chg ${chgClass(md.eurusd?.change)}">${chgStr(md.eurusd?.change)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-lbl">Baltic Dry Index ${demoNote(md.bdi?.demo)}</div>
      <div class="metric-val">${md.bdi?.value ?? '—'}</div>
      <div class="metric-chg ${chgClass(md.bdi?.change)}">${chgStr(md.bdi?.change)}</div>
    </div>`;
}

function renderTicker() {
  const md = marketData;
  const items = [
    { label: 'VLSFO', val: `${md.bunker?.vlsfo ?? '—'} $/mt`, chg: null },
    { label: 'MGO', val: `${md.bunker?.mgo ?? '—'} $/mt`, chg: null },
    { label: 'Brent', val: `${md.brent?.value ?? '—'} $/bbl`, chg: md.brent?.change },
    { label: 'EUR/USD', val: md.eurusd?.value ?? '—', chg: md.eurusd?.change },
    { label: 'Baltic Dry', val: md.bdi?.value ?? '—', chg: md.bdi?.change },
    { label: 'Staalprijs', val: `${md.steel?.value ?? '—'} $/ton`, chg: md.steel?.change },
  ];
  document.getElementById('ticker').innerHTML = items.map((it, i) => `
    ${i > 0 ? '<div class="ticker-divider"></div>' : ''}
    <div class="ticker-item">
      <span class="ticker-label">${it.label}</span>
      <span class="ticker-val">${it.val}</span>
      ${it.chg != null ? `<span class="ticker-chg ${chgClass(it.chg)}">${chgStr(it.chg)}</span>` : ''}
    </div>`).join('');
}

function chgClass(v) { return v == null ? 'neu' : v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu'; }
function chgStr(v)   { return v == null ? '' : `${v > 0 ? '+' : ''}${v}%`; }

// ── RENDER ARTICLES ───────────────────────────────────────────────────
function articleHTML(a, showAdd = true) {
  const sel = selectedIds.has(a.id);
  const d = new Date(a.date);
  const dateStr = isNaN(d) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="article-card ${sel ? 'selected' : ''}" id="art-${a.id}">
      <div class="art-source-row">
        <span style="width:8px;height:8px;border-radius:50%;background:${a.color || '#4a9ed6'};display:inline-block;flex-shrink:0"></span>
        <span class="art-source">${a.source}</span>
        <span class="art-date">${dateStr}</span>
        <span class="badge tag-${a.tag}">${tagLabel(a.tag)}</span>
      </div>
      <div class="art-title">
        ${a.link ? `<a href="${a.link}" target="_blank" rel="noopener">${a.title}</a>` : a.title}
      </div>
      ${a.snippet ? `<div class="art-snippet">${a.snippet}${a.snippet.length >= 218 ? '…' : ''}</div>` : ''}
      ${showAdd ? `<div class="art-footer">
        <button class="add-btn ${sel ? 'added' : ''}" onclick="toggleArticle('${a.id}')">
          ${sel ? '✓ Toegevoegd' : '+ Nieuwsbrief'}
        </button>
      </div>` : ''}
    </div>`;
}

function tagLabel(t) {
  return { news:'Nieuws', policy:'Regelgeving', tech:'Technologie', energy:'Energie', safety:'Veiligheid', orders:'Orders', market:'Markt' }[t] || t;
}

function renderDash() {
  syncSearchInputs();
  const filtered = allArticles.filter(a => {
    const haystack = [a.title, a.snippet, a.source].filter(Boolean).join(' ').toLowerCase();
    return !searchQuery || haystack.includes(searchQuery);
  });
  const visible = filtered.slice(0, dashVisibleCount);
  document.getElementById('dash-count').textContent = `${visible.length} / ${filtered.length}`;
  document.getElementById('dash-articles').innerHTML =
    visible.length ? visible.map(a => articleHTML(a)).join('') :
    `<div class="empty-state">Geen artikelen gevonden${searchQuery ? ` voor "${searchQuery}"` : ''}.</div>`;

  const btn = document.getElementById('dash-load-more');
  if (btn) {
    btn.style.display = filtered.length > visible.length ? 'inline-flex' : 'none';
    btn.textContent = `Laad meer (${Math.min(PAGE_SIZE, filtered.length - visible.length)})`;
  }
}

function renderFeed() {
  syncSearchInputs();
  const filtered = getFilteredArticles();
  const visible = filtered.slice(0, feedVisibleCount);
  document.getElementById('feed-articles').innerHTML =
    visible.length ? visible.map(a => articleHTML(a)).join('') :
    `<div class="empty-state">Geen artikelen gevonden${searchQuery ? ` voor "${searchQuery}"` : ''}.</div>`;

  const btn = document.getElementById('feed-load-more');
  if (btn) {
    btn.style.display = filtered.length > visible.length ? 'inline-flex' : 'none';
    btn.textContent = `Laad meer (${Math.min(PAGE_SIZE, filtered.length - visible.length)})`;
  }
}

function loadMoreDash() {
  dashVisibleCount += PAGE_SIZE;
  renderDash();
}

function loadMoreFeed() {
  feedVisibleCount += PAGE_SIZE;
  renderFeed();
}


function setFeedFilter(f, el) {
  feedFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  feedVisibleCount = PAGE_SIZE;
  renderFeed();
}

function renderSidebarSources() {
  const counts = {};
  allArticles.forEach(a => { counts[a.source] = (counts[a.source] || 0) + 1; });
  const activeSources = [...SOURCES, ...customFeeds].filter(s => sourceStates[s.name] !== false);
  document.getElementById('sidebar-sources').innerHTML = activeSources.map(s => `
    <div class="source-pill">
      <div class="src-dot" style="background:${s.color}"></div>
      <span class="src-name">${s.name}</span>
      <span class="src-count">${counts[s.name] || 0} art.</span>
    </div>`).join('');
}

// ── ARTICLE SELECTION ─────────────────────────────────────────────────
function toggleArticle(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  // Re-render both views to update buttons
  renderDash();
  renderFeed();
  renderDraft();
}

function renderDraft() {
  const sel = allArticles.filter(a => selectedIds.has(a.id));
  document.getElementById('sel-count').textContent = sel.length;
  document.getElementById('draft-items').innerHTML = sel.length
    ? sel.map(a => `
      <div class="draft-item">
        <button class="draft-rm" onclick="toggleArticle('${a.id}')">✕</button>
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">${a.source} · <span class="badge tag-${a.tag}">${tagLabel(a.tag)}</span></div>
        <div style="font-size:14px;font-weight:500;margin-bottom:4px;color:var(--text)">${a.title}</div>
        <div style="font-size:12px;color:var(--text3)">${a.snippet || ''}</div>
      </div>`).join('')
    : `<div class="empty-state" style="padding:1.5rem">Ga naar de <strong>Nieuwsfeed</strong> en klik op "+ Nieuwsbrief" bij artikelen.</div>`;
}

// ── NEWSLETTER GENERATION ─────────────────────────────────────────────
async function generateNewsletter() {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) { alert('Vul eerst je Anthropic API-sleutel in.'); return; }

  const sel = allArticles.filter(a => selectedIds.has(a.id));
  if (!sel.length) { alert('Selecteer eerst artikelen in de feed.'); return; }

  const btn = document.getElementById('gen-btn');
  const loading = document.getElementById('gen-loading');
  const output = document.getElementById('newsletter-output');
  const copyBtn = document.getElementById('copy-btn');

  btn.disabled = true;
  loading.style.display = 'block';
  output.style.display = 'none';
  copyBtn.style.display = 'none';

  const now = new Date();
  const weekNum = Math.ceil(((now - new Date(now.getFullYear(),0,1))/86400000 + new Date(now.getFullYear(),0,1).getDay()+1)/7);
  const artikelen = sel.map(a => `- ${a.title} (${a.source}): ${a.snippet}`).join('\n');
  const opts = {
    metrics: document.getElementById('inc-metrics').checked,
    orders: document.getElementById('inc-orders').checked,
    outlook: document.getElementById('inc-outlook').checked
  };
  const secties = [];
  if (opts.metrics) secties.push(`Marktcijfers: VLSFO ${marketData.bunker?.vlsfo ?? 'n/b'} $/mt, Brent ${marketData.brent?.value ?? 'n/b'} $/bbl, EUR/USD ${marketData.eurusd?.value ?? 'n/b'}, Baltic Dry Index ${marketData.bdi?.value ?? 'n/b'}`);
  if (opts.orders) secties.push('orderboek analyse');
  if (opts.outlook) secties.push('vooruitblik komende week');

  const prompt = `Je bent redacteur van een professionele wekelijkse scheepsbouw markt update nieuwsbrief.
Week ${weekNum}, ${now.toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'})}.

Schrijf een complete nieuwsbrief op basis van:
${artikelen}
${secties.length ? '\nNeem ook op: ' + secties.join('; ') : ''}

Richtlijnen:
- Schrijf professioneel Nederlands
- Doelgroep: scheepsbouwers, werven, toeleveranciers, maritieme financiers, ingenieurs
- Begin met een korte executive summary (3-4 zinnen)
- Gebruik heldere kopjes per onderwerp
- Sluit af met een redactionele noot / vooruitblik
- Feitelijk maar leesbaar, geen herhaling
- 400-600 woorden`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    output.textContent = d.content.map(b => b.text || '').join('');
    output.style.display = 'block';
    copyBtn.style.display = 'inline-block';
  } catch (err) {
    output.textContent = 'Fout bij genereren: ' + err.message;
    output.style.display = 'block';
  } finally {
    btn.disabled = false;
    loading.style.display = 'none';
  }
}

function copyNewsletter() {
  navigator.clipboard.writeText(document.getElementById('newsletter-output').textContent).then(() => {
    const b = document.getElementById('copy-btn');
    b.textContent = 'Gekopieerd!';
    setTimeout(() => b.textContent = 'Kopieer nieuwsbrief', 2000);
  });
}

// ── SOURCES MANAGEMENT ────────────────────────────────────────────────
function renderSourcesPage() {
  const groups = [
    { title: 'Vakbladen & nieuws', sources: SOURCES.filter(s => s.tag === 'news') },
    { title: 'Regelgeving & beleid', sources: SOURCES.filter(s => s.tag === 'policy') },
    { title: 'Tech & energie', sources: [...SOURCES.filter(s => ['tech','energy','safety'].includes(s.tag)), ...customFeeds] },
  ];
  document.getElementById('sources-grid').innerHTML = groups.map(g => `
    <div class="sidebar-card">
      <div class="sidebar-title">${g.title}</div>
      ${g.sources.map((s, i) => `
        <div class="source-row-manage">
          <div class="src-dot" style="background:${s.color}"></div>
          <div style="flex:1">
            <div class="src-manage-name">${s.name}</div>
            <div class="src-manage-url">${s.url.replace('https://','').split('/')[0]}</div>
          </div>
          <button class="toggle ${sourceStates[s.name] !== false ? 'on' : ''}"
            onclick="toggleSource('${s.name}', this, ${s.url.includes('custom') || customFeeds.includes(s)})">
          </button>
        </div>`).join('')}
    </div>`).join('');
}

function toggleSource(name, btn, isCustom) {
  sourceStates[name] = sourceStates[name] === false ? true : false;
  btn.classList.toggle('on', sourceStates[name] !== false);
  localStorage.setItem('sourceStates', JSON.stringify(sourceStates));
}

function addCustomFeed() {
  const name = document.getElementById('new-name').value.trim();
  const url  = document.getElementById('new-url').value.trim();
  const tag  = document.getElementById('new-tag').value;
  if (!name || !url) { alert('Vul naam en URL in.'); return; }
  const colors = { news:'#4a9ed6', tech:'#a080e0', policy:'#e87060', energy:'#2ecc71', safety:'#f0a830' };
  customFeeds.push({ name, url, tag, color: colors[tag], on: true });
  localStorage.setItem('customFeeds', JSON.stringify(customFeeds));
  document.getElementById('new-name').value = '';
  document.getElementById('new-url').value = '';
  renderSourcesPage();
  loadFeeds();
}

// ── NAVIGATION ────────────────────────────────────────────────────────
function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (el) el.classList.add('active');
  if (id === 'nieuwsbrief') renderDraft();
}

// ── START ─────────────────────────────────────────────────────────────
init();
