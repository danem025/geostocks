// api/cron.js — runs every 5 minutes via Vercel cron
// Fetches all news sources and stores in Supabase

const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd847u89r01qutij88epgd847u89r01qutij88eq0';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const STOCK_MAP = {
  // Semiconductors
  'nvidia':['NVDA'],'tsmc':['TSM'],'asml':['ASML'],'amd':['AMD'],
  'intel':['INTC'],'qualcomm':['QCOM'],'broadcom':['AVGO'],
  'applied materials':['AMAT'],'lam research':['LRCX'],'kla':['KLAC'],
  'samsung':['SSNLF'],'chip':['NVDA','TSM'],'semiconductor':['NVDA','TSM','ASML'],
  'wafer':['TSM','ASML'],'lithography':['ASML'],'foundry':['TSM','SSNLF'],
  // AI & Cloud
  'openai':['NVDA','MSFT'],'anthropic':['AMZN','GOOGL'],'google':['GOOGL'],
  'microsoft':['MSFT'],'amazon':['AMZN'],'meta':['META'],'apple':['AAPL'],
  'datacenter':['NVDA','AMZN','MSFT'],'ai chip':['NVDA'],'gpu':['NVDA','AMD'],
  'cloud':['AMZN','MSFT','GOOGL'],'hyperscaler':['AMZN','MSFT','GOOGL'],
  // Energy
  'nuclear':['VST','CEG','NEE'],'vistra':['VST'],'constellation':['CEG'],
  'nextera':['NEE'],'solar':['NEE','ENPH'],'wind':['NEE'],
  'ge vernova':['GEV'],'power grid':['GEV','NEE'],
  // Oil & Gas
  'oil':['XOM','SHEL','CVX'],'opec':['XOM','CVX','SHEL'],
  'exxon':['XOM'],'shell':['SHEL'],'chevron':['CVX'],
  'crude':['XOM','CVX'],'brent':['SHEL','XOM'],'lng':['XOM','SHEL'],
  'hormuz':['XOM','SHEL','CVX'],'pipeline':['XOM','CVX'],
  'petroleum':['XOM','CVX','SHEL'],'refinery':['XOM','CVX'],
  // Shipping & Logistics
  'maersk':['AMKBY'],'shipping':['AMKBY'],'container':['AMKBY'],
  'freight':['AMKBY','FDX'],'fedex':['FDX'],'ups':['UPS'],
  'suez':['AMKBY','XOM'],'taiwan strait':['TSM','AMKBY'],
  'port':['AMKBY'],'logistics':['FDX','UPS','AMKBY'],
  'supply chain':['NVDA','TSM','AMKBY'],
  // Finance & Macro
  'federal reserve':['JPM','GS'],'fed ':['JPM','GS'],
  'jpmorgan':['JPM'],'goldman':['GS'],'bank':['JPM','GS'],
  'inflation':['JPM','GS'],'interest rate':['JPM','GS'],
  'treasury':['JPM'],'bond':['JPM','GS'],'yield':['JPM','GS'],
  // Metals & Mining
  'gold':['GLD'],'copper':['FCX'],'lithium':['ALB','LTHM'],
  'nickel':['VALE'],'iron ore':['VALE','BHP'],'vale':['VALE'],
  'rare earth':['MP'],'mining':['VALE','FCX','BHP'],
  'aluminum':['AA'],'steel':['X','NUE'],
  // Geopolitical triggers
  'taiwan':['TSM','ASML','NVDA'],'china':['TSM','NVDA','AAPL'],
  'russia':['SHEL','XOM','AMKBY'],'ukraine':['AMKBY','XOM'],
  'iran':['XOM','SHEL','AMKBY'],'middle east':['XOM','SHEL'],
  'sanctions':['NVDA','TSM','ASML'],'tariff':['AAPL','NVDA','TSM'],
  'export control':['NVDA','ASML','TSM'],
  // Defense
  'defense':['LMT','RTX','NOC'],'lockheed':['LMT'],
  'raytheon':['RTX'],'military':['LMT','RTX'],
  'weapon':['LMT','RTX','NOC'],'missile':['LMT','RTX'],
  // Pharma
  'pfizer':['PFE'],'johnson':['JNJ'],'vaccine':['PFE','MRNA'],
  'drug':['PFE','JNJ'],'pharma':['PFE','JNJ','MRNA'],
  // Retail & Consumer
  'walmart':['WMT'],'consumer':['WMT','AMZN'],
  'retail':['WMT','AMZN'],'inflation consumer':['WMT'],
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
  if(/china|taiwan|japan|korea|asia|beijing|tokyo|seoul|singapore|india|indonesia|vietnam/.test(t)) return 'asia';
  if(/europe|eu|germany|france|uk|britain|brussels|london|netherlands|italy|spain/.test(t)) return 'europe';
  if(/iran|saudi|gulf|israel|middle east|dubai|qatar|hormuz|iraq|kuwait|uae/.test(t)) return 'mena';
  if(/africa|nigeria|kenya|egypt|south africa|morocco/.test(t)) return 'africa';
  if(/brazil|latin|mexico|argentina|chile|colombia/.test(t)) return 'latam';
  if(/russia|ukraine|moscow|kiev/.test(t)) return 'europe';
  return 'americas';
}
function detectType(text) {
  const t = text.toLowerCase();
  if(/war|conflict|military|attack|sanction|geopolit|tension|strait|naval|troops|missile|invasion/.test(t)) return 'geopolitical';
  if(/earnings|revenue|profit|gdp|inflation|economy|market|quarter|ipo|merger|acquisition/.test(t)) return 'economic';
  if(/energy|oil|nuclear|gas|power|solar|wind|renewable|opec/.test(t)) return 'energy';
  if(/fed|central bank|monetary|interest rate|rate cut|rate hike|jerome powell/.test(t)) return 'monetary';
  if(/trade|tariff|export|import|supply chain|shipping|freight|port/.test(t)) return 'trade';
  if(/military|defense|weapon|army|navy|air force|pentagon/.test(t)) return 'military';
  if(/election|vote|president|prime minister|government|congress|parliament/.test(t)) return 'political';
  return 'tech';
}
function detectSector(text) {
  const t = text.toLowerCase();
  if(/nvidia|chip|semiconductor|tsmc|asml|amd|intel|wafer/.test(t)) return 'semi';
  if(/openai|anthropic|ai model|artificial intelligence|llm|gpt|claude/.test(t)) return 'ai';
  if(/oil|opec|crude|brent|petroleum|refin|barrel/.test(t)) return 'oil';
  if(/nuclear|solar|wind|renewable|energy|power grid/.test(t)) return 'energy_s';
  if(/bank|fed|rate|inflation|bond|treasury|finance/.test(t)) return 'finance';
  if(/ship|maersk|freight|container|cargo|port|logistics/.test(t)) return 'shipping';
  if(/defense|military|weapon|lockheed|raytheon/.test(t)) return 'defense';
  if(/gold|copper|lithium|nickel|iron ore|rare earth|mining/.test(t)) return 'metals';
  if(/pharma|drug|vaccine|pfizer|johnson/.test(t)) return 'pharma';
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

const RSS_FEEDS = [
  {url:'https://feeds.bbci.co.uk/news/world/rss.xml',          src:'BBC World',    lang:'EN',     region:'europe'},
  {url:'https://feeds.bbci.co.uk/news/business/rss.xml',       src:'BBC Business', lang:'EN',     region:'europe'},
  {url:'https://feeds.reuters.com/reuters/businessNews',        src:'Reuters',      lang:'EN',     region:'americas'},
  {url:'https://feeds.reuters.com/Reuters/worldNews',           src:'Reuters World',lang:'EN',     region:'americas'},
  {url:'https://www.aljazeera.com/xml/rss/all.xml',            src:'Al Jazeera',   lang:'AR→EN',  region:'mena'},
  {url:'https://www3.nhk.or.jp/rss/news/cat6.xml',             src:'NHK',          lang:'JA→EN',  region:'asia'},
  {url:'https://www.scmp.com/rss/2/feed',                      src:'SCMP',         lang:'ZH→EN',  region:'asia'},
  {url:'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms',src:'Times of India',lang:'EN', region:'asia'},
  {url:'https://feeds.ft.com/rss/home/uk',                     src:'FT',           lang:'EN',     region:'europe'},
  {url:'https://rss.dw.com/rdf/rss-en-world',                  src:'DW',           lang:'DE→EN',  region:'europe'},
  {url:'https://english.alarabiya.net/tools/rss',              src:'Al Arabiya',   lang:'AR→EN',  region:'mena'},
  {url:'https://www.france24.com/en/rss',                      src:'France 24',    lang:'FR→EN',  region:'europe'},
];

const GDELT_QUERIES = [
  'semiconductor nvidia TSMC ASML chip export',
  'oil OPEC hormuz energy nuclear datacenter',
  'trade tariff sanctions geopolitical conflict',
  'inflation federal reserve interest rate GDP',
  'mining lithium copper gold metals',
];

function parseRSS(xml, feed) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const titleRx = /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i;
  const dateRx = /<pubDate[^>]*>(.*?)<\/pubDate>/i;
  let m;
  while((m = itemRx.exec(xml)) !== null && items.length < 6) {
    const b = m[1];
    const title = (titleRx.exec(b)?.[1]||'').trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    if(!title || title.length < 10) continue;
    const stocks = detectStocks(title);
    if(!stocks.length) continue;
    const dm = dateRx.exec(b);
    const pd = dm ? new Date(dm[1]).getTime() : Date.now();
    items.push({
      id: `rss_${feed.src.replace(/\s/g,'_')}_${items.length}_${Date.now()}`,
      type: detectType(title),
      regions: [detectRegion(title + ' ' + feed.region)],
      sectors: [detectSector(title)],
      flags: [regionToFlag(detectRegion(title + ' ' + feed.region))],
      hl: title.slice(0, 140),
      src: feed.src,
      lang: feed.lang,
      ago: timeAgo(pd),
      root_id: stocks[0],
      graph_nodes: stocks,
      is_live: true,
      fetched_at: new Date().toISOString(),
    });
  }
  return items;
}

async function fetchRSS() {
  const results = [];
  const promises = RSS_FEEDS.map(async feed => {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(5000) });
      const xml = await res.text();
      return parseRSS(xml, feed);
    } catch(e) { return []; }
  });
  const all = await Promise.allSettled(promises);
  all.forEach(r => { if(r.status==='fulfilled') results.push(...r.value); });
  return results;
}

async function fetchGDELT() {
  const results = [];
  const promises = GDELT_QUERIES.map(async q => {
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=6&format=json&timespan=1440&sort=datedesc`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      if(!data.articles) return [];
      return data.articles.map((a, i) => {
        const hl = a.title || '';
        const stocks = detectStocks(hl);
        if(!stocks.length) return null;
        const region = detectRegion(hl + ' ' + (a.sourcecountry||''));
        return {
          id: `gd_${q.slice(0,6).replace(/\s/g,'')}_${i}_${Date.now()}`,
          type: detectType(hl),
          regions: [region],
          sectors: [detectSector(hl)],
          flags: [regionToFlag(region)],
          hl: hl.slice(0, 140),
          src: (a.domain||'GDELT').replace('www.','').split('.')[0],
          lang: 'EN',
          ago: 'recent',
          root_id: stocks[0],
          graph_nodes: stocks,
          is_live: true,
          fetched_at: new Date().toISOString(),
        };
      }).filter(Boolean);
    } catch(e) { return []; }
  });
  const all = await Promise.allSettled(promises);
  all.forEach(r => { if(r.status==='fulfilled') results.push(...r.value); });
  return results;
}

async function fetchFinnhub() {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const items = await res.json();
    if(!Array.isArray(items)) return [];
    return items.slice(0, 30).map((item, i) => {
      const hl = item.headline || '';
      const stocks = detectStocks(hl + ' ' + (item.summary||''));
      if(!stocks.length) return null;
      const region = detectRegion(hl);
      return {
        id: `fh_${i}_${Date.now()}`,
        type: detectType(hl),
        regions: [region],
        sectors: [detectSector(hl)],
        flags: [regionToFlag(region)],
        hl: hl.slice(0, 140),
        src: item.source || 'Finnhub',
        lang: 'EN',
        ago: timeAgo(item.datetime * 1000),
        root_id: stocks[0],
        graph_nodes: stocks,
        is_live: true,
        fetched_at: new Date().toISOString(),
      };
    }).filter(Boolean);
  } catch(e) { return []; }
}

async function saveToSupabase(items) {
  if(!SUPABASE_URL || !SUPABASE_KEY) return;
  // Deduplicate by headline
  const seen = new Set();
  const deduped = items.filter(n => {
    const key = n.hl.slice(0,40).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });

  // Upsert in batches of 50
  const batch = deduped.slice(0, 200);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/news_items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(batch),
  });
  return res.status;
}

async function cleanOldNews() {
  if(!SUPABASE_URL || !SUPABASE_KEY) return;
  // Delete news older than 7 days
  const cutoff = new Date(Date.now() - 7*24*60*60*1000).toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/news_items?fetched_at=lt.${cutoff}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.status(200).end();return;}
  try {
    const [rssNews, gdeltNews, finnhubNews] = await Promise.all([
      fetchRSS(),
      fetchGDELT(),
      fetchFinnhub(),
    ]);

    const all = [...finnhubNews, ...rssNews, ...gdeltNews];
    const status = await saveToSupabase(all);
    await cleanOldNews();

    res.status(200).json({
      saved: all.length,
      sources: { finnhub: finnhubNews.length, rss: rssNews.length, gdelt: gdeltNews.length },
      supabaseStatus: status,
      fetchedAt: new Date().toISOString(),
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
