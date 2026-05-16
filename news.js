// api/news.js — Server-side news aggregator
// Runs on Vercel Edge, no CORS issues

const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd847u89r01qutij88epgd847u89r01qutij88eq0';

const RSS_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',        src: 'BBC',       lang: 'EN',     region: 'europe'   },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',             src: 'Al Jazeera',lang: 'AR→EN',  region: 'mena'     },
  { url: 'https://feeds.reuters.com/reuters/businessNews',         src: 'Reuters',   lang: 'EN',     region: 'americas' },
  { url: 'https://www3.nhk.or.jp/rss/news/cat6.xml',              src: 'NHK',       lang: 'JA→EN',  region: 'asia'     },
  { url: 'https://www.scmp.com/rss/2/feed',                       src: 'SCMP',      lang: 'ZH→EN',  region: 'asia'     },
  { url: 'https://english.alarabiya.net/tools/rss.html',          src: 'Al Arabiya',lang: 'AR→EN',  region: 'mena'     },
  { url: 'https://feeds.ft.com/rss/home/uk',                      src: 'FT',        lang: 'EN',     region: 'europe'   },
  { url: 'https://feeds.bloomberg.com/markets/news.rss',          src: 'Bloomberg', lang: 'EN',     region: 'americas' },
  { url: 'https://www.nikkei.com/news/rss',                       src: 'Nikkei',    lang: 'JA→EN',  region: 'asia'     },
  { url: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms',src:'Times of India',lang:'EN', region: 'asia'    },
];

const GDELT_QUERIES = [
  'semiconductor chip TSMC nvidia ASML AMD intel',
  'geopolitical sanctions military conflict strait taiwan hormuz',
  'energy nuclear oil OPEC pipeline solar renewable',
  'inflation federal reserve interest rate GDP economy earnings',
  'china europe trade tariff export import supply chain',
  'AI artificial intelligence OpenAI Microsoft Google Meta',
];

// Stock detector
const STOCK_MAP = {
  'nvidia':['NVDA'],'tsmc':['TSM'],'asml':['ASML'],'amd':['AMD'],
  'apple':['AAPL'],'microsoft':['MSFT'],'amazon':['AMZN'],'google':['GOOGL'],
  'meta':['META'],'qualcomm':['QCOM'],'broadcom':['AVGO'],
  'samsung':['SSNLF'],'intel':['INTC'],'applied materials':['AMAT'],
  'kla':['KLAC'],'lam research':['LRCX'],
  'vistra':['VST'],'constellation energy':['CEG'],'nextera':['NEE'],
  'exxon':['XOM'],'shell':['SHEL'],'bp':['BP'],
  'maersk':['AMKBY'],'jpmorgan':['JPM'],'jp morgan':['JPM'],
  'openai':['NVDA'],'anthropic':['AMZN'],'llama':['META'],
  'taiwan':['TSM','ASML'],'hormuz':['XOM','SHEL'],
  'semiconductor':['NVDA','TSM','ASML'],'chip':['NVDA','TSM'],
  'datacenter':['NVDA','AMZN','MSFT'],'nuclear':['VST','CEG','NEE'],
  'oil':['XOM','SHEL'],'shipping':['AMKBY'],
};

function detectStocks(text) {
  const t = text.toLowerCase();
  const found = new Set();
  for(const [key, tickers] of Object.entries(STOCK_MAP)) {
    if(t.includes(key)) tickers.forEach(tk => found.add(tk));
  }
  return [...found].slice(0, 8);
}

function detectRegion(text, country='') {
  const t = (text + ' ' + country).toLowerCase();
  if(/china|taiwan|japan|korea|asia|beijing|tokyo|seoul|hong kong|singapore|india/.test(t)) return 'asia';
  if(/europe|eu|germany|france|uk|britain|brussels|berlin|paris|london|netherlands/.test(t)) return 'europe';
  if(/iran|saudi|gulf|mena|israel|middle east|dubai|qatar|hormuz|iraq|kuwait/.test(t)) return 'mena';
  if(/africa|nigeria|kenya|egypt|morocco/.test(t)) return 'africa';
  if(/brazil|latin|mexico|argentina|chile/.test(t)) return 'latam';
  return 'americas';
}

function detectType(text) {
  const t = text.toLowerCase();
  if(/war|conflict|military|attack|sanction|geopolit|tension|strait|naval|troops/.test(t)) return 'geopolitical';
  if(/earnings|revenue|profit|gdp|inflation|economy|market|stock|quarter/.test(t)) return 'economic';
  if(/energy|oil|nuclear|gas|power|solar|wind|renewable/.test(t)) return 'energy';
  if(/fed|central bank|monetary|interest rate|rate cut|rate hike/.test(t)) return 'monetary';
  if(/trade|tariff|export|import|supply chain|shipping|freight/.test(t)) return 'trade';
  if(/military|defense|weapon|army|navy|air force/.test(t)) return 'military';
  return 'tech';
}

function detectSector(text) {
  const t = text.toLowerCase();
  if(/nvidia|chip|semiconductor|tsmc|asml|amd|intel|wafer/.test(t)) return 'semi';
  if(/openai|anthropic|llm|ai model|artificial intelligence|claude|gpt|llama/.test(t)) return 'ai';
  if(/oil|opec|crude|brent|petroleum|refin|barrel/.test(t)) return 'oil';
  if(/nuclear|solar|wind|renewable|energy|power grid|datacenter power/.test(t)) return 'energy_s';
  if(/bank|fed|rate|inflation|bond|treasury|finance|credit/.test(t)) return 'finance';
  if(/ship|maersk|freight|container|cargo|port/.test(t)) return 'shipping';
  if(/defense|military|weapon|lockheed|raytheon/.test(t)) return 'defense';
  if(/gold|silver|copper|lithium|rare earth|mineral/.test(t)) return 'metals';
  return 'tech';
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if(diff < 60) return Math.round(diff) + 's';
  if(diff < 3600) return Math.round(diff / 60) + 'm';
  if(diff < 86400) return Math.round(diff / 3600) + 'h';
  return Math.round(diff / 86400) + 'd';
}

function gdeltTimeAgo(seendate) {
  if(!seendate) return 'recent';
  try {
    const s = String(seendate);
    const d = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:00Z`);
    return timeAgo(d.getTime());
  } catch(e) { return 'recent'; }
}

// Parse RSS XML manually (no external parser needed on Vercel)
function parseRSS(xml, feed) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>|<title[^>]*>(.*?)<\/title>/i;
  const dateRegex = /<pubDate[^>]*>(.*?)<\/pubDate>/i;

  let match;
  while((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const block = match[1];
    const titleMatch = titleRegex.exec(block);
    const dateMatch = dateRegex.exec(block);
    const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
    if(!title || title.length < 10) continue;
    const stocks = detectStocks(title);
    if(!stocks.length) continue;
    const pubDate = dateMatch ? new Date(dateMatch[1]).getTime() : Date.now();
    items.push({
      id: `rss_${feed.src}_${items.length}`,
      type: detectType(title),
      regions: [feed.region],
      sectors: [detectSector(title)],
      flags: [regionToFlag(feed.region)],
      hl: title.slice(0, 130),
      src: feed.src,
      lang: feed.lang,
      ago: timeAgo(pubDate),
      rootId: stocks[0],
      graphNodes: stocks,
      isLive: true,
    });
  }
  return items;
}

function regionToFlag(region) {
  const map = { americas:'🌎', europe:'🇪🇺', asia:'🌏', mena:'🌍', africa:'🌍', latam:'🌎' };
  return map[region] || '🌍';
}

async function fetchFinnhubNews() {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&minId=0&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const items = await res.json();
    if(!Array.isArray(items)) return [];
    return items.slice(0, 20).map((item, i) => {
      const hl = item.headline || '';
      const stocks = detectStocks(hl + ' ' + (item.summary||''));
      if(!stocks.length) return null;
      const region = detectRegion(hl);
      return {
        id: 'fh_' + i,
        type: detectType(hl),
        regions: [region],
        sectors: [detectSector(hl)],
        flags: [regionToFlag(region)],
        hl: hl.slice(0, 130),
        src: item.source || 'Finnhub',
        lang: 'EN',
        ago: timeAgo(item.datetime * 1000),
        rootId: stocks[0],
        graphNodes: stocks,
        isLive: true,
      };
    }).filter(Boolean);
  } catch(e) {
    console.error('Finnhub news error:', e.message);
    return [];
  }
}

async function fetchGDELT() {
  const results = [];
  for(const query of GDELT_QUERIES.slice(0, 3)) { // limit to 3 to stay fast
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=10&format=json&timespan=1440&sort=datedesc`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if(data.articles) {
        data.articles.forEach((a, i) => {
          const hl = a.title || '';
          const stocks = detectStocks(hl);
          if(!stocks.length) return;
          const region = detectRegion(hl, a.sourcecountry || '');
          results.push({
            id: `gd_${query.slice(0,4)}_${i}`,
            type: detectType(hl),
            regions: [region],
            sectors: [detectSector(hl)],
            flags: [regionToFlag(region)],
            hl: hl.slice(0, 130),
            src: (a.domain || 'GDELT').replace('www.','').split('.')[0],
            lang: detectLang(a.language),
            ago: gdeltTimeAgo(a.seendate),
            rootId: stocks[0],
            graphNodes: stocks,
            isLive: true,
          });
        });
      }
    } catch(e) {
      console.error('GDELT query error:', e.message);
    }
  }
  return results;
}

function detectLang(gdeltLang) {
  const map = {
    'Japanese':'JA→EN','Arabic':'AR→EN','Chinese':'ZH→EN',
    'French':'FR→EN','German':'DE→EN','Korean':'KO→EN',
    'Russian':'RU→EN','Spanish':'ES→EN','Portuguese':'PT→EN',
  };
  return map[gdeltLang] || 'EN';
}

async function fetchRSSFeed(feed) {
  try {
    const res = await fetch(feed.url, { signal: AbortSignal.timeout(6000) });
    const xml = await res.text();
    return parseRSS(xml, feed);
  } catch(e) {
    console.error(`RSS error ${feed.src}:`, e.message);
    return [];
  }
}

export default async function handler(req, res) {
  if(req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).end();
    return;
  }

  try {
    // Fetch all sources in parallel
    const [finnhubNews, gdeltNews, ...rssResults] = await Promise.all([
      fetchFinnhubNews(),
      fetchGDELT(),
      ...RSS_FEEDS.map(feed => fetchRSSFeed(feed)),
    ]);

    const rssNews = rssResults.flat();

    // Merge and deduplicate
    const all = [...finnhubNews, ...gdeltNews, ...rssNews];
    const seen = new Set();
    const deduped = all.filter(n => {
      const key = n.hl.slice(0, 35).toLowerCase().replace(/[^a-z0-9]/g, '');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort: by recency (those with stock tags first)
    deduped.sort((a, b) => {
      if(a.graphNodes.length && !b.graphNodes.length) return -1;
      if(!a.graphNodes.length && b.graphNodes.length) return 1;
      return 0;
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      items: deduped.slice(0, 60),
      sources: {
        finnhub: finnhubNews.length,
        gdelt: gdeltNews.length,
        rss: rssNews.length,
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch(e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: e.message, items: [] });
  }
}
