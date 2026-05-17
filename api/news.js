// api/news.js — reads from Supabase cache, falls back to live fetch
const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd847u89r01qutij88epgd847u89r01qutij88eq0';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const STOCK_MAP = {
  'nvidia':['NVDA'],'tsmc':['TSM'],'asml':['ASML'],'amd':['AMD'],
  'apple':['AAPL'],'microsoft':['MSFT'],'amazon':['AMZN'],'google':['GOOGL'],
  'meta':['META'],'qualcomm':['QCOM'],'broadcom':['AVGO'],
  'samsung':['SSNLF'],'intel':['INTC'],'applied materials':['AMAT'],
  'vistra':['VST'],'constellation':['CEG'],'nextera':['NEE'],
  'exxon':['XOM'],'shell':['SHEL'],'jpmorgan':['JPM'],'chevron':['CVX'],
  'taiwan':['TSM','ASML'],'hormuz':['XOM','SHEL'],
  'semiconductor':['NVDA','TSM','ASML'],'chip':['NVDA','TSM'],
  'datacenter':['NVDA','AMZN','MSFT'],'nuclear':['VST','CEG','NEE'],
  'oil':['XOM','SHEL','CVX'],'shipping':['AMKBY'],'maersk':['AMKBY'],
  'defense':['LMT','RTX'],'lockheed':['LMT'],'gold':['GLD'],
  'copper':['FCX'],'lithium':['ALB'],'mining':['VALE','FCX'],
  'tariff':['AAPL','NVDA','TSM'],'sanctions':['NVDA','ASML','TSM'],
  'election':['JPM','GS'],'federal reserve':['JPM','GS'],
  'inflation':['JPM','GS'],'interest rate':['JPM','GS'],
};

function detectStocks(text) {
  const t = text.toLowerCase();
  const found = new Set();
  for(const [key, tickers] of Object.entries(STOCK_MAP)) {
    if(t.includes(key)) tickers.forEach(tk => found.add(tk));
  }
  return [...found].slice(0, 8);
}
function detectRegion(text) {
  const t = text.toLowerCase();
  if(/china|taiwan|japan|korea|asia|beijing|tokyo|seoul|singapore|india/.test(t)) return 'asia';
  if(/europe|eu|germany|france|uk|britain|brussels|london|netherlands/.test(t)) return 'europe';
  if(/iran|saudi|gulf|israel|middle east|dubai|qatar|hormuz/.test(t)) return 'mena';
  if(/africa|nigeria|kenya|egypt/.test(t)) return 'africa';
  if(/brazil|latin|mexico|argentina/.test(t)) return 'latam';
  return 'americas';
}
function detectType(text) {
  const t = text.toLowerCase();
  if(/war|conflict|military|sanction|tension|strait|naval|invasion/.test(t)) return 'geopolitical';
  if(/earnings|revenue|profit|gdp|inflation|economy|market|quarter/.test(t)) return 'economic';
  if(/energy|oil|nuclear|gas|power|solar|wind/.test(t)) return 'energy';
  if(/fed|monetary|interest rate|rate cut|rate hike/.test(t)) return 'monetary';
  if(/trade|tariff|export|import|supply chain|shipping/.test(t)) return 'trade';
  if(/election|vote|president|government|parliament/.test(t)) return 'political';
  return 'tech';
}
function detectSector(text) {
  const t = text.toLowerCase();
  if(/nvidia|chip|semiconductor|tsmc|asml|amd/.test(t)) return 'semi';
  if(/openai|anthropic|ai model|artificial intelligence/.test(t)) return 'ai';
  if(/oil|opec|crude|brent|petroleum/.test(t)) return 'oil';
  if(/nuclear|solar|wind|renewable|energy|power/.test(t)) return 'energy_s';
  if(/bank|fed|rate|inflation|bond|treasury/.test(t)) return 'finance';
  if(/ship|freight|container|cargo|logistics/.test(t)) return 'shipping';
  if(/defense|military|weapon/.test(t)) return 'defense';
  if(/gold|copper|lithium|nickel|mining/.test(t)) return 'metals';
  return 'tech';
}
function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if(diff < 60) return Math.round(diff) + 's';
  if(diff < 3600) return Math.round(diff / 60) + 'm';
  if(diff < 86400) return Math.round(diff / 3600) + 'h';
  return Math.round(diff / 86400) + 'd';
}
function regionToFlag(r) {
  return {americas:'🌎',europe:'🇪🇺',asia:'🌏',mena:'🌍',africa:'🌍',latam:'🌎'}[r]||'🌍';
}

async function readFromSupabase(filters = {}) {
  if(!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    // Only fetch last 48h
    const cutoff = new Date(Date.now() - 48*60*60*1000).toISOString();
    let url = `${SUPABASE_URL}/rest/v1/news_items?order=fetched_at.desc&limit=100&fetched_at=gte.${cutoff}`;
    if(filters.region && filters.region !== 'all') {
      url += `&regions=cs.{${filters.region}}`;
    }
    if(filters.sector && filters.sector !== 'all') {
      url += `&sectors=cs.{${filters.sector}}`;
    }
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if(!Array.isArray(data) || data.length === 0) return null;
    // Map snake_case back to camelCase, sort by fetched_at desc
    return data
      .sort((a,b) => new Date(b.fetched_at) - new Date(a.fetched_at))
      .map(n => ({
        id: n.id, type: n.type,
        regions: n.regions, sectors: n.sectors,
        flags: n.flags, hl: n.hl, src: n.src, lang: n.lang,
        ago: timeAgo(new Date(n.fetched_at).getTime()),
        rootId: n.root_id,
        graphNodes: n.graph_nodes, isLive: n.is_live,
      }));
  } catch(e) {
    console.error('Supabase read error:', e.message);
    return null;
  }
}

async function fetchFinnhubLive() {
  const res = await fetch(
    `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`,
    { signal: AbortSignal.timeout(6000) }
  );
  const items = await res.json();
  if(!Array.isArray(items)) return [];
  return items.slice(0, 30).map((item, i) => {
    const hl = item.headline || '';
    const stocks = detectStocks(hl + ' ' + (item.summary||''));
    if(!stocks.length) return null;
    const region = detectRegion(hl);
    return {
      id:'fh_'+i, type:detectType(hl),
      regions:[region], sectors:[detectSector(hl)],
      flags:[regionToFlag(region)],
      hl:hl.slice(0,140), src:item.source||'Finnhub', lang:'EN',
      ago:timeAgo(item.datetime*1000),
      rootId:stocks[0], graphNodes:stocks, isLive:true,
    };
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.status(200).end();return;}

  const { region, sector, timespan } = req.query;

  try {
    // Try Supabase first
    const cached = await readFromSupabase({ region, sector });

    if(cached && cached.length >= 10) {
      res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
      res.status(200).json({
        items: cached,
        sources: { supabase: cached.length, finnhub: 0, gdelt: 0, rss: 0 },
        fetchedAt: new Date().toISOString(),
        fromCache: true,
      });
      return;
    }

    // Fallback to live Finnhub
    const items = await fetchFinnhubLive();
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      items,
      sources: { supabase: 0, finnhub: items.length, gdelt: 0, rss: 0 },
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    });
  } catch(e) {
    res.status(500).json({ error: e.message, items: [] });
  }
};
