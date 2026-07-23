'use strict';

/* ===================================================================
   ETF-Datenmodul
   Einfaches Array mit Symbol + Anzeigename + Datenquellen-Tickern.
   Neue ETFs koennen hier einfach ergaenzt werden:
   { symbol, name, currency, category, stooq, yahoo }
   - symbol/name: Anzeige in der App
   - currency: native Handelswaehrung (USD/EUR/GBP)
   - category: nur fuer Gruppierung/Suche, rein informativ
   - stooq: Stooq-Tickernotation (klein geschrieben, z.B. "spy.us")
   - yahoo: Yahoo-Finance-Symbol (Fallback ueber CORS-Proxy)
   =================================================================== */

const ETF_LIST = [
  // Welt / Standard
  { symbol: 'VWCE.DE', name: 'Vanguard FTSE All-World UCITS ETF', currency: 'EUR', category: 'Welt', stooq: 'vwce.de', yahoo: 'VWCE.DE' },
  { symbol: 'IWDA.AS', name: 'iShares Core MSCI World UCITS ETF', currency: 'EUR', category: 'Welt', stooq: 'iwda.uk', yahoo: 'IWDA.AS' },
  { symbol: 'VUSA.L', name: 'Vanguard S&P 500 UCITS ETF', currency: 'GBP', category: 'Welt', stooq: 'vusa.uk', yahoo: 'VUSA.L' },
  { symbol: 'EUNL.DE', name: 'iShares Core MSCI World UCITS ETF', currency: 'EUR', category: 'Welt', stooq: 'eunl.de', yahoo: 'EUNL.DE' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', currency: 'USD', category: 'Welt', stooq: 'spy.us', yahoo: 'SPY' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', currency: 'USD', category: 'Welt', stooq: 'qqq.us', yahoo: 'QQQ' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', currency: 'USD', category: 'Welt', stooq: 'voo.us', yahoo: 'VOO' },

  // Sektor / Thema
  { symbol: 'XAIX.DE', name: 'Xtrackers Artificial Intelligence & Big Data UCITS ETF', currency: 'EUR', category: 'Sektor', stooq: 'xaix.de', yahoo: 'XAIX.DE' },
  { symbol: 'TDIV.DE', name: 'VanEck Morningstar Developed Markets Dividend Leaders UCITS ETF', currency: 'EUR', category: 'Sektor', stooq: 'tdiv.de', yahoo: 'TDIV.DE' },
  { symbol: 'IUIT.DE', name: 'iShares S&P 500 Information Technology Sector UCITS ETF', currency: 'EUR', category: 'Sektor', stooq: 'iuit.de', yahoo: 'IUIT.DE' },
  { symbol: 'EXX1.DE', name: 'iShares Core DAX UCITS ETF', currency: 'EUR', category: 'Sektor', stooq: 'exx1.de', yahoo: 'EXX1.DE' },

  // Anleihen
  { symbol: 'AGGH.DE', name: 'iShares Core Global Aggregate Bond UCITS ETF', currency: 'EUR', category: 'Anleihen', stooq: 'aggh.de', yahoo: 'AGGH.DE' },
  { symbol: 'IEAG.DE', name: 'iShares Euro Aggregate Bond UCITS ETF', currency: 'EUR', category: 'Anleihen', stooq: 'ieag.de', yahoo: 'IEAG.DE' },

  // Rohstoffe / Gold
  { symbol: 'EGLN.L', name: 'iShares Physical Gold ETC', currency: 'GBP', category: 'Rohstoffe', stooq: 'egln.uk', yahoo: 'EGLN.L' },
  { symbol: 'SGLN.L', name: 'iShares Physical Gold ETC (GBP)', currency: 'GBP', category: 'Rohstoffe', stooq: 'sgln.uk', yahoo: 'SGLN.L' },

  // Region
  { symbol: 'EIMI.L', name: 'iShares Core MSCI EM IMI UCITS ETF', currency: 'GBP', category: 'Region', stooq: 'eimi.uk', yahoo: 'EIMI.L' },
  { symbol: 'IUSA.DE', name: 'iShares Core S&P 500 UCITS ETF', currency: 'EUR', category: 'Region', stooq: 'iusa.de', yahoo: 'IUSA.DE' },
];
