// api/prices.js — Live stock prices via Finnhub
// Server-side = no CORS, no rate limit exposure

const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd847u89r01qutij88epgd847u89r01qutij88eq0';

const TICKERS = [
  'NVDA','TSM','ASML','AMD','AAPL','MSFT','AMZN','GOOGL','META',
  'QCOM','AVGO','INTC','AMAT','LRCX','KLAC',
  'VST','CEG','NEE','GEV',
  'XOM','SHEL','BP','CVX',
  'JPM','GS',
  'CRWV','ORCL',
];

async function fetchQuote(ticker) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await res.json();
    if(!d || !d.c || d.c === 0) return null;
    return {
      ticker,
      price: d.c,
      change: d.dp,      // % change
      changeAbs: d.d,    // absolute change
      high: d.h,
      low: d.l,
      open: d.o,
      prevClose: d.pc,
    };
  } catch(e) {
    return null;
  }
}

async function fetchProfile(ticker) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await res.json();
    return {
      marketCap: d.marketCapitalization ? `$${(d.marketCapitalization/1000).toFixed(1)}B` : null,
      pe: null, // need separate endpoint
      industry: d.finnhubIndustry || null,
      country: d.country || null,
    };
  } catch(e) { return {}; }
}

async function fetchRecommendation(ticker) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await res.json();
    if(!Array.isArray(d) || !d.length) return null;
    const latest = d[0];
    const total = (latest.buy||0)+(latest.hold||0)+(latest.sell||0)+(latest.strongBuy||0)+(latest.strongSell||0);
    if(!total) return null;
    return {
      strongBuy: latest.strongBuy || 0,
      buy: latest.buy || 0,
      hold: latest.hold || 0,
      sell: latest.sell || 0,
      strongSell: latest.strongSell || 0,
      total,
      consensus: total > 0 ? (
        ((latest.strongBuy||0)*2 + (latest.buy||0)*1 + (latest.sell||0)*-1 + (latest.strongSell||0)*-2) / total
      ).toFixed(2) : 0,
    };
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  if(req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).end();
    return;
  }

  // Support single ticker query: /api/prices?ticker=NVDA
  const { ticker } = req.query;

  try {
    if(ticker) {
      // Single ticker — full detail including recommendation
      const [quote, profile, recommendation] = await Promise.all([
        fetchQuote(ticker),
        fetchProfile(ticker),
        fetchRecommendation(ticker),
      ]);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.status(200).json({ ticker, quote, profile, recommendation });
    } else {
      // All tickers — batch fetch quotes
      const quotes = await Promise.all(TICKERS.map(t => fetchQuote(t)));
      const prices = {};
      quotes.forEach(q => { if(q) prices[q.ticker] = q; });
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.status(200).json({
        prices,
        fetchedAt: new Date().toISOString(),
        count: Object.keys(prices).length,
      });
    }
  } catch(e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: e.message });
  }
}
