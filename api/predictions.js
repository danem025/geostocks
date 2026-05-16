// api/predictions.js
const STOCK_MAP = {
  'nvidia':['NVDA'],'tsmc':['TSM'],'asml':['ASML'],'taiwan':['TSM','ASML'],
  'semiconductor':['NVDA','TSM'],'chip':['NVDA','TSM'],
  'oil':['XOM','SHEL'],'opec':['XOM'],'hormuz':['XOM','SHEL'],
  'fed':['JPM'],'rate':['JPM'],'nuclear':['VST','CEG','NEE'],
  'microsoft':['MSFT'],'google':['GOOGL'],'amazon':['AMZN'],
  'apple':['AAPL'],'meta':['META'],
};
function detectStocks(text){const t=text.toLowerCase();const found=new Set();for(const[k,v]of Object.entries(STOCK_MAP)){if(t.includes(k))v.forEach(tk=>found.add(tk));}return[...found].slice(0,4);}
function detectRegion(text){const t=text.toLowerCase();if(/china|taiwan|japan|korea|asia/.test(t))return'asia';if(/europe|eu|germany|france|uk/.test(t))return'europe';if(/iran|saudi|gulf|mena|israel|hormuz/.test(t))return'mena';return'americas';}
function detectSector(text){const t=text.toLowerCase();if(/nvidia|chip|semiconductor|tsmc|asml/.test(t))return'semi';if(/oil|opec|crude/.test(t))return'oil';if(/nuclear|renewable|power/.test(t))return'energy_s';if(/bank|fed|rate|inflation/.test(t))return'finance';return'tech';}
function fmtVol(v){if(v>1e6)return'$'+(v/1e6).toFixed(1)+'M';if(v>1e3)return'$'+(v/1e3).toFixed(0)+'K';return'$'+Math.round(v);}

const STATIC=[
  {id:'s1',platform:'polymarket',regions:['asia'],sectors:['semi'],question:'Will China conduct military operations against Taiwan in 2026?',yes:12,vol:'$2.4M',closes:'Dec 31 2026',fill:'r',stocks:['TSM','NVDA','ASML'],isLive:false},
  {id:'s2',platform:'kalshi',regions:['mena'],sectors:['oil'],question:'Will Strait of Hormuz face a naval blockade in 2026?',yes:18,vol:'$890K',closes:'Dec 31 2026',fill:'y',stocks:['XOM','AMKBY'],isLive:false},
  {id:'s3',platform:'polymarket',regions:['americas'],sectors:['finance'],question:'Will the Fed cut rates before September 2026?',yes:34,vol:'$5.1M',closes:'Sep 1 2026',fill:'',stocks:['JPM'],isLive:false},
  {id:'s4',platform:'kalshi',regions:['americas'],sectors:['semi'],question:'Will Nvidia remain largest company by market cap end 2026?',yes:58,vol:'$3.2M',closes:'Dec 31 2026',fill:'',stocks:['NVDA','AAPL'],isLive:false},
  {id:'s5',platform:'polymarket',regions:['europe','asia'],sectors:['semi'],question:'Will EU ban all ASML exports to China by end of 2026?',yes:44,vol:'$1.8M',closes:'Dec 31 2026',fill:'y',stocks:['ASML','TSM'],isLive:false},
  {id:'s6',platform:'kalshi',regions:['americas'],sectors:['energy_s'],question:'Will 5+ nuclear datacenter power contracts be signed in 2026?',yes:71,vol:'$680K',closes:'Dec 31 2026',fill:'',stocks:['VST','CEG','NEE'],isLive:false},
];

async function fetchPolymarket(){
  try{
    const res=await fetch('https://gamma-api.polymarket.com/markets?limit=20&active=true&closed=false&order=volume&ascending=false',{signal:AbortSignal.timeout(8000)});
    const markets=await res.json();
    if(!Array.isArray(markets)) return[];
    return markets.filter(m=>m.question&&m.question.length>10).slice(0,12).map((m,i)=>{
      const q=m.question||'';
      let yesPrice=50;
      try{if(m.outcomePrices){const p=JSON.parse(m.outcomePrices);yesPrice=parseFloat(p[0])*100;}}catch(e){}
      return{id:'pm_'+i,platform:'polymarket',regions:[detectRegion(q)],sectors:[detectSector(q)],question:q.slice(0,150),yes:Math.round(Math.min(99,Math.max(1,yesPrice))),vol:m.volume?fmtVol(parseFloat(m.volume)):'—',closes:m.endDate?new Date(m.endDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—',fill:yesPrice>70?'':yesPrice<30?'r':'y',stocks:detectStocks(q),isLive:true};
    });
  }catch(e){return[];}
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.status(200).end();return;}
  try{
    const live=await fetchPolymarket();
    const result=live.length>0?[...live,...STATIC.slice(0,3)]:STATIC;
    res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=240');
    res.status(200).json({markets:result,sources:{polymarket:live.length},fetchedAt:new Date().toISOString()});
  }catch(e){
    res.status(200).json({markets:STATIC,error:e.message});
  }
};
