// api/predictions.js — Prediction markets aggregator

const STOCK_MAP = {
  'nvidia':['NVDA'],'tsmc':['TSM'],'asml':['ASML'],'taiwan':['TSM','ASML'],
  'semiconductor':['NVDA','TSM'],'chip':['NVDA','TSM'],
  'oil':['XOM','SHEL'],'opec':['XOM','CVX'],'hormuz':['XOM','SHEL'],
  'fed':['JPM'],'federal reserve':['JPM'],'rate':['JPM'],
  'nuclear':['VST','CEG','NEE'],'energy':['VST','NEE'],
  'china':['TSM','NVDA','ASML'],'russia':['SHEL','XOM'],
  'microsoft':['MSFT'],'google':['GOOGL'],'amazon':['AMZN'],
  'apple':['AAPL'],'meta':['META'],'openai':['NVDA','MSFT'],
};

function detectStocks(text) {
  const t = text.toLowerCase();
  const found = new Set();
  for(const [key, tickers] of Object.entries(STOCK_MAP)) {
    if(t.includes(key)) tickers.forEach(tk => found.add(tk));
  }
  return [...found].slice(0, 4);
}

function detectRegion(text) {
  const t = text.toLowerCase();
  if(/china|taiwan|japan|korea|asia/.test(t)) return 'asia';
  if(/europe|eu|germany|france|uk|britain/.test(t)) return 'europe';
  if(/iran|saudi|gulf|mena|israel|middle east|hormuz/.test(t)) return 'mena';
  return 'americas';
}

function detectSector(text) {
  const t = text.toLowerCase();
  if(/nvidia|chip|semiconductor|tsmc|asml/.test(t)) return 'semi';
  if(/oil|opec|crude|energy/.test(t)) return 'oil';
  if(/nuclear|renewable|power/.test(t)) return 'energy_s';
  if(/bank|fed|rate|inflation/.test(t)) return 'finance';
  return 'tech';
}

async function fetchPolymarket() {
  try {
    const res = await fetch(
      'https://gamma-api.polymarket.com/markets?limit=30&active=true&closed=false&order=volume&ascending=false',
      { signal: AbortSignal.timeout(8000) }
    );
    const markets = await res.json();
    if(!Array.isArray(markets)) return [];

    return markets
      .filter(m => m.question && m.question.length > 10)
      .slice(0, 15)
      .map((m, i) => {
        const q = m.question || '';
        const yesPrice = m.outcomePrices
          ? parseFloat(JSON.parse(m.outcomePrices)[0]) * 100
          : 50;
        const stocks = detectStocks(q);
        return {
          id: 'pm_' + i,
          platform: 'polymarket',
          regions: [detectRegion(q)],
          sectors: [detectSector(q)],
          question: q.slice(0, 150),
          yes: Math.round(Math.min(99, Math.max(1, yesPrice))),
          vol: m.volume ? formatVol(parseFloat(m.volume)) : '—',
          closes: m.endDate
            ? new Date(m.endDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
            : '—',
          fill: yesPrice > 70 ? '' : yesPrice < 30 ? 'r' : 'y',
          stocks,
          isLive: true,
        };
      });
  } catch(e) {
    console.error('Polymarket error:', e.message);
    return [];
  }
}

async function fetchKalshi() {
  // Kalshi public API
  try {
    const res = await fetch(
      'https://trading-api.kalshi.com/trade-api/v2/markets?limit=20&status=open',
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await res.json();
    const markets = data.markets || [];

    return markets
      .filter(m => m.title && m.yes_bid)
      .slice(0, 10)
      .map((m, i) => {
        const q = m.title || m.subtitle || '';
        const yesPrice = (m.yes_bid || 50);
        const stocks = detectStocks(q);
        return {
          id: 'kl_' + i,
          platform: 'kalshi',
          regions: [detectRegion(q)],
          sectors: [detectSector(q)],
          question: q.slice(0, 150),
          yes: Math.round(Math.min(99, Math.max(1, yesPrice))),
          vol: m.volume ? formatVol(m.volume) : '—',
          closes: m.close_time
            ? new Date(m.close_time).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
            : '—',
          fill: yesPrice > 70 ? '' : yesPrice < 30 ? 'r' : 'y',
          stocks,
          isLive: true,
        };
      });
  } catch(e) {
    console.error('Kalshi error:', e.message);
    return [];
  }
}

function formatVol(v) {
  if(v > 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
  if(v > 1e3) return '$' + (v/1e3).toFixed(0) + 'K';
  return '$' + Math.round(v);
}

// Fallback static data if APIs fail
const STATIC_PREDICTIONS = [
  { id:'s1', platform:'polymarket', regions:['asia'],     sectors:['semi'],          question:'Will China conduct military operations against Taiwan in 2026?',     yes:12, vol:'$2.4M', closes:'Dec 31 2026', fill:'r', stocks:['TSM','NVDA','ASML'], isLive:false },
  { id:'s2', platform:'kalshi',     regions:['mena'],     sectors:['oil','shipping'],question:'Will Strait of Hormuz face a naval blockade in 2026?',               yes:18, vol:'$890K', closes:'Dec 31 2026', fill:'y', stocks:['XOM','AMKBY'],       isLive:false },
  { id:'s3', platform:'polymarket', regions:['americas'], sectors:['finance'],       question:'Will the Fed cut rates before September 2026?',                      yes:34, vol:'$5.1M', closes:'Sep 1 2026',  fill:'',  stocks:['JPM'],               isLive:false },
  { id:'s4', platform:'kalshi',     regions:['americas'], sectors:['semi','ai'],     question:'Will Nvidia remain largest company by market cap end 2026?',         yes:58, vol:'$3.2M', closes:'Dec 31 2026', fill:'',  stocks:['NVDA','AAPL'],       isLive:false },
  { id:'s5', platform:'polymarket', regions:['europe','asia'], sectors:['semi'],     question:'Will EU ban all ASML exports to China by end of 2026?',              yes:44, vol:'$1.8M', closes:'Dec 31 2026', fill:'y', stocks:['ASML','TSM'],        isLive:false },
  { id:'s6', platform:'kalshi',     regions:['americas'], sectors:['energy_s','ai'],question:'Will 5+ nuclear datacenter power contracts be signed in 2026?',      yes:71, vol:'$680K', closes:'Dec 31 2026', fill:'',  stocks:['VST','CEG','NEE'],   isLive:false },
];

export default async function handler(req, res) {
  if(req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).end();
    return;
  }

  try {
    const [polymarketData, kalshiData] = await Promise.all([
      fetchPolymarket(),
      fetchKalshi(),
    ]);

    const live = [...polymarketData, ...kalshiData];
    const result = live.length > 0
      ? [...live, ...STATIC_PREDICTIONS.slice(0, 3)]
      : STATIC_PREDICTIONS;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=240');
    res.status(200).json({
      markets: result,
      sources: { polymarket: polymarketData.length, kalshi: kalshiData.length },
      fetchedAt: new Date().toISOString(),
    });
  } catch(e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ markets: STATIC_PREDICTIONS, error: e.message });
  }
}
