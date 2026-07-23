'use strict';

/* ===================================================================
   Konfiguration
   =================================================================== */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const NEWS_API_URL = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN';
const RSS_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
];
const FX_API_URL = 'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP';
const FNG_API_URL = 'https://api.alternative.me/fng/?limit=1';

const HOLDINGS_STORAGE_KEY = 'crypto_dashboard_portfolio_v2';
const LEGACY_HOLDINGS_STORAGE_KEY = 'crypto_dashboard_portfolio_v1';
const WATCHLIST_STORAGE_KEY = 'crypto_dashboard_watchlist_v1';
const ALERTS_STORAGE_KEY = 'crypto_dashboard_alerts_v1';
const CURRENCY_STORAGE_KEY = 'crypto_dashboard_currency_v1';
const PORTFOLIO_HISTORY_KEY = 'crypto_dashboard_portfolio_history_v1';
const MARKET_SNAPSHOT_KEY = 'crypto_dashboard_market_snapshot_v1';

const MARKET_REFRESH_MS = 60 * 1000;
const ETF_REFRESH_MS = 60 * 1000;
const NEWS_REFRESH_MS = 5 * 60 * 1000;
const FX_REFRESH_MS = 60 * 60 * 1000;
const FNG_REFRESH_MS = 10 * 60 * 1000;
const TRENDING_REFRESH_MS = 10 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = [5000, 15000, 30000];

// ETF_LIST wird aus etfs-data.js geladen (eigenes Datenmodul, vor app.js eingebunden).

const ETF_RANGE_DAYS_BACK = { 7: 12, 30: 45, 365: 400 };
const YAHOO_RANGE_MAP = { 7: ['1mo', '1d'], 30: ['3mo', '1d'], 365: ['1y', '1d'] };

// Chart-Serien (Modal, Korrelation) ändern sich selten schneller als der Marktpreis selbst,
// daher eigene, längere TTL statt bei jedem Öffnen neu zu laden.
const CHART_CACHE_TTL_MS = 5 * 60 * 1000;

/* ===================================================================
   Zustand
   =================================================================== */

const state = {
  coins: [],
  coinsLoadedAt: 0,
  search: '',
  sortKey: 'market_cap',
  sortDir: 'desc',
  marketWatchlistOnly: false,

  etfs: [],
  etfsLoadedAt: 0,
  etfSortKey: 'name',
  etfSortDir: 'asc',
  etfWatchlistOnly: false,
  etfSearch: '',

  chartCache: {},

  news: [],
  newsLoadedAt: 0,
  newsSource: null,

  displayCurrency: loadDisplayCurrency(),
  fxRates: { USD: 1, EUR: 0.92, GBP: 0.79 },
  fxLoadedAt: 0,

  fng: null,
  fngLoadedAt: 0,

  watchlist: loadWatchlist(),
  whatIf: new Map(),
};

let holdings = loadHoldings();
let alerts = loadAlerts();
let newsCategoryFilter = 'ALL';

let sparkCharts = new Map();
let etfSparkCharts = new Map();
let modalChart = null;
let donutChart = null;
let currentModalAsset = null;
let currentModalRange = '7';

/* ===================================================================
   Utils: Escaping, Zahlen, Zeit
   =================================================================== */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function genId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function round2(n) { return n == null ? n : Math.round(n * 100) / 100; }

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2).replace('.', ',')} %`;
}

function formatAmount(value) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 }).format(value);
}

function changeClass(value) {
  if (value == null || Number.isNaN(value)) return '';
  return value >= 0 ? 'change-positive' : 'change-negative';
}

function formatChartLabel(ts, range) {
  const d = new Date(ts);
  if (String(range) === '7') return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  if (String(range) === '30') return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

function updateLastUpdated(section, timestamp) {
  const el = document.getElementById(`${section}-last-updated`);
  if (!el || !timestamp) return;
  el.textContent = `Zuletzt aktualisiert: ${new Date(timestamp).toLocaleTimeString('de-DE')}`;
}

/* ===================================================================
   Währung: Frankfurter FX-Raten, Umrechnung, Umschalter
   =================================================================== */

function loadDisplayCurrency() {
  try {
    const v = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return (v === 'USD' || v === 'EUR') ? v : 'EUR';
  } catch {
    return 'EUR';
  }
}

function saveDisplayCurrency() {
  try { localStorage.setItem(CURRENCY_STORAGE_KEY, state.displayCurrency); } catch (err) { console.error(err); }
}

function convertAmount(amount, fromCcy, toCcy) {
  if (amount == null || Number.isNaN(amount)) return null;
  if (!fromCcy || fromCcy === toCcy) return amount;
  const rates = state.fxRates;
  if (!rates || !rates[fromCcy] || !rates[toCcy]) return amount;
  const amountInUsd = amount / rates[fromCcy];
  return amountInUsd * rates[toCcy];
}

function formatCurrency(value, fromCcy = 'USD') {
  let converted = convertAmount(value, fromCcy, state.displayCurrency);
  if (converted == null) return '—';
  if (Math.abs(converted) < 1e-8) converted = 0; // Floating-Point-Rauschen (z.B. bei What-if-Differenzen) glaetten
  const abs = Math.abs(converted);
  const decimals = abs === 0 ? 2 : (abs >= 1 ? 2 : (abs >= 0.01 ? 4 : 6));
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: state.displayCurrency,
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(converted);
}

function formatCompactCurrency(value, fromCcy = 'USD') {
  const converted = convertAmount(value, fromCcy, state.displayCurrency);
  if (converted == null) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: state.displayCurrency, notation: 'compact', maximumFractionDigits: 2,
  }).format(converted);
}

async function fetchFxRates() {
  const json = await fetchWithRetry(FX_API_URL, { retries: 1 });
  const rates = (json && json.rates) || {};
  return { USD: 1, EUR: rates.EUR || state.fxRates.EUR, GBP: rates.GBP || state.fxRates.GBP };
}

async function loadFxRates({ force = false } = {}) {
  try {
    const rates = await ensureFresh(dataSources.fx, { force });
    state.fxRates = rates;
    state.fxLoadedAt = dataSources.fx.loadedAt;
    renderMarketTable();
    renderEtfTable();
    renderPortfolio();
    refreshModalIfOpen();
  } catch (err) {
    console.warn('Wechselkurse konnten nicht aktualisiert werden, nutze zuletzt bekannte Werte:', err);
  } finally {
    updateSectionStatus('fx');
  }
}

function initCurrencyToggle() {
  const container = document.getElementById('currency-toggle');
  if (!container) return;
  container.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.ccy === state.displayCurrency);
    btn.addEventListener('click', () => {
      if (btn.dataset.ccy === state.displayCurrency) return;
      state.displayCurrency = btn.dataset.ccy;
      saveDisplayCurrency();
      container.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      renderMarketTable();
      renderEtfTable();
      renderPortfolio();
      refreshModalIfOpen();
    });
  });
}

/* ===================================================================
   Fetch mit Retry / Backoff (Rate-Limit-Behandlung) + Call-Logging
   =================================================================== */

const apiCallCounts = {};

function logApiCall(label) {
  apiCallCounts[label] = (apiCallCounts[label] || 0) + 1;
}

function startApiCallLogger() {
  setInterval(() => {
    const entries = Object.entries(apiCallCounts);
    if (entries.length) {
      console.log('[API calls/min]', Object.fromEntries(entries));
      Object.keys(apiCallCounts).forEach((k) => { apiCallCounts[k] = 0; });
    }
  }, 60 * 1000);
}

function hostLabel(url) {
  try { return new URL(url, location.href).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
}

async function fetchWithRetry(url, { retries = 3, backoff = 2000, parse = 'json' } = {}) {
  let lastErr = null;
  const label = hostLabel(url);
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    logApiCall(label);
    try {
      res = await fetch(url);
    } catch (networkErr) {
      lastErr = networkErr;
      if (attempt === retries) throw lastErr;
      await sleep(backoff * (2 ** attempt));
      continue;
    }

    if (res.status === 429) {
      lastErr = new Error('RATE_LIMIT');
      if (attempt === retries) throw lastErr;
      const retryAfterHeader = Number(res.headers.get('Retry-After'));
      const wait = retryAfterHeader > 0 ? retryAfterHeader * 1000 : (RATE_LIMIT_BACKOFF_MS[attempt] || backoff * (2 ** attempt));
      console.warn(`Rate-Limit bei ${label} — warte ${wait}ms vor erneutem Versuch (${attempt + 1}/${retries}).`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return parse === 'text' ? res.text() : res.json();
  }
  throw lastErr;
}

function proxied(url) { return `${CORS_PROXY}${encodeURIComponent(url)}`; }

/* ===================================================================
   Zentrale Daten-Layer: TTL-Cache, In-Flight-Deduplizierung, Status
   =================================================================== */

function createDataSource(key, ttlMs, fetcher) {
  return { key, ttlMs, fetcher, data: null, loadedAt: 0, status: 'idle', lastError: null, inFlight: null };
}

const dataSources = {
  market: createDataSource('market', MARKET_REFRESH_MS, fetchMarketData),
  etf: createDataSource('etf', ETF_REFRESH_MS, fetchEtfData),
  news: createDataSource('news', NEWS_REFRESH_MS, fetchNewsData),
  fx: createDataSource('fx', FX_REFRESH_MS, fetchFxRates),
  fng: createDataSource('fng', FNG_REFRESH_MS, fetchFearGreed),
  trending: createDataSource('trending', TRENDING_REFRESH_MS, fetchTrending),
};

async function ensureFresh(source, { force = false } = {}) {
  const age = Date.now() - source.loadedAt;
  if (!force && source.data != null && age < source.ttlMs) return source.data;
  if (source.inFlight) return source.inFlight;

  source.inFlight = (async () => {
    try {
      const data = await source.fetcher();
      source.data = data;
      source.loadedAt = Date.now();
      source.status = 'ok';
      source.lastError = null;
      return data;
    } catch (err) {
      source.status = source.data != null ? 'stale' : 'error';
      source.lastError = err;
      throw err;
    } finally {
      source.inFlight = null;
      renderStatusDots();
    }
  })();
  return source.inFlight;
}

function renderStatusDots() {
  ['market', 'etf', 'news', 'fx'].forEach((key) => {
    const el = document.getElementById(`${key}-status-dot`);
    if (!el) return;
    const status = dataSources[key].status;
    el.className = `status-dot status-dot-${status === 'ok' ? 'ok' : (status === 'stale' ? 'stale' : 'error')}`;
    const label = status === 'ok' ? 'aktuell' : (status === 'stale' ? 'verzögert' : 'Fehler');
    el.title = `${key.toUpperCase()}: ${label}`;
  });
}

/* ===================================================================
   Sichtbarkeit: Auto-Refresh pausieren, wenn Tab nicht aktiv ist
   =================================================================== */

const refreshTimers = {};

function startAutoRefresh(key, intervalMs, callback) {
  stopAutoRefresh(key);
  refreshTimers[key] = setInterval(callback, intervalMs);
}

function stopAutoRefresh(key) {
  if (refreshTimers[key]) { clearInterval(refreshTimers[key]); refreshTimers[key] = null; }
}

function initVisibilityHandling() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resumeAutoRefresh();
      ensureFresh(dataSources.market).then(() => { renderMarketTable(); renderPortfolio(); }).catch(() => {});
      ensureFresh(dataSources.etf).then(() => { renderEtfTable(); renderPortfolio(); }).catch(() => {});
      ensureFresh(dataSources.news).then(renderNewsFromSource).catch(() => {});
    } else {
      pauseAutoRefresh();
    }
  });
}

function pauseAutoRefresh() {
  stopAutoRefresh('market');
  stopAutoRefresh('etf');
  stopAutoRefresh('news');
}

function resumeAutoRefresh() {
  startAutoRefresh('market', MARKET_REFRESH_MS, () => {
    ensureFresh(dataSources.market).then(() => { renderMarketTable(); renderPortfolio(); checkPriceAlerts(); }).catch((err) => console.warn('Markt-Refresh fehlgeschlagen:', err)).finally(() => updateSectionStatus('market'));
  });
  startAutoRefresh('etf', ETF_REFRESH_MS, () => {
    ensureFresh(dataSources.etf).then(() => { renderEtfTable(); renderPortfolio(); checkPriceAlerts(); }).catch((err) => console.warn('ETF-Refresh fehlgeschlagen:', err)).finally(() => updateSectionStatus('etf'));
  });
  startAutoRefresh('news', NEWS_REFRESH_MS, () => {
    ensureFresh(dataSources.news).then(renderNewsFromSource).catch((err) => console.warn('News-Refresh fehlgeschlagen:', err)).finally(() => updateSectionStatus('news'));
  });
}

function updateSectionStatus(key) {
  const source = dataSources[key];
  const errEl = document.getElementById(`${key}-error`);
  if (errEl) {
    if (source.status === 'error' || source.status === 'stale') {
      const lastOk = source.loadedAt ? new Date(source.loadedAt).toLocaleTimeString('de-DE') : '–';
      errEl.textContent = `${sectionLabel(key)} momentan nicht verfügbar, letzter Stand: ${lastOk}.`;
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
    }
  }
  renderStatusDots();
}

function sectionLabel(key) {
  return { market: 'Marktdaten', etf: 'ETF-Daten', news: 'News', fx: 'Wechselkurse' }[key] || key;
}

/* ===================================================================
   Asset-Modell (gemeinsame Sicht auf Krypto + ETF)
   =================================================================== */

function coinToAsset(c) {
  return {
    type: 'crypto',
    id: c.id,
    symbol: (c.symbol || '').toUpperCase(),
    name: c.name,
    image: c.image,
    currency: 'USD',
    price: c.current_price,
    changeAbs: c.price_change_24h,
    changePct: c.price_change_percentage_24h,
    marketCap: c.market_cap,
    rank: c.market_cap_rank,
    sparkline: (c.sparkline_in_7d && c.sparkline_in_7d.price) || [],
  };
}

function getAllAssets() {
  return [...state.coins.map(coinToAsset), ...state.etfs];
}

function findAsset(type, id) {
  if (type === 'crypto') {
    const c = state.coins.find((x) => x.id === id);
    return c ? coinToAsset(c) : null;
  }
  if (type === 'etf') {
    return state.etfs.find((x) => x.id === id) || null;
  }
  return null;
}

function assetIconHtml(asset, size) {
  if (asset.image) {
    if (size === 'sm') return `<img class="coin-icon" src="${escapeHtml(asset.image)}" alt="" loading="lazy">`;
    return `<img src="${escapeHtml(asset.image)}" alt="" loading="lazy">`;
  }
  const monoCls = size === 'lg' ? 'asset-monogram' : (size === 'xs' ? 'asset-monogram-xs' : 'asset-monogram-sm');
  const initials = escapeHtml(asset.symbol.replace(/\..+$/, '').slice(0, 2).toUpperCase());
  return `<span class="${monoCls}">${initials}</span>`;
}

function sortAssets(assets, sortKey, sortDir) {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...assets].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
    let av;
    let bv;
    if (sortKey === 'price') { av = a.price ?? -Infinity; bv = b.price ?? -Infinity; } else if (sortKey === 'change') { av = a.changePct ?? -Infinity; bv = b.changePct ?? -Infinity; } else { av = a.marketCap ?? -Infinity; bv = b.marketCap ?? -Infinity; }
    return (av - bv) * dir;
  });
}

function filterAssetsBySearch(assets, query) {
  const q = query.trim().toLowerCase();
  if (!q) return assets;
  return assets.filter((a) => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q));
}

function filterAssetsByWatchlist(assets, onlyWatchlist) {
  if (!onlyWatchlist) return assets;
  return assets.filter((a) => isWatchlisted(a.type, a.id));
}

function buildAssetRowHtml(a, { showRank }) {
  const watch = isWatchlisted(a.type, a.id);
  return `
    <tr data-type="${a.type}" data-id="${escapeHtml(a.id)}">
      <td class="col-star"><button type="button" class="star-btn ${watch ? 'active' : ''}" data-type="${a.type}" data-id="${escapeHtml(a.id)}" aria-label="Watchlist">${watch ? '★' : '☆'}</button></td>
      ${showRank ? `<td class="col-rank">${a.rank ?? '—'}</td>` : ''}
      <td class="col-name">
        <div class="coin-name-cell">
          ${assetIconHtml(a, 'sm')}
          <span class="coin-name-text">${escapeHtml(a.name)}</span>
          <span class="coin-symbol">${escapeHtml(a.symbol)}</span>
        </div>
      </td>
      <td class="col-price">${formatCurrency(a.price, a.currency)}</td>
      <td class="col-change ${changeClass(a.changePct)}">${formatPercent(a.changePct)}</td>
      <td class="col-cap">${a.marketCap != null ? formatCompactCurrency(a.marketCap, a.currency) : '—'}</td>
      <td class="col-spark"><canvas class="spark-canvas" id="spark-${a.type}-${escapeHtml(a.id)}" width="110" height="36"></canvas></td>
    </tr>
  `;
}

function attachSparklines(assets, chartsMap) {
  assets.forEach((a) => {
    const prices = a.sparkline;
    if (!prices || !prices.length) return;
    const canvas = document.getElementById(`spark-${a.type}-${a.id}`);
    if (!canvas || typeof Chart === 'undefined') return;
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: prices.map((_, i) => i), datasets: [{ data: prices, borderColor: '#111111', borderWidth: 1.25, pointRadius: 0, tension: 0.15, fill: false }] },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
    chartsMap.set(`${a.type}-${a.id}`, chart);
  });
}

function wireStarButtons(container) {
  container.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWatchlist(btn.dataset.type, btn.dataset.id);
    });
  });
}

/* ===================================================================
   MARKT — Daten laden
   =================================================================== */

async function fetchMarketData() {
  const data = await fetchWithRetry(`${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true`);
  const coins = Array.isArray(data) ? data : [];
  if (coins.length) saveMarketSnapshot(coins);
  return coins;
}

// Letzten erfolgreichen Marktstand lokal sichern, damit die Tabelle beim nächsten
// Öffnen sofort gefüllt ist (mit Zeitstempel), statt auf die API warten zu müssen.
function saveMarketSnapshot(coins) {
  try {
    localStorage.setItem(MARKET_SNAPSHOT_KEY, JSON.stringify({ t: Date.now(), coins }));
  } catch { /* voller localStorage ist kein Grund, das Laden scheitern zu lassen */ }
}

function restoreMarketSnapshot() {
  try {
    const raw = localStorage.getItem(MARKET_SNAPSHOT_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);
    if (!snap || !Array.isArray(snap.coins) || !snap.coins.length) return false;
    state.coins = snap.coins;
    state.coinsLoadedAt = snap.t || 0;
    updateHeaderMeta();
    renderMarketTable();
    renderPortfolio();
    updateLastUpdated('market', state.coinsLoadedAt);
    return true;
  } catch {
    return false;
  }
}

async function loadMarketData({ force = false } = {}) {
  if (!dataSources.market.data) setMarketStatus('Lade Marktdaten …');
  try {
    const data = await ensureFresh(dataSources.market, { force });
    state.coins = data;
    state.coinsLoadedAt = dataSources.market.loadedAt;
    updateHeaderMeta();
    renderMarketTable();
    renderPortfolio();
    updateLastUpdated('market', state.coinsLoadedAt);
    checkPriceAlerts();
  } catch (err) {
    console.error('Marktdaten konnten nicht geladen werden:', err);
    if (state.coins.length) renderMarketTable();
  } finally {
    if (!state.coins.length) setMarketStatus('Keine Marktdaten verfügbar.');
    updateSectionStatus('market');
  }
}

function setMarketStatus(text) {
  const el = document.getElementById('market-status');
  if (el) el.textContent = text;
}

function updateHeaderMeta() {
  const el = document.getElementById('coin-count-meta');
  if (el) el.textContent = `${state.coins.length || 50} COINS · LIVE`;
}

/* ===================================================================
   MARKT — Sortieren, Filtern, Rendern (rein im Speicher, kein Reload)
   =================================================================== */

function getFilteredSortedMarketAssets() {
  let assets = state.coins.map(coinToAsset);
  assets = filterAssetsBySearch(assets, state.search);
  assets = filterAssetsByWatchlist(assets, state.marketWatchlistOnly);
  return sortAssets(assets, state.sortKey, state.sortDir);
}

function renderMarketTable() {
  const tbody = document.getElementById('market-tbody');
  if (!tbody) return;
  const assets = getFilteredSortedMarketAssets();

  sparkCharts.forEach((chart) => chart.destroy());
  sparkCharts.clear();

  if (!assets.length) {
    tbody.innerHTML = '';
    setMarketStatus(state.coins.length ? 'Keine Treffer.' : 'Lade Marktdaten …');
    return;
  }
  setMarketStatus('');

  tbody.innerHTML = assets.map((a) => buildAssetRowHtml(a, { showRank: true })).join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.star-btn')) return;
      openAssetModal(tr.dataset.type, tr.dataset.id);
    });
  });
  wireStarButtons(tbody);
  attachSparklines(assets, sparkCharts);
}

/* ===================================================================
   MARKT — Sortier-Pills, Suche, Watchlist-Filter
   =================================================================== */

function updateSortPillsUI() {
  document.querySelectorAll('#sort-pills .pill').forEach((p) => {
    const isActive = p.dataset.sort === state.sortKey;
    p.classList.toggle('active', isActive);
    const arrow = p.querySelector('.arrow');
    if (arrow) arrow.textContent = isActive ? (state.sortDir === 'desc' ? '↓' : '↑') : '↓';
  });
}

function initMarketControls() {
  document.getElementById('sort-pills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    const key = btn.dataset.sort;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      state.sortKey = key;
      state.sortDir = 'desc';
    }
    updateSortPillsUI();
    renderMarketTable();
  });

  const searchInput = document.getElementById('market-search');
  searchInput?.addEventListener('input', () => {
    state.search = searchInput.value;
    renderMarketTable();
  });
  document.getElementById('market-search-btn')?.addEventListener('click', () => {
    state.search = searchInput.value;
    renderMarketTable();
  });

  document.getElementById('market-watchlist-filter')?.addEventListener('click', (e) => {
    state.marketWatchlistOnly = !state.marketWatchlistOnly;
    e.currentTarget.dataset.active = String(state.marketWatchlistOnly);
    renderMarketTable();
  });
}

/* ===================================================================
   ETF — Stooq CSV (primär) + Yahoo Finance via CORS-Proxy (Fallback)
   =================================================================== */

function stooqDateStr(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function parseStooqHistoryCsv(text) {
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0].toLowerCase().startsWith('date,')) return [];
  const points = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    if (cols.length < 5) continue;
    const close = parseFloat(cols[4]);
    if (!cols[0] || Number.isNaN(close)) continue;
    const t = new Date(`${cols[0]}T00:00:00Z`).getTime();
    if (Number.isNaN(t)) continue;
    points.push({ t, price: close });
  }
  return points;
}

async function fetchStooqSeries(stooqSymbol, daysBack) {
  const d2 = new Date();
  const d1 = new Date(d2.getTime() - daysBack * 86400000);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${stooqDateStr(d1)}&d2=${stooqDateStr(d2)}&i=d`;
  // stooq.com sendet keine Access-Control-Allow-Origin-Header, ein direkter fetch() aus dem
  // Browser schlägt daher im Live-Betrieb (anders als in Node-basierten Tests) mit CORS-Fehler
  // fehl. Deshalb wie beim Yahoo-Fallback über den CORS-Proxy laufen lassen.
  const text = await fetchWithRetry(proxied(url), { retries: 0, parse: 'text' });
  const points = parseStooqHistoryCsv(text);
  if (!points.length) throw new Error('STOOQ_NO_DATA');
  return points;
}

async function fetchYahooSeries(yahooSymbol, range) {
  const [yRange, yInterval] = YAHOO_RANGE_MAP[range] || YAHOO_RANGE_MAP[7];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${yRange}&interval=${yInterval}`;
  const json = await fetchWithRetry(proxied(url), { retries: 1 });
  const result = json && json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('YAHOO_NO_DATA');
  const timestamps = result.timestamp || [];
  const closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
  const points = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    points.push({ t: timestamps[i] * 1000, price: closes[i] });
  }
  if (!points.length) throw new Error('YAHOO_EMPTY');
  return points;
}

async function loadEtfSeries(def, range) {
  try {
    return { points: await fetchStooqSeries(def.stooq, ETF_RANGE_DAYS_BACK[range] || 45), source: 'stooq' };
  } catch (err) {
    console.warn(`Stooq fehlgeschlagen für ${def.symbol} (${err.message}), nutze Yahoo-Finance-Fallback …`);
    return { points: await fetchYahooSeries(def.yahoo, range), source: 'yahoo' };
  }
}

async function fetchEtfData() {
  const results = await Promise.allSettled(ETF_LIST.map((def) => loadEtfSeries(def, 30)));
  const assets = [];
  results.forEach((res, i) => {
    const def = ETF_LIST[i];
    if (res.status !== 'fulfilled' || !res.value.points.length) {
      console.error(`ETF ${def.symbol} konnte über keine Quelle geladen werden:`, res.reason);
      return;
    }
    const points = res.value.points;
    const last = points[points.length - 1];
    const prev = points.length > 1 ? points[points.length - 2] : null;
    const changeAbs = prev ? last.price - prev.price : null;
    const changePct = prev && prev.price ? (changeAbs / prev.price) * 100 : null;
    state.chartCache[`etf:${def.symbol}:30`] = { points, loadedAt: Date.now() };
    assets.push({
      type: 'etf', id: def.symbol, symbol: def.symbol, name: def.name, image: null,
      currency: def.currency, price: last.price, changeAbs, changePct,
      marketCap: null, rank: null,
      sparkline: points.slice(-30).map((p) => p.price),
      dataSource: res.value.source,
    });
  });
  if (!assets.length) throw new Error('ETF_ALL_FAILED');
  return assets;
}

async function loadEtfData({ force = false } = {}) {
  if (!dataSources.etf.data) setEtfStatus('Lade ETF-Daten …');
  try {
    const assets = await ensureFresh(dataSources.etf, { force });
    state.etfs = assets;
    state.etfsLoadedAt = dataSources.etf.loadedAt;
    renderEtfTable();
    renderPortfolio();
    updateLastUpdated('etf', state.etfsLoadedAt);
    checkPriceAlerts();
  } catch (err) {
    console.error('ETF-Daten konnten nicht geladen werden:', err);
    if (state.etfs.length) renderEtfTable();
  } finally {
    if (!state.etfs.length) setEtfStatus('Keine ETF-Daten verfügbar.');
    updateSectionStatus('etf');
  }
}

function setEtfStatus(text) {
  const el = document.getElementById('etf-status');
  if (el) el.textContent = text;
}

function getFilteredSortedEtfAssets() {
  let assets = state.etfs.slice();
  assets = filterAssetsBySearch(assets, state.etfSearch);
  assets = filterAssetsByWatchlist(assets, state.etfWatchlistOnly);
  return sortAssets(assets, state.etfSortKey, state.etfSortDir);
}

function renderEtfTable() {
  const tbody = document.getElementById('etf-tbody');
  if (!tbody) return;
  const assets = getFilteredSortedEtfAssets();

  etfSparkCharts.forEach((chart) => chart.destroy());
  etfSparkCharts.clear();

  if (!assets.length) {
    tbody.innerHTML = '';
    setEtfStatus(state.etfs.length ? 'Keine Treffer.' : 'Lade ETF-Daten …');
    return;
  }
  setEtfStatus('');

  tbody.innerHTML = assets.map((a) => buildAssetRowHtml(a, { showRank: false })).join('');
  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.star-btn')) return;
      openAssetModal(tr.dataset.type, tr.dataset.id);
    });
  });
  wireStarButtons(tbody);
  attachSparklines(assets, etfSparkCharts);
}

function updateEtfSortPillsUI() {
  document.querySelectorAll('#etf-sort-pills .pill').forEach((p) => {
    const isActive = p.dataset.sort === state.etfSortKey;
    p.classList.toggle('active', isActive);
    const arrow = p.querySelector('.arrow');
    if (arrow) arrow.textContent = isActive ? (state.etfSortDir === 'desc' ? '↓' : '↑') : '↓';
  });
}

function initEtfControls() {
  const etfSearchInput = document.getElementById('etf-search');
  etfSearchInput?.addEventListener('input', () => {
    state.etfSearch = etfSearchInput.value;
    renderEtfTable();
  });
  document.getElementById('etf-search-btn')?.addEventListener('click', () => {
    state.etfSearch = etfSearchInput.value;
    renderEtfTable();
  });

  document.getElementById('etf-sort-pills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    const key = btn.dataset.sort;
    if (state.etfSortKey === key) {
      state.etfSortDir = state.etfSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      state.etfSortKey = key;
      state.etfSortDir = key === 'name' ? 'asc' : 'desc';
    }
    updateEtfSortPillsUI();
    renderEtfTable();
  });

  document.getElementById('etf-watchlist-filter')?.addEventListener('click', (e) => {
    state.etfWatchlistOnly = !state.etfWatchlistOnly;
    e.currentTarget.dataset.active = String(state.etfWatchlistOnly);
    renderEtfTable();
  });
}

/* ===================================================================
   WATCHLIST
   =================================================================== */

function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([...state.watchlist]));
  } catch (err) {
    console.error('Watchlist konnte nicht gespeichert werden:', err);
  }
}

function isWatchlisted(type, id) {
  return state.watchlist.has(`${type}:${id}`);
}

function toggleWatchlist(type, id) {
  const key = `${type}:${id}`;
  if (state.watchlist.has(key)) state.watchlist.delete(key); else state.watchlist.add(key);
  saveWatchlist();
  if (type === 'crypto') renderMarketTable(); else renderEtfTable();
  if (currentModalAsset && currentModalAsset.type === type && currentModalAsset.id === id) {
    updateModalWatchlistButton();
  }
}

/* ===================================================================
   FEAR & GREED INDEX
   =================================================================== */

async function fetchFearGreed() {
  const json = await fetchWithRetry(FNG_API_URL, { retries: 1 });
  const entry = json && json.data && json.data[0];
  if (!entry) throw new Error('FNG_EMPTY');
  return { value: Number(entry.value), classification: entry.value_classification };
}

async function loadFearGreed({ force = false } = {}) {
  try {
    const fng = await ensureFresh(dataSources.fng, { force });
    state.fng = fng;
    state.fngLoadedAt = dataSources.fng.loadedAt;
    renderFearGreed();
  } catch (err) {
    console.warn('Fear & Greed Index konnte nicht geladen werden:', err);
    renderFearGreed();
  }
}

function translateFngClassification(cls) {
  const map = {
    'Extreme Fear': 'Extreme Angst', Fear: 'Angst', Neutral: 'Neutral', Greed: 'Gier', 'Extreme Greed': 'Extreme Gier',
  };
  return map[cls] || cls || '–';
}

function renderFearGreed() {
  const valueEl = document.getElementById('fng-value');
  const classEl = document.getElementById('fng-classification');
  const fillEl = document.getElementById('fng-bar-fill');
  if (!valueEl) return;
  if (!state.fng) {
    valueEl.textContent = '–';
    classEl.textContent = 'Nicht verfügbar';
    fillEl.style.width = '0%';
    return;
  }
  valueEl.textContent = String(state.fng.value);
  classEl.textContent = translateFngClassification(state.fng.classification);
  fillEl.style.width = `${Math.max(0, Math.min(100, state.fng.value))}%`;
}

/* ===================================================================
   TRENDING — angesagteste/neueste Coins (CoinGecko /search/trending)
   =================================================================== */

async function fetchTrending() {
  const json = await fetchWithRetry(`${COINGECKO_BASE}/search/trending`, { retries: 1 });
  return ((json && json.coins) || []).map((c) => c.item).filter(Boolean).slice(0, 8);
}

async function loadTrending() {
  try {
    const items = await ensureFresh(dataSources.trending);
    renderTrending(items);
  } catch (err) {
    console.warn('Trending-Coins nicht verfügbar:', err);
    document.getElementById('trending-strip')?.classList.add('hidden');
  }
}

function renderTrending(items) {
  const strip = document.getElementById('trending-strip');
  const list = document.getElementById('trending-list');
  if (!strip || !list || !items.length) return;
  list.innerHTML = items.map((it) => {
    const pct = it.data && it.data.price_change_percentage_24h && it.data.price_change_percentage_24h.usd;
    const pctHtml = pct != null && Number.isFinite(pct)
      ? ` <span class="trending-pct ${changeClass(pct)}">${formatPercent(pct)}</span>` : '';
    return `
      <li class="trending-item" title="${escapeHtml(it.name)}${it.market_cap_rank ? ` · Rang ${it.market_cap_rank}` : ''}">
        ${it.thumb ? `<img src="${escapeHtml(it.thumb)}" alt="" loading="lazy">` : ''}
        <span class="trending-symbol">${escapeHtml((it.symbol || '').toUpperCase())}</span>${pctHtml}
      </li>`;
  }).join('');
  strip.classList.remove('hidden');
}

/* ===================================================================
   ASSET-DETAIL-MODAL (Krypto + ETF, gemeinsam)
   =================================================================== */

function openAssetModal(type, id) {
  const asset = findAsset(type, id);
  if (!asset) return;
  currentModalAsset = { type, id };
  currentModalRange = '7';

  document.getElementById('modal-asset-icon-wrap').innerHTML = assetIconHtml(asset, 'lg');
  document.getElementById('modal-asset-name').textContent = asset.name;
  document.getElementById('modal-asset-symbol').textContent = asset.symbol;
  document.getElementById('modal-asset-price').textContent = formatCurrency(asset.price, asset.currency);
  const changeEl = document.getElementById('modal-asset-change');
  changeEl.textContent = formatPercent(asset.changePct);
  changeEl.className = `change-tag ${changeClass(asset.changePct)}`;

  updateModalWatchlistButton();
  document.querySelectorAll('#range-pills .pill').forEach((p) => p.classList.toggle('active', p.dataset.range === '7'));

  renderModalAlerts();
  document.getElementById('alert-status')?.classList.add('hidden');
  document.getElementById('alert-form')?.reset();

  showModal();
  loadModalChart(type, id, '7');
}

function updateModalWatchlistButton() {
  const btn = document.getElementById('modal-watchlist-btn');
  if (!btn || !currentModalAsset) return;
  const watch = isWatchlisted(currentModalAsset.type, currentModalAsset.id);
  btn.textContent = watch ? '★' : '☆';
  btn.classList.toggle('active', watch);
}

function refreshModalIfOpen() {
  if (!currentModalAsset) return;
  const modalEl = document.getElementById('asset-modal');
  if (!modalEl || modalEl.classList.contains('hidden')) return;
  const asset = findAsset(currentModalAsset.type, currentModalAsset.id);
  if (!asset) return;
  document.getElementById('modal-asset-price').textContent = formatCurrency(asset.price, asset.currency);
  const changeEl = document.getElementById('modal-asset-change');
  changeEl.textContent = formatPercent(asset.changePct);
  changeEl.className = `change-tag ${changeClass(asset.changePct)}`;
  loadModalChart(currentModalAsset.type, currentModalAsset.id, currentModalRange);
}

function showModal() {
  const m = document.getElementById('asset-modal');
  m.classList.remove('hidden');
  m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const m = document.getElementById('asset-modal');
  m.classList.add('hidden');
  m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

const chartSeriesInFlight = {};

// Zentrale Chart-Serien-Beschaffung mit TTL-Cache + In-Flight-Dedup (analog zu ensureFresh),
// damit z.B. Modal-Öffnen und Korrelationsmatrix nicht parallel dieselbe Serie doppelt laden.
async function getOrFetchAssetSeries(type, id, range) {
  const cacheKey = `${type}:${id}:${range}`;
  const cached = state.chartCache[cacheKey];
  if (cached && Date.now() - cached.loadedAt < CHART_CACHE_TTL_MS) return cached.points;
  if (chartSeriesInFlight[cacheKey]) return chartSeriesInFlight[cacheKey];

  chartSeriesInFlight[cacheKey] = (async () => {
    try {
      let points;
      if (type === 'crypto') {
        const json = await fetchWithRetry(`${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${range}`);
        points = ((json && json.prices) || []).map(([t, price]) => ({ t, price }));
      } else {
        const def = ETF_LIST.find((e) => e.symbol === id);
        if (!def) throw new Error('UNKNOWN_ETF');
        const result = await loadEtfSeries(def, range);
        points = result.points;
      }
      state.chartCache[cacheKey] = { points, loadedAt: Date.now() };
      return points;
    } catch (err) {
      if (cached) return cached.points;
      throw err;
    } finally {
      chartSeriesInFlight[cacheKey] = null;
    }
  })();
  return chartSeriesInFlight[cacheKey];
}

async function loadModalChart(type, id, range) {
  const statusEl = document.getElementById('modal-status');
  statusEl.textContent = 'Lade Chart …';
  try {
    const points = await getOrFetchAssetSeries(type, id, range);
    statusEl.textContent = '';
    renderModalChart(points, range);
  } catch (err) {
    console.error('Chart konnte nicht geladen werden:', err);
    statusEl.textContent = 'Chart konnte nicht geladen werden — bitte später erneut versuchen.';
  }
}

// Gemeinsame Chart.js-Konfiguration für alle Preis-/Wert-Linencharts (Modal, Portfolio-Verlauf),
// damit Tooltip-/Achsen-Formatierung und Optik an einer Stelle gepflegt werden.
function createPriceLineChart(canvas, labels, values) {
  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ data: values, borderColor: '#111111', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y, state.displayCurrency) } },
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 6, color: '#9a9a96', font: { family: 'ui-monospace', size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#9a9a96', font: { family: 'ui-monospace', size: 10 }, callback: (v) => formatCompactCurrency(v, state.displayCurrency) }, grid: { color: '#ececea' } },
      },
    },
  });
}

function renderModalChart(points, range) {
  const canvas = document.getElementById('modal-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const assetCcy = (currentModalAsset && findAsset(currentModalAsset.type, currentModalAsset.id)?.currency) || 'USD';
  const labels = points.map((p) => formatChartLabel(p.t, range));
  const values = points.map((p) => convertAmount(p.price, assetCcy, state.displayCurrency));

  if (modalChart) modalChart.destroy();
  modalChart = createPriceLineChart(canvas, labels, values);
}

function initModal() {
  document.querySelectorAll('[data-close="modal"]').forEach((el) => el.addEventListener('click', closeModal));
  document.getElementById('range-pills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn || !currentModalAsset) return;
    document.querySelectorAll('#range-pills .pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    currentModalRange = btn.dataset.range;
    loadModalChart(currentModalAsset.type, currentModalAsset.id, currentModalRange);
  });
  document.getElementById('modal-watchlist-btn')?.addEventListener('click', () => {
    if (!currentModalAsset) return;
    toggleWatchlist(currentModalAsset.type, currentModalAsset.id);
    updateModalWatchlistButton();
  });
}

/* ===================================================================
   PREIS-ALARME (Notification API)
   =================================================================== */

function loadAlerts() {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAlerts() {
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch (err) {
    console.error('Alarme konnten nicht gespeichert werden:', err);
  }
}

function initAlertForm() {
  document.getElementById('alert-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentModalAsset) return;
    const threshold = parseFloat(document.getElementById('alert-threshold').value);
    const direction = document.getElementById('alert-direction').value;
    const statusEl = document.getElementById('alert-status');
    if (!(threshold > 0)) { alert('Bitte einen gültigen Schwellenwert eingeben.'); return; }

    if (!('Notification' in window)) {
      statusEl.textContent = 'Dein Browser unterstützt keine Benachrichtigungen.';
      statusEl.classList.remove('hidden');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      statusEl.textContent = 'Benachrichtigungen sind blockiert — bitte in den Browser-Einstellungen erlauben.';
      statusEl.classList.remove('hidden');
      return;
    }
    statusEl.classList.add('hidden');

    const asset = findAsset(currentModalAsset.type, currentModalAsset.id);
    const assetCcy = asset ? asset.currency : 'USD';
    alerts.push({
      id: genId(),
      assetType: currentModalAsset.type,
      assetId: currentModalAsset.id,
      assetLabel: asset ? `${asset.name} (${asset.symbol})` : currentModalAsset.id,
      threshold: convertAmount(threshold, state.displayCurrency, assetCcy),
      currency: assetCcy,
      direction,
      createdAt: Date.now(),
      triggeredAt: null,
    });
    saveAlerts();
    document.getElementById('alert-form').reset();
    renderModalAlerts();
  });
}

function renderModalAlerts() {
  const list = document.getElementById('modal-alert-list');
  if (!list || !currentModalAsset) return;
  const relevant = alerts.filter((a) => a.assetType === currentModalAsset.type && a.assetId === currentModalAsset.id);
  if (!relevant.length) { list.innerHTML = '<li class="alert-list-empty mono-tag">Keine Alarme für dieses Asset.</li>'; return; }
  list.innerHTML = relevant.map((a) => `
    <li class="${a.triggeredAt ? 'triggered' : ''}">
      <span class="alert-text">${a.direction === 'above' ? 'Über' : 'Unter'} ${formatCurrency(a.threshold, a.currency)}${a.triggeredAt ? ' · ausgelöst' : ''}</span>
      <button type="button" class="row-btn" data-action="delete-alert" data-id="${escapeHtml(a.id)}">Löschen</button>
    </li>
  `).join('');
  list.querySelectorAll('[data-action="delete-alert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      alerts = alerts.filter((a) => a.id !== btn.dataset.id);
      saveAlerts();
      renderModalAlerts();
    });
  });
}

function checkPriceAlerts() {
  let changed = false;
  alerts.forEach((a) => {
    if (a.triggeredAt) return;
    const asset = findAsset(a.assetType, a.assetId);
    if (!asset || asset.price == null) return;
    const hit = a.direction === 'above' ? asset.price >= a.threshold : asset.price <= a.threshold;
    if (!hit) return;
    a.triggeredAt = Date.now();
    changed = true;
    notifyPriceAlert(a, asset);
  });
  if (changed) saveAlerts();
  if (currentModalAsset) renderModalAlerts();
}

function notifyPriceAlert(alertEntry, asset) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const dirLabel = alertEntry.direction === 'above' ? 'über' : 'unter';
  try {
    new Notification(`Preis-Alarm: ${alertEntry.assetLabel}`, {
      body: `${asset.symbol} liegt jetzt ${dirLabel} ${formatCurrency(alertEntry.threshold, alertEntry.currency)} (aktuell ${formatCurrency(asset.price, asset.currency)}).`,
    });
  } catch (err) {
    console.error('Notification konnte nicht angezeigt werden:', err);
  }
}

/* ===================================================================
   PORTFOLIO — Speicherung (localStorage, Migration von v1)
   =================================================================== */

function loadHoldings() {
  try {
    const raw = localStorage.getItem(HOLDINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    const legacyRaw = localStorage.getItem(LEGACY_HOLDINGS_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (Array.isArray(legacy)) {
        const migrated = legacy.map((h) => ({
          id: h.id, assetType: 'crypto', assetId: h.coinId, amount: h.amount,
          buyPrice: h.buyPrice ?? null, buyPriceCurrency: 'EUR', buyDate: h.buyDate ?? null,
        }));
        localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

function saveHoldings() {
  try {
    localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(holdings));
  } catch (err) {
    console.error('Portfolio konnte nicht gespeichert werden:', err);
  }
}

/* ===================================================================
   PORTFOLIO — Asset-Combobox (Krypto + ETF)
   =================================================================== */

function renderCoinSuggestions(query) {
  const list = document.getElementById('coin-suggestions');
  if (!list) return;
  const q = query.trim().toLowerCase();
  if (!q) { list.classList.add('hidden'); list.innerHTML = ''; return; }

  const matches = getAllAssets()
    .filter((a) => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) { list.classList.add('hidden'); list.innerHTML = ''; return; }

  list.innerHTML = matches.map((a) => `
    <li data-type="${a.type}" data-id="${escapeHtml(a.id)}">
      ${assetIconHtml(a, 'xs')}
      <span>${escapeHtml(a.name)}</span>
      <span class="mono-tag">${escapeHtml(a.symbol)} · ${a.type === 'crypto' ? 'Krypto' : 'ETF'}</span>
    </li>
  `).join('');
  list.classList.remove('hidden');
}

function initCoinCombobox() {
  const searchInput = document.getElementById('holding-coin-search');
  const list = document.getElementById('coin-suggestions');
  const hiddenId = document.getElementById('holding-coin-id');
  const hiddenType = document.getElementById('holding-asset-type');
  if (!searchInput || !list || !hiddenId || !hiddenType) return;

  searchInput.addEventListener('input', () => {
    hiddenId.value = '';
    hiddenType.value = '';
    renderCoinSuggestions(searchInput.value);
  });
  searchInput.addEventListener('focus', () => renderCoinSuggestions(searchInput.value));

  document.addEventListener('click', (e) => {
    if (!document.getElementById('coin-combobox').contains(e.target)) list.classList.add('hidden');
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const asset = findAsset(li.dataset.type, li.dataset.id);
    if (!asset) return;
    hiddenId.value = asset.id;
    hiddenType.value = asset.type;
    searchInput.value = `${asset.name} (${asset.symbol})`;
    list.classList.add('hidden');
  });
}

/* ===================================================================
   PORTFOLIO — Formular (Hinzufügen / Bearbeiten / Löschen)
   =================================================================== */

function resetHoldingForm() {
  document.getElementById('holding-form')?.reset();
  document.getElementById('holding-editing-id').value = '';
  document.getElementById('holding-coin-id').value = '';
  document.getElementById('holding-asset-type').value = '';
  document.getElementById('holding-submit-btn').textContent = 'Hinzufügen';
  document.getElementById('holding-cancel-btn').classList.add('hidden');
  document.getElementById('coin-suggestions')?.classList.add('hidden');
}

function startEditHolding(id) {
  const h = holdings.find((x) => x.id === id);
  if (!h) return;
  const asset = findAsset(h.assetType, h.assetId);
  document.getElementById('holding-editing-id').value = h.id;
  document.getElementById('holding-coin-id').value = h.assetId;
  document.getElementById('holding-asset-type').value = h.assetType;
  document.getElementById('holding-coin-search').value = asset ? `${asset.name} (${asset.symbol})` : h.assetId;
  document.getElementById('holding-amount').value = h.amount;
  document.getElementById('holding-buy-price').value = h.buyPrice != null
    ? round2(convertAmount(h.buyPrice, h.buyPriceCurrency || 'EUR', state.displayCurrency))
    : '';
  document.getElementById('holding-buy-date').value = h.buyDate ?? '';
  document.getElementById('holding-submit-btn').textContent = 'Aktualisieren';
  document.getElementById('holding-cancel-btn').classList.remove('hidden');
  document.getElementById('holding-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteHolding(id) {
  if (!confirm('Diesen Holding-Eintrag wirklich löschen?')) return;
  holdings = holdings.filter((h) => h.id !== id);
  saveHoldings();
  renderPortfolio();
  renderCorrelationMatrix();
  renderWhatIf();
}

function initHoldingForm() {
  document.getElementById('holding-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const assetId = document.getElementById('holding-coin-id').value;
    const assetType = document.getElementById('holding-asset-type').value;
    const amount = parseFloat(document.getElementById('holding-amount').value);
    const buyPriceRaw = document.getElementById('holding-buy-price').value;
    const buyDateRaw = document.getElementById('holding-buy-date').value;
    const editingId = document.getElementById('holding-editing-id').value;

    if (!assetId || !assetType || !findAsset(assetType, assetId)) {
      alert('Bitte ein gültiges Asset aus der Vorschlagsliste auswählen.');
      return;
    }
    if (!(amount > 0)) {
      alert('Bitte eine gültige Menge größer als 0 eingeben.');
      return;
    }

    const holding = {
      id: editingId || genId(),
      assetType,
      assetId,
      amount,
      buyPrice: buyPriceRaw !== '' ? parseFloat(buyPriceRaw) : null,
      buyPriceCurrency: state.displayCurrency,
      buyDate: buyDateRaw || null,
    };

    if (editingId) holdings = holdings.map((h) => (h.id === editingId ? holding : h));
    else holdings.push(holding);

    saveHoldings();
    resetHoldingForm();
    renderPortfolio();
    renderCorrelationMatrix();
    renderWhatIf();
  });

  document.getElementById('holding-cancel-btn')?.addEventListener('click', resetHoldingForm);
}

/* ===================================================================
   PORTFOLIO — Berechnung & Rendering
   =================================================================== */

function computePortfolioRows() {
  return holdings.map((h) => {
    const asset = findAsset(h.assetType, h.assetId);
    const price = asset ? asset.price : null;
    const assetCcy = asset ? asset.currency : 'USD';
    const value = price != null ? convertAmount(price * h.amount, assetCcy, state.displayCurrency) : null;
    const dayChangeAbs = (asset && asset.changeAbs != null) ? convertAmount(asset.changeAbs * h.amount, assetCcy, state.displayCurrency) : null;
    const buyPriceDisplay = h.buyPrice != null ? convertAmount(h.buyPrice, h.buyPriceCurrency || 'EUR', state.displayCurrency) : null;
    const costBasis = buyPriceDisplay != null ? buyPriceDisplay * h.amount : null;
    const plAbs = (value != null && costBasis != null) ? value - costBasis : null;
    const plPct = (plAbs != null && costBasis) ? (plAbs / costBasis) * 100 : null;
    return { holding: h, asset, price, value, dayChangeAbs, costBasis, plAbs, plPct, buyPriceDisplay };
  });
}

function renderPortfolioSummary(rows) {
  const totalValue = rows.reduce((s, r) => s + (r.value || 0), 0);
  const totalDayChange = rows.reduce((s, r) => s + (r.dayChangeAbs || 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.costBasis || 0), 0);
  const totalPl = rows.reduce((s, r) => s + (r.plAbs != null ? r.plAbs : 0), 0);
  const hasCostBasis = rows.some((r) => r.costBasis != null);
  const prevValue = totalValue - totalDayChange;
  const dayChangePct = prevValue ? (totalDayChange / prevValue) * 100 : 0;
  const totalPlPct = totalCost ? (totalPl / totalCost) * 100 : null;

  document.getElementById('portfolio-total-value').textContent = formatCurrency(totalValue, state.displayCurrency);

  const dayChangeEl = document.getElementById('portfolio-day-change');
  dayChangeEl.textContent = rows.length ? `${totalDayChange >= 0 ? '+' : ''}${formatCurrency(totalDayChange, state.displayCurrency)}` : formatCurrency(0, state.displayCurrency);
  dayChangeEl.className = `summary-value ${rows.length ? changeClass(totalDayChange) : ''}`;

  const dayChangePctEl = document.getElementById('portfolio-day-change-pct');
  dayChangePctEl.textContent = rows.length ? formatPercent(dayChangePct) : '—';
  dayChangePctEl.className = `summary-sub ${rows.length ? changeClass(dayChangePct) : ''}`;

  const totalPlEl = document.getElementById('portfolio-total-pl');
  totalPlEl.textContent = hasCostBasis ? `${totalPl >= 0 ? '+' : ''}${formatCurrency(totalPl, state.displayCurrency)}` : '—';
  totalPlEl.className = `summary-value ${hasCostBasis ? changeClass(totalPl) : ''}`;

  const totalPlPctEl = document.getElementById('portfolio-total-pl-pct');
  totalPlPctEl.textContent = totalPlPct != null ? formatPercent(totalPlPct) : '—';
  totalPlPctEl.className = `summary-sub ${totalPlPct != null ? changeClass(totalPlPct) : ''}`;

  const ts = Math.max(state.coinsLoadedAt, state.etfsLoadedAt) || 0;
  if (ts) updateLastUpdated('portfolio', ts);
  return totalValue;
}

function renderHoldingsTable(rows) {
  const tbody = document.getElementById('holdings-tbody');
  const statusEl = document.getElementById('holdings-status');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '';
    statusEl.textContent = 'Noch keine Holdings hinzugefügt.';
    return;
  }
  statusEl.textContent = '';

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>
        <div class="coin-name-cell">
          ${r.asset ? assetIconHtml(r.asset, 'sm') : ''}
          <span class="coin-name-text">${escapeHtml(r.asset ? r.asset.name : r.holding.assetId)}</span>
          ${r.asset ? `<span class="coin-symbol">${escapeHtml(r.asset.symbol)}</span>` : ''}
        </div>
      </td>
      <td class="mono">${formatAmount(r.holding.amount)}</td>
      <td class="mono">${r.price != null ? formatCurrency(r.price, r.asset.currency) : '—'}</td>
      <td class="mono">${r.value != null ? formatCurrency(r.value, state.displayCurrency) : '—'}</td>
      <td class="mono">${r.buyPriceDisplay != null ? formatCurrency(r.buyPriceDisplay, state.displayCurrency) : '—'}</td>
      <td class="mono ${r.plAbs != null ? changeClass(r.plAbs) : ''}">${r.plAbs != null ? `${r.plAbs >= 0 ? '+' : ''}${formatCurrency(r.plAbs, state.displayCurrency)} (${formatPercent(r.plPct)})` : '—'}</td>
      <td class="row-actions">
        <button class="row-btn" type="button" data-action="edit" data-id="${escapeHtml(r.holding.id)}">Bearbeiten</button>
        <button class="row-btn" type="button" data-action="delete" data-id="${escapeHtml(r.holding.id)}">Löschen</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="edit"]').forEach((btn) => btn.addEventListener('click', () => startEditHolding(btn.dataset.id)));
  tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => btn.addEventListener('click', () => deleteHolding(btn.dataset.id)));
}

function renderDonut(rows) {
  const canvas = document.getElementById('portfolio-donut');
  const legend = document.getElementById('donut-legend');
  if (!canvas || !legend) return;

  const byAsset = new Map();
  rows.forEach((r) => {
    if (r.value == null) return;
    const key = `${r.holding.assetType}:${r.holding.assetId}`;
    const existing = byAsset.get(key) || { label: r.asset ? r.asset.symbol : r.holding.assetId, value: 0 };
    existing.value += r.value;
    byAsset.set(key, existing);
  });
  const entries = [...byAsset.values()].sort((a, b) => b.value - a.value);

  if (!entries.length) {
    if (donutChart) { donutChart.destroy(); donutChart = null; }
    legend.innerHTML = '<li class="donut-legend-empty">Noch keine Daten.</li>';
    return;
  }

  const total = entries.reduce((s, e) => s + e.value, 0);
  const grayCount = Math.max(entries.length - 1, 1);
  const colors = entries.map((_, i) => {
    if (i === 0) return '#0a7d3d';
    const t = grayCount <= 1 ? 0 : (i - 1) / (grayCount - 1);
    const lightness = Math.round(30 + t * 48);
    return `hsl(0, 0%, ${lightness}%)`;
  });

  if (typeof Chart !== 'undefined') {
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: entries.map((e) => e.label),
        datasets: [{ data: entries.map((e) => e.value), backgroundColor: colors, borderColor: '#fbfbfa', borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed, state.displayCurrency)}` } },
        },
      },
    });
  }

  legend.innerHTML = entries.map((e, i) => `
    <li>
      <span class="legend-swatch" style="background:${colors[i]}"></span>
      <span class="legend-label">${escapeHtml(e.label)}</span>
      <span class="legend-value mono">${((e.value / total) * 100).toFixed(1).replace('.', ',')} %</span>
    </li>
  `).join('');
}

function renderPortfolio() {
  const rows = computePortfolioRows();
  const totalValue = renderPortfolioSummary(rows);
  renderHoldingsTable(rows);
  renderDonut(rows);
  const hasPricedRow = rows.some((r) => r.value != null);
  maybeSnapshotPortfolio(totalValue, hasPricedRow);
  renderPortfolioHistoryChart();
  refreshWhatIfIfNeeded();
  refreshCorrelationIfNeeded();
}

// Baut Was-wäre-wenn-Slider und Korrelationsmatrix neu auf, falls sie beim letzten Versuch
// leer geblieben sind (z.B. weil Markt-/ETF-Daten damals noch nicht geladen waren), statt
// dauerhaft leer zu bleiben, bis der Nutzer manuell den Tab wechselt oder eine Holding ändert.
function refreshWhatIfIfNeeded() {
  const container = document.getElementById('whatif-sliders');
  if (!container) return;
  const assets = getUniquePortfolioAssets();
  if (assets.length && !container.children.length) {
    renderWhatIf();
  } else {
    updateWhatIfSummary();
  }
}

function refreshCorrelationIfNeeded() {
  const panel = document.getElementById('tab-portfolio');
  const tableEl = document.getElementById('corr-table');
  if (!panel || !tableEl || !panel.classList.contains('active')) return;
  const assets = getUniquePortfolioAssets();
  const hasRenderedRows = tableEl.querySelector('tbody tr');
  if (assets.length >= 2 && !hasRenderedRows) renderCorrelationMatrix();
}

/* ===================================================================
   PORTFOLIO-VERLAUF — tägliche Snapshots + Chart
   =================================================================== */

const HISTORY_EMPTY_DEFAULT = 'Noch nicht genug Daten – komm morgen wieder.';
const HISTORY_EMPTY_RANGE = 'Noch nicht genug Daten in diesem Zeitraum.';

let portfolioHistory = loadPortfolioHistory();
let portfolioHistoryRange = '30';
let portfolioHistoryChart = null;

function loadPortfolioHistory() {
  try {
    const raw = localStorage.getItem(PORTFOLIO_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePortfolioHistory() {
  try {
    localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(portfolioHistory));
  } catch (err) {
    console.error('Portfolio-Verlauf konnte nicht gespeichert werden:', err);
  }
}

function maybeSnapshotPortfolio(totalValueDisplay, hasPricedRow) {
  if (totalValueDisplay == null || !holdings.length || !hasPricedRow) return;
  const valueUsd = convertAmount(totalValueDisplay, state.displayCurrency, 'USD');
  if (valueUsd == null) return;
  const today = new Date().toISOString().slice(0, 10);
  const last = portfolioHistory[portfolioHistory.length - 1];
  if (last && last.date === today) return;
  portfolioHistory.push({ date: today, t: Date.now(), valueUsd });
  savePortfolioHistory();
}

function getPortfolioHistoryForRange(range) {
  if (range === 'all') return portfolioHistory;
  const days = range === '7' ? 7 : 30;
  const cutoff = Date.now() - days * 86400000;
  return portfolioHistory.filter((s) => s.t >= cutoff);
}

function formatHistoryDate(dateStr) {
  return formatChartLabel(`${dateStr}T00:00:00Z`, '30');
}

function showHistoryEmptyState(message) {
  document.getElementById('portfolio-history-chart-wrap')?.classList.add('hidden');
  document.getElementById('portfolio-history-stats')?.classList.add('hidden');
  const emptyEl = document.getElementById('portfolio-history-empty');
  if (emptyEl) { emptyEl.textContent = message; emptyEl.classList.remove('hidden'); }
  if (portfolioHistoryChart) { portfolioHistoryChart.destroy(); portfolioHistoryChart = null; }
}

function renderPortfolioHistoryChart() {
  const wrap = document.getElementById('portfolio-history-chart-wrap');
  if (!wrap) return;

  if (portfolioHistory.length < 2) {
    showHistoryEmptyState(HISTORY_EMPTY_DEFAULT);
    return;
  }

  const points = getPortfolioHistoryForRange(portfolioHistoryRange);
  if (points.length < 2) {
    showHistoryEmptyState(HISTORY_EMPTY_RANGE);
    return;
  }

  document.getElementById('portfolio-history-empty')?.classList.add('hidden');
  wrap.classList.remove('hidden');
  document.getElementById('portfolio-history-stats')?.classList.remove('hidden');

  const toDisplay = (usd) => convertAmount(usd, 'USD', state.displayCurrency);
  const first = toDisplay(points[0].valueUsd);
  const last = toDisplay(points[points.length - 1].valueUsd);
  const perfAbs = last - first;
  const perfPct = first ? (perfAbs / first) * 100 : 0;

  let bestDay = null;
  let worstDay = null;
  for (let i = 1; i < points.length; i++) {
    const prevV = toDisplay(points[i - 1].valueUsd);
    const curV = toDisplay(points[i].valueUsd);
    if (!prevV) continue;
    const dayPct = ((curV - prevV) / prevV) * 100;
    if (!bestDay || dayPct > bestDay.pct) bestDay = { pct: dayPct, date: points[i].date };
    if (!worstDay || dayPct < worstDay.pct) worstDay = { pct: dayPct, date: points[i].date };
  }

  const perfAbsEl = document.getElementById('portfolio-history-perf-abs');
  perfAbsEl.textContent = `${perfAbs >= 0 ? '+' : ''}${formatCurrency(perfAbs, state.displayCurrency)}`;
  perfAbsEl.className = `summary-value ${changeClass(perfAbs)}`;
  const perfPctEl = document.getElementById('portfolio-history-perf-pct');
  perfPctEl.textContent = formatPercent(perfPct);
  perfPctEl.className = `summary-sub ${changeClass(perfPct)}`;
  document.getElementById('portfolio-history-best').textContent = bestDay ? `${formatPercent(bestDay.pct)} (${formatHistoryDate(bestDay.date)})` : '—';
  document.getElementById('portfolio-history-worst').textContent = worstDay ? `${formatPercent(worstDay.pct)} (${formatHistoryDate(worstDay.date)})` : '—';

  const canvas = document.getElementById('portfolio-history-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const labels = points.map((p) => formatHistoryDate(p.date));
  const values = points.map((p) => toDisplay(p.valueUsd));
  if (portfolioHistoryChart) portfolioHistoryChart.destroy();
  portfolioHistoryChart = createPriceLineChart(canvas, labels, values);
}

function initPortfolioHistoryControls() {
  document.getElementById('portfolio-history-pills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn) return;
    portfolioHistoryRange = btn.dataset.range;
    document.querySelectorAll('#portfolio-history-pills .pill').forEach((p) => p.classList.toggle('active', p === btn));
    renderPortfolioHistoryChart();
  });
}

/* ===================================================================
   KORRELATIONS-MATRIX (30 Tage, Tages-Returns)
   =================================================================== */

function toDailyCloseMap(points) {
  const map = new Map();
  points.forEach((p) => {
    const d = new Date(p.t).toISOString().slice(0, 10);
    map.set(d, p.price);
  });
  return map;
}

function dailyReturnsFromCloseMap(dailyMap) {
  const dates = [...dailyMap.keys()].sort();
  const returns = new Map();
  for (let i = 1; i < dates.length; i++) {
    const prev = dailyMap.get(dates[i - 1]);
    const cur = dailyMap.get(dates[i]);
    if (prev) returns.set(dates[i], (cur - prev) / prev);
  }
  return returns;
}

function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den ? num / den : null;
}

function getUniquePortfolioAssets() {
  const seen = new Map();
  holdings.forEach((h) => {
    const key = `${h.assetType}:${h.assetId}`;
    if (!seen.has(key)) {
      const asset = findAsset(h.assetType, h.assetId);
      if (asset) seen.set(key, asset);
    }
  });
  return [...seen.values()];
}

async function renderCorrelationMatrix() {
  const statusEl = document.getElementById('correlation-status');
  const tableEl = document.getElementById('corr-table');
  const hintEl = document.getElementById('corr-hint');
  if (!tableEl) return;

  const assets = getUniquePortfolioAssets();
  if (assets.length < 2) {
    tableEl.classList.add('hidden');
    hintEl.classList.add('hidden');
    statusEl.textContent = 'Mindestens 2 Positionen nötig.';
    statusEl.classList.remove('hidden');
    return;
  }

  statusEl.textContent = 'Lade Korrelationsdaten …';
  statusEl.classList.remove('hidden');
  tableEl.classList.add('hidden');
  hintEl.classList.add('hidden');

  const returnsByKey = new Map();
  await Promise.all(assets.map(async (a) => {
    const key = `${a.type}:${a.id}`;
    try {
      const points = await getOrFetchAssetSeries(a.type, a.id, '30');
      returnsByKey.set(key, dailyReturnsFromCloseMap(toDailyCloseMap(points)));
    } catch (err) {
      console.warn(`Korrelationsdaten für ${key} nicht verfügbar:`, err);
    }
  }));

  const usable = assets.filter((a) => returnsByKey.has(`${a.type}:${a.id}`));
  if (usable.length < 2) {
    statusEl.textContent = 'Korrelationsdaten momentan nicht verfügbar.';
    return;
  }
  statusEl.classList.add('hidden');

  const keys = usable.map((a) => `${a.type}:${a.id}`);
  const matrix = keys.map((keyA) => keys.map((keyB) => {
    if (keyA === keyB) return 1;
    const a = returnsByKey.get(keyA);
    const b = returnsByKey.get(keyB);
    const sharedDates = [...a.keys()].filter((d) => b.has(d));
    if (sharedDates.length < 5) return null;
    return pearsonCorrelation(sharedDates.map((d) => a.get(d)), sharedDates.map((d) => b.get(d)));
  }));

  function corrCellStyle(corr) {
    if (corr == null) return '';
    const lightness = Math.round(100 - Math.max(0, corr) * 55);
    const textColor = lightness < 55 ? '#fbfbfa' : '#111111';
    return `background:hsl(0,0%,${lightness}%);color:${textColor};`;
  }

  let html = '<thead><tr><th></th>';
  usable.forEach((a) => { html += `<th>${escapeHtml(a.symbol)}</th>`; });
  html += '</tr></thead><tbody>';
  usable.forEach((rowAsset, i) => {
    html += `<tr><th>${escapeHtml(rowAsset.symbol)}</th>`;
    usable.forEach((_, j) => {
      const corr = matrix[i][j];
      html += `<td style="${corrCellStyle(corr)}">${corr != null ? corr.toFixed(2) : '—'}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody>';
  tableEl.innerHTML = html;
  tableEl.classList.remove('hidden');

  let sum = 0;
  let count = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix.length; j++) {
      if (i === j || matrix[i][j] == null) continue;
      sum += matrix[i][j];
      count++;
    }
  }
  const avg = count ? sum / count : 0;
  if (count && avg > 0.6) {
    hintEl.textContent = 'Deine Positionen bewegen sich oft gleich – wenig Diversifikation.';
    hintEl.classList.remove('hidden');
  } else {
    hintEl.classList.add('hidden');
  }
}

/* ===================================================================
   WAS-WAERE-WENN-RECHNER
   =================================================================== */

function computeWhatIfRows() {
  return holdings.map((h) => {
    const asset = findAsset(h.assetType, h.assetId);
    if (!asset || asset.price == null) return { holding: h, value: null };
    const key = `${h.assetType}:${h.assetId}`;
    const pct = state.whatIf.get(key) || 0;
    const simPrice = asset.price * (1 + pct / 100);
    const value = convertAmount(simPrice * h.amount, asset.currency, state.displayCurrency);
    return { holding: h, value };
  });
}

function renderWhatIf() {
  const container = document.getElementById('whatif-sliders');
  const statusEl = document.getElementById('whatif-status');
  if (!container) return;

  const assets = getUniquePortfolioAssets();
  if (!assets.length) {
    container.innerHTML = '';
    statusEl.textContent = 'Noch keine Holdings zum Simulieren.';
    statusEl.classList.remove('hidden');
    updateWhatIfSummary();
    return;
  }
  statusEl.classList.add('hidden');

  container.innerHTML = assets.map((a) => {
    const key = `${a.type}:${a.id}`;
    const pct = state.whatIf.get(key) || 0;
    return `
      <div class="whatif-row" data-key="${escapeHtml(key)}">
        <span class="whatif-label">${escapeHtml(a.name)} (${escapeHtml(a.symbol)})</span>
        <input type="range" class="whatif-slider" min="-50" max="100" step="1" value="${pct}">
        <span class="whatif-pct">${pct >= 0 ? '+' : ''}${pct} %</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.whatif-row').forEach((row) => {
    const key = row.dataset.key;
    const slider = row.querySelector('.whatif-slider');
    const pctLabel = row.querySelector('.whatif-pct');
    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      state.whatIf.set(key, val);
      pctLabel.textContent = `${val >= 0 ? '+' : ''}${val} %`;
      updateWhatIfSummary();
    });
  });

  updateWhatIfSummary();
}

function updateWhatIfSummary() {
  const valueEl = document.getElementById('whatif-total-value');
  const changeEl = document.getElementById('whatif-total-change');
  if (!valueEl) return;

  const simRows = computeWhatIfRows();
  const simTotal = simRows.reduce((s, r) => s + (r.value || 0), 0);
  const realRows = computePortfolioRows();
  const realTotal = realRows.reduce((s, r) => s + (r.value || 0), 0);

  valueEl.textContent = formatCurrency(simTotal, state.displayCurrency);
  const diff = simTotal - realTotal;
  const diffPct = realTotal ? (diff / realTotal) * 100 : 0;
  changeEl.textContent = `${diff >= 0 ? '+' : ''}${formatCurrency(diff, state.displayCurrency)} (${formatPercent(diffPct)}) ggü. echtem Wert`;
  changeEl.className = `summary-sub ${changeClass(diff)}`;
}

function initWhatIf() {
  document.getElementById('whatif-reset-btn')?.addEventListener('click', () => {
    state.whatIf.clear();
    renderWhatIf();
  });
}

/* ===================================================================
   SHARE-ANSICHT (anonymisierter PNG-Export der Performance)
   =================================================================== */

const HISTORY_RANGE_LABELS = { 7: 'Letzte 7 Tage', 30: 'Letzte 30 Tage', all: 'Gesamter Zeitraum' };

function computeShareData() {
  const rows = computePortfolioRows();
  const totalValue = rows.reduce((s, r) => s + (r.value || 0), 0);
  const cryptoValue = rows.filter((r) => r.holding.assetType === 'crypto').reduce((s, r) => s + (r.value || 0), 0);
  const etfValue = rows.filter((r) => r.holding.assetType === 'etf').reduce((s, r) => s + (r.value || 0), 0);
  const cryptoPct = totalValue ? (cryptoValue / totalValue) * 100 : 0;
  const etfPct = totalValue ? (etfValue / totalValue) * 100 : 0;

  const histPoints = getPortfolioHistoryForRange(portfolioHistoryRange);
  let perfPct = null;
  if (histPoints.length >= 2) {
    const first = convertAmount(histPoints[0].valueUsd, 'USD', state.displayCurrency);
    const last = convertAmount(histPoints[histPoints.length - 1].valueUsd, 'USD', state.displayCurrency);
    perfPct = first ? ((last - first) / first) * 100 : 0;
  }

  return {
    perfPct,
    periodLabel: HISTORY_RANGE_LABELS[portfolioHistoryRange] || 'Zeitraum',
    cryptoPct,
    etfPct,
    hasPositions: totalValue > 0,
  };
}

function populateShareCard(data) {
  document.getElementById('share-perf-value').textContent = data.perfPct != null ? formatPercent(data.perfPct) : '—';
  document.getElementById('share-perf-value').className = `share-perf-value ${changeClass(data.perfPct)}`;
  document.getElementById('share-period').textContent = data.perfPct != null ? `Performance · ${data.periodLabel}` : 'Noch keine Verlaufsdaten';

  const barEl = document.getElementById('share-allocation-bar');
  const legendEl = document.getElementById('share-allocation-legend');
  if (!data.hasPositions) {
    barEl.innerHTML = '';
    legendEl.innerHTML = '<span>Keine Positionen</span>';
    return;
  }
  barEl.innerHTML = `
    <div class="seg-crypto" style="width:${data.cryptoPct}%"></div>
    <div class="seg-etf" style="width:${data.etfPct}%"></div>
  `;
  legendEl.innerHTML = `
    <span><span class="legend-swatch" style="display:inline-block;width:9px;height:9px;background:var(--fg)"></span>Krypto ${data.cryptoPct.toFixed(0)}%</span>
    <span><span class="legend-swatch" style="display:inline-block;width:9px;height:9px;background:var(--gray-200)"></span>ETF ${data.etfPct.toFixed(0)}%</span>
  `;
}

async function sharePerformanceImage() {
  if (typeof html2canvas === 'undefined') {
    alert('Bild-Export ist momentan nicht verfügbar.');
    return;
  }
  const data = computeShareData();
  if (!data.hasPositions) {
    alert('Noch keine Holdings für einen Performance-Export vorhanden.');
    return;
  }
  populateShareCard(data);
  const card = document.getElementById('share-card');
  try {
    const canvas = await html2canvas(card, { backgroundColor: '#fbfbfa', scale: 2 });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfolio-performance-${dateStamp()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  } catch (err) {
    console.error('Bild-Export fehlgeschlagen:', err);
    alert('Bild-Export fehlgeschlagen.');
  }
}

function initShareButton() {
  document.getElementById('share-performance-btn')?.addEventListener('click', sharePerformanceImage);
}

/* ===================================================================
   PORTFOLIO — Export / Import (JSON + CSV, inkl. Verlauf)
   =================================================================== */

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function dateStamp() { return new Date().toISOString().slice(0, 10); }

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') { inQuotes = false; } else { cur += ch; }
    } else if (ch === '"') { inQuotes = true; } else if (ch === ',') { out.push(cur); cur = ''; } else { cur += ch; }
  }
  out.push(cur);
  return out;
}

function exportHoldingsJson() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    holdings,
    watchlist: [...state.watchlist],
    alerts,
    portfolioHistory,
  };
  downloadBlob(JSON.stringify(payload, null, 2), `portfolio-export-${dateStamp()}.json`, 'application/json');
}

function exportHoldingsCsv() {
  const header = 'assetType,assetId,amount,buyPrice,buyPriceCurrency,buyDate';
  const lines = holdings.map((h) => [h.assetType, h.assetId, h.amount, h.buyPrice ?? '', h.buyPriceCurrency || '', h.buyDate ?? ''].map(csvEscape).join(','));
  downloadBlob([header, ...lines].join('\n'), `portfolio-export-${dateStamp()}.csv`, 'text/csv');
}

function parseCsvHoldings(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = cols[i]; });
    return {
      id: genId(),
      assetType: row.assetType === 'etf' ? 'etf' : 'crypto',
      assetId: row.assetId,
      amount: parseFloat(row.amount),
      buyPrice: row.buyPrice ? parseFloat(row.buyPrice) : null,
      buyPriceCurrency: row.buyPriceCurrency || 'EUR',
      buyDate: row.buyDate || null,
    };
  }).filter((h) => h.assetId && h.amount > 0);
}

function initExportImport() {
  document.getElementById('export-json-btn')?.addEventListener('click', exportHoldingsJson);
  document.getElementById('export-csv-btn')?.addEventListener('click', exportHoldingsCsv);

  const fileInput = document.getElementById('import-file-input');
  document.getElementById('import-btn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      let imported = [];
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        const rawHoldings = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.holdings) ? parsed.holdings : []);
        imported = rawHoldings.map((h) => ({
          id: genId(),
          assetType: h.assetType === 'etf' ? 'etf' : 'crypto',
          assetId: h.assetId || h.coinId,
          amount: parseFloat(h.amount),
          buyPrice: h.buyPrice != null ? parseFloat(h.buyPrice) : null,
          buyPriceCurrency: h.buyPriceCurrency || 'EUR',
          buyDate: h.buyDate || null,
        })).filter((h) => h.assetId && h.amount > 0);

        if (Array.isArray(parsed.watchlist)) {
          parsed.watchlist.forEach((k) => state.watchlist.add(k));
          saveWatchlist();
        }
        if (Array.isArray(parsed.alerts)) {
          alerts = alerts.concat(parsed.alerts);
          saveAlerts();
        }
        if (Array.isArray(parsed.portfolioHistory)) {
          const existingDates = new Set(portfolioHistory.map((s) => s.date));
          const merged = portfolioHistory.concat(parsed.portfolioHistory.filter((s) => s && s.date && !existingDates.has(s.date)));
          merged.sort((a, b) => a.t - b.t);
          portfolioHistory = merged;
          savePortfolioHistory();
        }
      } else {
        imported = parseCsvHoldings(text);
      }
      if (!imported.length) {
        alert('Keine gültigen Holdings in der Datei gefunden.');
        return;
      }
      holdings = holdings.concat(imported);
      saveHoldings();
      renderPortfolio();
      renderCorrelationMatrix();
      renderWhatIf();
      alert(`${imported.length} Holding(s) importiert.`);
    } catch (err) {
      console.error('Import fehlgeschlagen:', err);
      alert('Import fehlgeschlagen — Datei konnte nicht gelesen werden.');
    } finally {
      fileInput.value = '';
    }
  });
}

/* ===================================================================
   NEWS — Fallback-Kette: CryptoCompare direkt -> CORS-Proxy -> RSS
   =================================================================== */

function normalizeCryptoCompareNews(json) {
  const data = (json && json.Data) || [];
  return data.map((item) => ({
    id: `cc-${item.id}`,
    title: item.title,
    url: item.url,
    source: (item.source_info && item.source_info.name) || item.source || 'Unbekannt',
    imageUrl: item.imageurl,
    publishedAt: item.published_on,
    categories: String(item.categories || '').split(/[|,]/).map((s) => s.trim()).filter(Boolean),
  }));
}

async function fetchNewsCryptoCompareDirect() {
  const json = await fetchWithRetry(NEWS_API_URL, { retries: 0 });
  return normalizeCryptoCompareNews(json);
}

async function fetchNewsCryptoCompareProxy() {
  const json = await fetchWithRetry(proxied(NEWS_API_URL), { retries: 1 });
  return normalizeCryptoCompareNews(json);
}

async function fetchRssFeedViaRss2Json(rssUrl) {
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
  const json = await fetchWithRetry(api, { retries: 1 });
  if (!json || json.status !== 'ok') throw new Error('RSS2JSON_ERROR');
  const feedTitle = (json.feed && json.feed.title) || rssUrl;
  return (json.items || []).map((item, i) => {
    const ts = Math.floor(new Date(item.pubDate).getTime() / 1000);
    return {
      id: `rss-${feedTitle}-${i}`,
      title: item.title,
      url: item.link,
      source: feedTitle,
      imageUrl: item.thumbnail || (item.enclosure && item.enclosure.link) || '',
      publishedAt: Number.isFinite(ts) ? ts : Math.floor(Date.now() / 1000),
      categories: Array.isArray(item.categories) ? item.categories : [],
    };
  });
}

async function fetchNewsRssFallback() {
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchRssFeedViaRss2Json));
  const items = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  if (!items.length) throw new Error('RSS_FALLBACK_EMPTY');
  return items;
}

const NEWS_SOURCES = [
  { key: 'cryptocompare', fetch: fetchNewsCryptoCompareDirect },
  { key: 'cryptocompare-proxy', fetch: fetchNewsCryptoCompareProxy },
  { key: 'rss', fetch: fetchNewsRssFallback },
];

async function fetchNewsData() {
  let lastErr = null;
  for (const source of NEWS_SOURCES) {
    try {
      const items = await source.fetch();
      if (items && items.length) {
        state.newsSource = source.key;
        return items;
      }
    } catch (err) {
      lastErr = err;
      console.warn(`News-Quelle "${source.key}" fehlgeschlagen:`, err);
    }
  }
  throw lastErr || new Error('NEWS_ALL_FAILED');
}

async function loadNews({ force = false } = {}) {
  const statusEl = document.getElementById('news-status');
  if (statusEl && !state.news.length) statusEl.textContent = 'Lade News …';
  try {
    const items = await ensureFresh(dataSources.news, { force });
    state.news = items;
    state.newsLoadedAt = dataSources.news.loadedAt;
    renderNewsFromSource();
  } catch (err) {
    console.error('Alle News-Quellen fehlgeschlagen:', err);
    if (state.news.length) renderNews();
    else {
      document.getElementById('news-list').innerHTML = '';
      if (statusEl) statusEl.textContent = 'News momentan nicht verfügbar.';
    }
  } finally {
    updateSectionStatus('news');
  }
}

function renderNewsFromSource() {
  renderNewsCategoryPills();
  renderNews();
  updateLastUpdated('news', state.newsLoadedAt);
}

function renderNewsCategoryPills() {
  const container = document.getElementById('news-category-pills');
  if (!container) return;
  const counts = new Map();
  state.news.forEach((item) => (item.categories || []).forEach((cat) => counts.set(cat, (counts.get(cat) || 0) + 1)));
  const topCats = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat]) => cat);
  if (!topCats.includes(newsCategoryFilter) && newsCategoryFilter !== 'ALL') newsCategoryFilter = 'ALL';

  container.innerHTML = ['ALL', ...topCats].map((cat) => `
    <button class="pill ${cat === newsCategoryFilter ? 'active' : ''}" type="button" data-category="${escapeHtml(cat)}">${cat === 'ALL' ? 'Alle' : escapeHtml(cat)}</button>
  `).join('');

  container.querySelectorAll('.pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      newsCategoryFilter = btn.dataset.category;
      container.querySelectorAll('.pill').forEach((p) => p.classList.toggle('active', p === btn));
      renderNews();
    });
  });
}

function formatRelativeTime(unixSeconds) {
  if (!unixSeconds) return '';
  const diffMs = Date.now() - unixSeconds * 1000;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `vor ${diffD} Tg.`;
  return new Date(unixSeconds * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderNews() {
  const list = document.getElementById('news-list');
  const statusEl = document.getElementById('news-status');
  if (!list) return;

  let items = state.news;
  if (newsCategoryFilter !== 'ALL') items = items.filter((item) => (item.categories || []).includes(newsCategoryFilter));
  items = [...items].sort((a, b) => b.publishedAt - a.publishedAt);

  if (!items.length) {
    list.innerHTML = '';
    statusEl.textContent = state.news.length ? 'Keine News in dieser Kategorie.' : 'News momentan nicht verfügbar.';
    return;
  }
  statusEl.textContent = '';

  list.innerHTML = items.map((item) => `
    <li class="news-item">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="news-link">
        <div class="news-thumb-wrap">
          <img class="news-thumb" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" onerror="this.closest('.news-thumb-wrap').style.visibility='hidden'">
        </div>
        <div class="news-body">
          <span class="news-meta">${escapeHtml(item.source)} · ${formatRelativeTime(item.publishedAt)}</span>
          <h3 class="news-title">${escapeHtml(item.title)}</h3>
        </div>
      </a>
    </li>
  `).join('');
}

/* ===================================================================
   TAB-NAVIGATION
   =================================================================== */

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  // Serien sind über getOrFetchAssetSeries TTL-gecacht, daher ist ein Neuaufbau bei jedem
  // Tab-Wechsel unkritisch und behebt zuverlässig den Fall, dass Markt-/ETF-Daten beim
  // ersten Öffnen des Portfolio-Tabs noch nicht geladen waren.
  if (tab === 'portfolio') renderCorrelationMatrix();
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

/* ===================================================================
   COMMAND-K SUCHE
   =================================================================== */

let cmdkActiveIndex = -1;
let cmdkFlatItems = [];

function isOverlayOpen(id) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
}

function openCmdk() {
  const overlay = document.getElementById('cmdk-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  const input = document.getElementById('cmdk-input');
  input.value = '';
  renderCmdkResults('');
  setTimeout(() => input.focus(), 0);
}

function closeCmdk() {
  const overlay = document.getElementById('cmdk-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

function holdingLabel(h) {
  const asset = findAsset(h.assetType, h.assetId);
  return asset ? `${asset.name} (${asset.symbol})` : h.assetId;
}

function renderCmdkResults(query) {
  const container = document.getElementById('cmdk-results');
  if (!container) return;
  const q = query.trim().toLowerCase();

  const matchAsset = (a) => !q || a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q);
  const coins = state.coins.map(coinToAsset).filter(matchAsset).slice(0, 6);
  const etfs = state.etfs.filter(matchAsset).slice(0, 6);
  const holdingMatches = holdings
    .filter((h) => !q || holdingLabel(h).toLowerCase().includes(q))
    .slice(0, 6);

  cmdkFlatItems = [];
  const groups = [
    { label: 'Coins', kind: 'asset', items: coins },
    { label: 'ETFs', kind: 'asset', items: etfs },
    { label: 'Meine Holdings', kind: 'holding', items: holdingMatches },
  ];

  let html = '';
  groups.forEach((group) => {
    if (!group.items.length) return;
    html += `<div class="cmdk-group-label">${escapeHtml(group.label)}</div>`;
    group.items.forEach((item) => {
      const index = cmdkFlatItems.length;
      if (group.kind === 'asset') {
        cmdkFlatItems.push({ kind: 'asset', type: item.type, id: item.id });
        html += `
          <div class="cmdk-item" data-index="${index}">
            ${assetIconHtml(item, 'xs')}
            <span class="coin-name-text">${escapeHtml(item.name)}</span>
            <span class="mono-tag">${escapeHtml(item.symbol)}</span>
            <span class="cmdk-item-price">${formatCurrency(item.price, item.currency)}</span>
          </div>`;
      } else {
        cmdkFlatItems.push({ kind: 'holding', holdingId: item.id });
        html += `
          <div class="cmdk-item" data-index="${index}">
            <span class="coin-name-text">${escapeHtml(holdingLabel(item))}</span>
            <span class="mono-tag">${escapeHtml(formatAmount(item.amount))}</span>
          </div>`;
      }
    });
  });

  if (!cmdkFlatItems.length) {
    html = `<div class="cmdk-empty">${q ? 'Keine Treffer.' : 'Tippe, um Coins, ETFs oder Holdings zu finden.'}</div>`;
  }
  container.innerHTML = html;
  cmdkActiveIndex = cmdkFlatItems.length ? 0 : -1;
  updateCmdkActiveItem();

  container.querySelectorAll('.cmdk-item').forEach((el) => {
    el.addEventListener('click', () => activateCmdkItem(Number(el.dataset.index)));
  });
}

function updateCmdkActiveItem() {
  const container = document.getElementById('cmdk-results');
  if (!container) return;
  container.querySelectorAll('.cmdk-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.index) === cmdkActiveIndex);
  });
  const activeEl = container.querySelector('.cmdk-item.active');
  activeEl?.scrollIntoView({ block: 'nearest' });
}

function activateCmdkItem(index) {
  const item = cmdkFlatItems[index];
  if (!item) return;
  closeCmdk();
  if (item.kind === 'asset') {
    switchTab(item.type === 'crypto' ? 'market' : 'etf');
    openAssetModal(item.type, item.id);
  } else {
    switchTab('portfolio');
    setTimeout(() => {
      const row = document.querySelector(`[data-action="edit"][data-id="${CSS.escape(item.holdingId)}"]`);
      const tr = row?.closest('tr');
      tr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (tr) {
        tr.style.background = 'var(--bg-alt)';
        setTimeout(() => { tr.style.background = ''; }, 1200);
      }
    }, 100);
  }
}

function initCmdk() {
  document.getElementById('cmdk-open-btn')?.addEventListener('click', openCmdk);
  document.querySelectorAll('[data-close="cmdk"]').forEach((el) => el.addEventListener('click', closeCmdk));

  const input = document.getElementById('cmdk-input');
  input?.addEventListener('input', () => renderCmdkResults(input.value));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cmdkFlatItems.length) cmdkActiveIndex = (cmdkActiveIndex + 1) % cmdkFlatItems.length;
      updateCmdkActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdkFlatItems.length) cmdkActiveIndex = (cmdkActiveIndex - 1 + cmdkFlatItems.length) % cmdkFlatItems.length;
      updateCmdkActiveItem();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cmdkActiveIndex >= 0) activateCmdkItem(cmdkActiveIndex);
    }
  });
}

/* ===================================================================
   KEYBOARD-SHORTCUTS
   =================================================================== */

const TAB_SHORTCUTS = { 1: 'market', 2: 'portfolio', 3: 'etf', 4: 'news' };

function isTypingContext() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function anyOverlayOpen() {
  return isOverlayOpen('cmdk-overlay') || isOverlayOpen('shortcuts-overlay') || isOverlayOpen('asset-modal');
}

function openShortcutsOverlay() {
  const overlay = document.getElementById('shortcuts-overlay');
  overlay?.classList.remove('hidden');
  overlay?.setAttribute('aria-hidden', 'false');
}

function closeShortcutsOverlay() {
  const overlay = document.getElementById('shortcuts-overlay');
  overlay?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
}

function initKeyboardShortcuts() {
  document.querySelectorAll('[data-close="shortcuts"]').forEach((el) => el.addEventListener('click', closeShortcutsOverlay));

  document.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCmdk();
      return;
    }
    if (e.key === 'Escape') {
      if (isOverlayOpen('cmdk-overlay')) closeCmdk();
      else if (isOverlayOpen('shortcuts-overlay')) closeShortcutsOverlay();
      else if (isOverlayOpen('asset-modal')) closeModal();
      return;
    }
    if (isTypingContext() || anyOverlayOpen()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (TAB_SHORTCUTS[e.key]) {
      switchTab(TAB_SHORTCUTS[e.key]);
    } else if (e.key === '?') {
      openShortcutsOverlay();
    }
  });
}

/* ===================================================================
   PWA — Service Worker, Install-Banner
   =================================================================== */

const INSTALL_DISMISSED_KEY = 'crypto_dashboard_install_dismissed_v1';
let deferredInstallPrompt = null;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker Registrierung fehlgeschlagen:', err));
  });
}

function showInstallBanner() { document.getElementById('install-banner')?.classList.remove('hidden'); }
function hideInstallBanner() { document.getElementById('install-banner')?.classList.add('hidden'); }

function initInstallBanner() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(INSTALL_DISMISSED_KEY); } catch { /* ignore */ }
    if (!dismissed) showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    hideInstallBanner();
    deferredInstallPrompt = null;
  });

  document.getElementById('install-banner-dismiss')?.addEventListener('click', () => {
    hideInstallBanner();
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, '1'); } catch { /* ignore */ }
  });

  document.getElementById('install-banner-action')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) { hideInstallBanner(); return; }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBanner();
  });
}

/* ===================================================================
   INIT
   =================================================================== */

async function init() {
  initTabs();
  initCurrencyToggle();
  initMarketControls();
  initEtfControls();
  initModal();
  initAlertForm();
  initCoinCombobox();
  initHoldingForm();
  initExportImport();
  initPortfolioHistoryControls();
  initInstallBanner();
  registerServiceWorker();
  initVisibilityHandling();
  startApiCallLogger();
  initCmdk();
  initKeyboardShortcuts();
  initWhatIf();
  initShareButton();

  updateSortPillsUI();
  updateEtfSortPillsUI();
  renderPortfolio();
  renderWhatIf();
  renderStatusDots();

  // Letzten bekannten Marktstand sofort anzeigen (falls vorhanden), damit die Seite
  // nie leer startet — die frischen Daten laden parallel und ersetzen ihn gleich darauf.
  restoreMarketSnapshot();

  // Alle Quellen parallel statt nacheinander laden: Coins erscheinen sofort, sobald
  // CoinGecko antwortet, ohne auf ETF-/News-Antworten zu warten (und umgekehrt).
  loadFxRates();
  loadFearGreed();
  loadTrending();
  loadMarketData();
  loadEtfData();
  loadNews();

  resumeAutoRefresh();
  startAutoRefresh('fx', FX_REFRESH_MS, () => loadFxRates());
  startAutoRefresh('fng', FNG_REFRESH_MS, () => loadFearGreed());
  startAutoRefresh('trending', TRENDING_REFRESH_MS, () => loadTrending());
}

document.addEventListener('DOMContentLoaded', init);
