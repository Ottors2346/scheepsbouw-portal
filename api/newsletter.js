// api/newsletter.js — Vercel Serverless Function
// Generates a weekly maritime newsletter using Claude AI

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = req.headers['x-api-key'] || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  const { articles, marketData, options } = req.body;
  if (!articles?.length) return res.status(400).json({ error: 'No articles provided' });

  const artikelen = articles.map(a => `- ${a.title} (${a.source}): ${a.snippet}`).join('\n');
  const weekNum = Math.ceil((new Date() - new Date(new Date().getFullYear(),0,1)) / (7*86400000));

  const secties = [];
  if (options?.metrics && marketData) {
    secties.push(`Marktcijfers: VLSFO ${marketData.bunker?.vlsfo ?? 'n/b'} $/mt, Brent ${marketData.brent?.value ?? 'n/b'} $/bbl, EUR/USD ${marketData.eurusd?.value ?? 'n/b'}, Baltic Dry Index ${marketData.bdi?.value ?? 'n/b'}`);
  }
  if (options?.orders) secties.push('orderboek analyse sectie');
  if (options?.outlook) secties.push('vooruitblik komende week');

  const prompt = `Je bent redacteur van een professionele wekelijkse scheepsbouw markt update nieuwsbrief.

Week ${weekNum}, ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}.

Schrijf een complete nieuwsbrief op basis van:

ARTIKELEN:
${artikelen}

${secties.length ? 'NEEM OOK OP: ' + secties.join('; ') : ''}

RICHTLIJNEN:
- Schrijf in professioneel Nederlands
- Doelgroep: scheepsbouwers, werven, toeleveranciers, maritieme financiers, ingenieurs
- Begin met een korte executive summary (3-4 zinnen)
- Gebruik heldere kopjes per onderwerp
- Sluit af met een korte redactionele noot / vooruitblik
- Wees feitelijk maar licht leesbaar
- Vermijd herhaling
- Totale lengte: 400-600 woorden`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    res.json({ text: d.content.map(b => b.text || '').join('') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
