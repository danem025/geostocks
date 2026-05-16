const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd847u89r01qutij88epgd847u89r01qutij88eq0';

const STOCK_MAP = {
  'nvidia':['NVDA'],'tsmc':['TSM'],'asml':['ASML'],'amd':['AMD'],
  'apple':['AAPL'],'microsoft':['MSFT'],'amazon':['AMZN'],'google':['GOOGL'],
  'meta':['META'],'qualcomm':['QCOM'],'broadcom':['AVGO'],
  'samsung':['SSNLF'],'intel':['INTC'],'applied materials':['AMAT'],
  'vistra':['VST'],'constellation energy':['CEG'],'nextera':['NEE'],
  'exxon':['XOM'],'shell':['SHEL'],'jpmorgan':['JPM'],
  'taiwan':['TSM','ASML'],'hormuz':['XOM','SHEL'],
  'semiconductor':['NVDA','TSM','ASML'],'chip':['NVDA','TSM'],
  'datacenter':['NVDA','AMZN','MSFT'],'nuclear':['VST','CEG','NEE'],
  'oil':['XOM','SHEL'],'nvidia earnings':['NVDA'],'ai chip':['NVDA','TSM'],
};

function detectStocks(text) {
  const t = text.toLowerCase();
  const found = new Set();
  for(const [key, tickers] of Object.entries(STOCK_MAP)) {
    if(t.includes(key)) tickers.forEach(tk => found.add(tk));
  }
  return [...found].slice(0, 6);
}
function detectRegion(text) {
  const t = text.toLowerCase();
  if(/china|taiwan|japan|korea|asia|beijing|tokyo/.test(t)) return 'asia';
  if(/europe|eu|germany|france|uk|britain|london/.test(t)) return 'europe';
  if(/iran|saudi|gulf|israel|dubai|qatar|hormuz/.test(t)) return 'mena';
  return 'americas';
}
function detectType(text) {
  const t = text.toLowerCase();
  if(/war|conflict|military|sanction|tension|strait/.test(t)) return 'geopolitical';
  if(/earnings|revenue|profit|gdp|inflation|economy/.test(t)) return 'economic';
  if(/energy|oil|nuclear|gas|power/.test(t)) return 'energy';
  if(/fed|monetary|interest rate|rate cut/.test(t)) return 'monetary';
  if(/trade|tariff|export|import|shipping/.test(t)) return 'trade';
  return 'tech';
}
function detectSector(text) {
  const t = text.toLowerCase();
  if(/nvidia|chip|semiconductor|tsmc|asml|amd/.test(t)) return 'semi';
  if(/ai model|artificial intelligence|openai/.test(t)) return 'ai';
  if(/oil|opec|crude|brent/.test(t)) return 'oil';
  if(/nuclear|renewable|energy|power/.test(t)) return 'energy_s';
  if(/bank|fed|rate|inflation/.test(t)) return 'finance';
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
  return {americas:'🌎',europe:'🇪🇺',asia:'🌏',mena:'🌍'}[r]||'🌍';
}

// Only Finnhub — fast and reliable, no GDELT/RSS to avoid timeout
async function fetchFinnhubNews() {
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
      hl:hl.slice(0,130), src:item.source||'Finnhub', lang:'EN',
      ago:timeAgo(item.datetime*1000),
      rootId:stocks[0], graphNodes:stocks, isLive:true,
    };
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.status(200).end();return;}
  try {
    const items = await fetchFinnhubNews();
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
    res.status(200).json({
      items,
      sources: {finnhub: items.length, gdelt: 0, rss: 0},
      fetchedAt: new Date().toISOString(),
    });
  } catch(e) {
    res.status(500).json({error: e.message, items: []});
  }
};
