const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd847u89r01qutij88epgd847u89r01qutij88eq0';

const TICKERS = [
  'NVDA','TSM','ASML','AMD','AAPL','MSFT','AMZN','GOOGL','META',
  'QCOM','AVGO','INTC','AMAT','LRCX','KLAC',
  'VST','CEG','NEE','XOM','JPM','CRWV','ORCL',
];

async function fetchQuote(ticker) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await res.json();
    if(!d || !d.c || d.c === 0) return null;
    return { ticker, price: d.c, change: d.dp, changeAbs: d.d, high: d.h, low: d.l, prevClose: d.pc };
  } catch(e) { return null; }
}

async function fetchRecommendation(ticker) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const d = await res.json();
    if(!Array.isArray(d) || !d.length) return null;
    const l = d[0];
    const total = (l.buy||0)+(l.hold||0)+(l.sell||0)+(l.strongBuy||0)+(l.strongSell||0);
    return { strongBuy:l.strongBuy||0, buy:l.buy||0, hold:l.hold||0, sell:l.sell||0, strongSell:l.strongSell||0, total };
  } catch(e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.status(200).end();return;}

  const { ticker } = req.query;
  try {
    if(ticker) {
      const [quote, recommendation] = await Promise.all([fetchQuote(ticker), fetchRecommendation(ticker)]);
      res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');
      res.status(200).json({ ticker, quote, recommendation });
    } else {
      const quotes = await Promise.all(TICKERS.map(t => fetchQuote(t)));
      const prices = {};
      quotes.forEach(q => { if(q) prices[q.ticker] = q; });
      res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');
      res.status(200).json({ prices, fetchedAt: new Date().toISOString(), count: Object.keys(prices).length });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
