// api/news.js
const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd847u89r01qutij88epgd847u89r01qutij88eq0';

const STOCK_MAP = {
  'nvidia':['NVDA'],'tsmc':['TSM'],'asml':['ASML'],'amd':['AMD'],
  'apple':['AAPL'],'microsoft':['MSFT'],'amazon':['AMZN'],'google':['GOOGL'],
  'meta':['META'],'qualcomm':['QCOM'],'broadcom':['AVGO'],
  'samsung':['SSNLF'],'intel':['INTC'],'applied materials':['AMAT'],
  'kla':['KLAC'],'lam research':['LRCX'],
  'vistra':['VST'],'constellation energy':['CEG'],'nextera':['NEE'],
  'exxon':['XOM'],'shell':['SHEL'],'maersk':['AMKBY'],'jpmorgan':['JPM'],
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
function detectRegion(text) {
  const t = text.toLowerCase();
  if(/china|taiwan|japan|korea|asia|beijing|tokyo|seoul|singapore|india/.test(t)) return 'asia';
  if(/europe|eu|germany|france|uk|britain|brussels|london|netherlands/.test(t)) return 'europe';
  if(/iran|saudi|gulf|mena|israel|middle east|dubai|qatar|hormuz/.test(t)) return 'mena';
  if(/africa|nigeria|kenya|egypt/.test(t)) return 'africa';
  if(/brazil|latin|mexico|argentina/.test(t)) return 'latam';
  return 'americas';
}
function detectType(text) {
  const t = text.toLowerCase();
  if(/war|conflict|military|attack|sanction|geopolit|tension|strait|naval/.test(t)) return 'geopolitical';
  if(/earnings|revenue|profit|gdp|inflation|economy|market|quarter/.test(t)) return 'economic';
  if(/energy|oil|nuclear|gas|power|solar|wind/.test(t)) return 'energy';
  if(/fed|central bank|monetary|interest rate|rate cut/.test(t)) return 'monetary';
  if(/trade|tariff|export|import|supply chain|shipping/.test(t)) return 'trade';
  return 'tech';
}
function detectSector(text) {
  const t = text.toLowerCase();
  if(/nvidia|chip|semiconductor|tsmc|asml|amd|intel/.test(t)) return 'semi';
  if(/openai|anthropic|ai model|artificial intelligence/.test(t)) return 'ai';
  if(/oil|opec|crude|brent|petroleum/.test(t)) return 'oil';
  if(/nuclear|solar|wind|renewable|energy|power/.test(t)) return 'energy_s';
  if(/bank|fed|rate|inflation|bond|treasury/.test(t)) return 'finance';
  if(/ship|maersk|freight|container/.test(t)) return 'shipping';
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

async function fetchFinnhubNews() {
  const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`,{signal:AbortSignal.timeout(8000)});
  const items = await res.json();
  if(!Array.isArray(items)) return [];
  return items.slice(0,25).map((item,i)=>{
    const hl=item.headline||'';
    const stocks=detectStocks(hl+' '+(item.summary||''));
    if(!stocks.length) return null;
    const region=detectRegion(hl);
    return {id:'fh_'+i,type:detectType(hl),regions:[region],sectors:[detectSector(hl)],flags:[regionToFlag(region)],hl:hl.slice(0,130),src:item.source||'Finnhub',lang:'EN',ago:timeAgo(item.datetime*1000),rootId:stocks[0],graphNodes:stocks,isLive:true};
  }).filter(Boolean);
}

async function fetchGDELT() {
  const queries=['semiconductor chip TSMC nvidia ASML','geopolitical sanctions conflict strait taiwan','energy nuclear oil OPEC datacenter'];
  const results=[];
  for(const q of queries){
    try{
      const url=`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=8&format=json&timespan=1440&sort=datedesc`;
      const res=await fetch(url,{signal:AbortSignal.timeout(8000)});
      const data=await res.json();
      if(data.articles) data.articles.forEach((a,i)=>{
        const hl=a.title||'';
        const stocks=detectStocks(hl);
        if(!stocks.length) return;
        const region=detectRegion(hl+' '+(a.sourcecountry||''));
        results.push({id:`gd_${i}_${q.slice(0,4)}`,type:detectType(hl),regions:[region],sectors:[detectSector(hl)],flags:[regionToFlag(region)],hl:hl.slice(0,130),src:(a.domain||'GDELT').replace('www.','').split('.')[0],lang:'EN',ago:'recent',rootId:stocks[0],graphNodes:stocks,isLive:true});
      });
    }catch(e){}
  }
  return results;
}

const RSS_FEEDS=[
  {url:'https://feeds.bbci.co.uk/news/business/rss.xml',src:'BBC',lang:'EN',region:'europe'},
  {url:'https://feeds.reuters.com/reuters/businessNews',src:'Reuters',lang:'EN',region:'americas'},
  {url:'https://www.aljazeera.com/xml/rss/all.xml',src:'Al Jazeera',lang:'AR→EN',region:'mena'},
];

function parseRSS(xml,feed){
  const items=[];
  const itemRx=/<item[^>]*>([\s\S]*?)<\/item>/gi;
  const titleRx=/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i;
  const dateRx=/<pubDate[^>]*>(.*?)<\/pubDate>/i;
  let m;
  while((m=itemRx.exec(xml))!==null&&items.length<4){
    const b=m[1];
    const title=(titleRx.exec(b)?.[1]||'').trim();
    if(!title||title.length<10) continue;
    const stocks=detectStocks(title);
    if(!stocks.length) continue;
    const dm=dateRx.exec(b);
    const pd=dm?new Date(dm[1]).getTime():Date.now();
    items.push({id:`rss_${feed.src}_${items.length}`,type:detectType(title),regions:[feed.region],sectors:[detectSector(title)],flags:[regionToFlag(feed.region)],hl:title.slice(0,130),src:feed.src,lang:feed.lang,ago:timeAgo(pd),rootId:stocks[0],graphNodes:stocks,isLive:true});
  }
  return items;
}

async function fetchRSS(){
  const results=[];
  for(const feed of RSS_FEEDS){
    try{
      const res=await fetch(feed.url,{signal:AbortSignal.timeout(6000)});
      const xml=await res.text();
      results.push(...parseRSS(xml,feed));
    }catch(e){}
  }
  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.status(200).end();return;}
  try{
    const [finnhubNews,gdeltNews,rssNews]=await Promise.all([fetchFinnhubNews(),fetchGDELT(),fetchRSS()]);
    const all=[...finnhubNews,...gdeltNews,...rssNews];
    const seen=new Set();
    const deduped=all.filter(n=>{
      const key=n.hl.slice(0,35).toLowerCase().replace(/[^a-z0-9]/g,'');
      if(seen.has(key)) return false;
      seen.add(key); return true;
    });
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');
    res.status(200).json({items:deduped.slice(0,60),sources:{finnhub:finnhubNews.length,gdelt:gdeltNews.length,rss:rssNews.length},fetchedAt:new Date().toISOString()});
  }catch(e){
    res.status(500).json({error:e.message,items:[]});
  }
};
