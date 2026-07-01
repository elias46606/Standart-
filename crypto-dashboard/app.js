'use strict';

/* ===================================================================
   Konfiguration & globaler Zustand
   =================================================================== */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const NEWS_API_URL = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN';
const HOLDINGS_STORAGE_KEY = 'crypto_dashboard_portfolio_v1';

const MARKET_REFRESH_MS = 60 * 1000;
const NEWS_REFRESH_MS = 5 * 60 * 1000;

const state = {
  coins: [],              // In-Memory-Cache der /coins/markets Antwort
  coinsLoadedAt: 0,
  search: '',
  sortKey: 'market_cap',   // 'market_cap' | 'price' | 'change'
  sortDir: 'desc',         // 'asc' | 'desc'
  chartCache: {},          // Cache für /coins/{id}/market_chart Antworten
  news: [],
};

let holdings = loadHoldings();
let newsCategoryFilter = 'ALL';

let sparkCharts = new Map();
let modalChart = null;
let donutChart = null;
let currentModalCoinId = null;
let currentModalRange = '7';

/* ===================================================================
   Hilfsfunktionen: Formatierung & Escaping
   =================================================================== */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function formatCurrency(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : (abs >= 0.01 ? 4 : 6);
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
}

function formatCompactCurrency(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 2,
  }).format(value);
}

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

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/* ===================================================================
   Fetch mit Retry / Backoff (Rate-Limit-Behandlung)
   =================================================================== */

async function fetchWithRetry(url, { retries = 3, backoff = 2000 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
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
      const wait = (retryAfterHeader > 0 ? retryAfterHeader * 1000 : backoff * (2 ** attempt));
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }
    return res.json();
  }
  throw lastErr;
}

/* ===================================================================
   MARKT — Daten laden
   =================================================================== */

async function loadMarketData({ silent = false } = {}) {
  if (!silent && !state.coins.length) {
    setMarketStatus('Lade Marktdaten …');
  }
  try {
    const data = await fetchWithRetry(
      `${COINGECKO_BASE}/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=50&page=1&sparkline=true`
    );
    state.coins = Array.isArray(data) ? data : [];
    state.coinsLoadedAt = Date.now();
    hideMarketError();
    updateHeaderMeta();
    renderMarketTable();
    renderPortfolio();
  } catch (err) {
    console.error('Marktdaten konnten nicht geladen werden:', err);
    showMarketError(err);
    if (state.coins.length) renderMarketTable();
  } finally {
    if (!state.coins.length) setMarketStatus('Keine Marktdaten verfügbar.');
  }
}

function setMarketStatus(text) {
  const el = document.getElementById('market-status');
  if (el) el.textContent = text;
}

function showMarketError(err) {
  const el = document.getElementById('market-error');
  if (!el) return;
  el.textContent = (err && err.message === 'RATE_LIMIT')
    ? 'CoinGecko-Rate-Limit erreicht — zeige zuletzt geladene Daten, nächster Versuch in Kürze.'
    : 'Marktdaten konnten nicht geladen werden — zeige zuletzt geladene Daten (falls vorhanden).';
  el.classList.remove('hidden');
}

function hideMarketError() {
  document.getElementById('market-error')?.classList.add('hidden');
}

function updateHeaderMeta() {
  const el = document.getElementById('coin-count-meta');
  if (el) el.textContent = `${state.coins.length || 50} COINS · LIVE`;
}

/* ===================================================================
   MARKT — Sortieren, Filtern, Rendern (rein im Speicher, kein Reload)
   =================================================================== */

function getFilteredSortedCoins() {
  const q = state.search.trim().toLowerCase();
  let list = state.coins;
  if (q) {
    list = list.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
  }
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const key = state.sortKey;
  list = [...list].sort((a, b) => {
    let av; let bv;
    if (key === 'price') { av = a.current_price ?? -Infinity; bv = b.current_price ?? -Infinity; } else if (key === 'change') { av = a.price_change_percentage_24h ?? -Infinity; bv = b.price_change_percentage_24h ?? -Infinity; } else { av = a.market_cap ?? -Infinity; bv = b.market_cap ?? -Infinity; }
    return (av - bv) * dir;
  });
  return list;
}

function renderMarketTable() {
  const tbody = document.getElementById('market-tbody');
  if (!tbody) return;
  const coins = getFilteredSortedCoins();

  sparkCharts.forEach((chart) => chart.destroy());
  sparkCharts.clear();

  if (!coins.length) {
    tbody.innerHTML = '';
    setMarketStatus(state.coins.length ? 'Keine Treffer für deine Suche.' : 'Lade Marktdaten …');
    return;
  }
  setMarketStatus('');

  tbody.innerHTML = coins.map((c) => `
    <tr data-id="${escapeHtml(c.id)}">
      <td class="col-rank">${c.market_cap_rank ?? '—'}</td>
      <td class="col-name">
        <div class="coin-name-cell">
          <img class="coin-icon" src="${escapeHtml(c.image)}" alt="" width="24" height="24" loading="lazy">
          <span class="coin-name-text">${escapeHtml(c.name)}</span>
          <span class="coin-symbol">${escapeHtml((c.symbol || '').toUpperCase())}</span>
        </div>
      </td>
      <td class="col-price">${formatCurrency(c.current_price)}</td>
      <td class="col-change ${changeClass(c.price_change_percentage_24h)}">${formatPercent(c.price_change_percentage_24h)}</td>
      <td class="col-cap">${formatCompactCurrency(c.market_cap)}</td>
      <td class="col-spark"><canvas class="spark-canvas" id="spark-${escapeHtml(c.id)}" width="110" height="36"></canvas></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    tr.addEventListener('click', () => openCoinModal(tr.dataset.id));
  });

  coins.forEach((c) => {
    const prices = c.sparkline_in_7d && c.sparkline_in_7d.price;
    if (!prices || !prices.length) return;
    const canvas = document.getElementById(`spark-${c.id}`);
    if (!canvas || typeof Chart === 'undefined') return;
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: prices.map((_, i) => i),
        datasets: [{ data: prices, borderColor: '#111111', borderWidth: 1.25, pointRadius: 0, tension: 0.15, fill: false }],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
    sparkCharts.set(c.id, chart);
  });
}

/* ===================================================================
   MARKT — Sortier-Pills & Suche
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
}

/* ===================================================================
   MARKT — Detailansicht (Modal mit größerem Chart)
   =================================================================== */

async function openCoinModal(coinId) {
  const coin = state.coins.find((c) => c.id === coinId);
  if (!coin) return;
  currentModalCoinId = coinId;
  currentModalRange = '7';

  const icon = document.getElementById('modal-coin-icon');
  icon.src = coin.image;
  icon.alt = coin.name;
  document.getElementById('modal-coin-name').textContent = coin.name;
  document.getElementById('modal-coin-symbol').textContent = (coin.symbol || '').toUpperCase();
  document.getElementById('modal-coin-price').textContent = formatCurrency(coin.current_price);
  const changeEl = document.getElementById('modal-coin-change');
  changeEl.textContent = formatPercent(coin.price_change_percentage_24h);
  changeEl.className = `change-tag ${changeClass(coin.price_change_percentage_24h)}`;

  document.querySelectorAll('#range-pills .pill').forEach((p) => p.classList.toggle('active', p.dataset.range === '7'));

  showModal();
  await loadModalChart(coinId, '7');
}

function showModal() {
  const m = document.getElementById('coin-modal');
  m.classList.remove('hidden');
  m.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const m = document.getElementById('coin-modal');
  m.classList.add('hidden');
  m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

async function loadModalChart(coinId, range) {
  const statusEl = document.getElementById('modal-status');
  statusEl.textContent = 'Lade Chart …';
  const cacheKey = `${coinId}-${range}`;
  try {
    let points = state.chartCache[cacheKey];
    if (!points) {
      const json = await fetchWithRetry(`${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=eur&days=${range}`);
      points = (json && json.prices) || [];
      state.chartCache[cacheKey] = points;
    }
    statusEl.textContent = '';
    renderModalChart(points, range);
  } catch (err) {
    console.error('Chart konnte nicht geladen werden:', err);
    statusEl.textContent = 'Chart konnte nicht geladen werden — bitte später erneut versuchen.';
  }
}

function formatChartLabel(ts, range) {
  const d = new Date(ts);
  if (range === '7') return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  if (range === '30') return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

function renderModalChart(points, range) {
  const canvas = document.getElementById('modal-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  const labels = points.map(([ts]) => formatChartLabel(ts, range));
  const values = points.map(([, price]) => price);

  if (modalChart) modalChart.destroy();
  modalChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ data: values, borderColor: '#111111', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y) } },
      },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 6, color: '#9a9a96', font: { family: 'ui-monospace', size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#9a9a96', font: { family: 'ui-monospace', size: 10 }, callback: (v) => formatCompactCurrency(v) }, grid: { color: '#ececea' } },
      },
    },
  });
}

function initModal() {
  document.querySelectorAll('[data-close="modal"]').forEach((el) => el.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  document.getElementById('range-pills')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill');
    if (!btn || !currentModalCoinId) return;
    document.querySelectorAll('#range-pills .pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    currentModalRange = btn.dataset.range;
    loadModalChart(currentModalCoinId, currentModalRange);
  });
}

/* ===================================================================
   PORTFOLIO — Speicherung (localStorage)
   =================================================================== */

function loadHoldings() {
  try {
    const raw = localStorage.getItem(HOLDINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
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

function genId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `h_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/* ===================================================================
   PORTFOLIO — Coin-Combobox (Suche/Dropdown aus den 50 Coins)
   =================================================================== */

function renderCoinSuggestions(query) {
  const list = document.getElementById('coin-suggestions');
  if (!list) return;
  const q = query.trim().toLowerCase();
  if (!q) { list.classList.add('hidden'); list.innerHTML = ''; return; }

  const matches = state.coins
    .filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) { list.classList.add('hidden'); list.innerHTML = ''; return; }

  list.innerHTML = matches.map((c) => `
    <li data-id="${escapeHtml(c.id)}">
      <img src="${escapeHtml(c.image)}" alt="" width="18" height="18">
      <span>${escapeHtml(c.name)}</span>
      <span class="mono-tag">${escapeHtml((c.symbol || '').toUpperCase())}</span>
    </li>
  `).join('');
  list.classList.remove('hidden');
}

function initCoinCombobox() {
  const searchInput = document.getElementById('holding-coin-search');
  const list = document.getElementById('coin-suggestions');
  const hiddenId = document.getElementById('holding-coin-id');
  if (!searchInput || !list || !hiddenId) return;

  searchInput.addEventListener('input', () => {
    hiddenId.value = '';
    renderCoinSuggestions(searchInput.value);
  });
  searchInput.addEventListener('focus', () => renderCoinSuggestions(searchInput.value));

  document.addEventListener('click', (e) => {
    if (!document.getElementById('coin-combobox').contains(e.target)) {
      list.classList.add('hidden');
    }
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const coin = state.coins.find((c) => c.id === li.dataset.id);
    if (!coin) return;
    hiddenId.value = coin.id;
    searchInput.value = `${coin.name} (${(coin.symbol || '').toUpperCase()})`;
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
  document.getElementById('holding-submit-btn').textContent = 'Hinzufügen';
  document.getElementById('holding-cancel-btn').classList.add('hidden');
  document.getElementById('coin-suggestions')?.classList.add('hidden');
}

function startEditHolding(id) {
  const h = holdings.find((x) => x.id === id);
  if (!h) return;
  const coin = state.coins.find((c) => c.id === h.coinId);
  document.getElementById('holding-editing-id').value = h.id;
  document.getElementById('holding-coin-id').value = h.coinId;
  document.getElementById('holding-coin-search').value = coin ? `${coin.name} (${(coin.symbol || '').toUpperCase()})` : h.coinId;
  document.getElementById('holding-amount').value = h.amount;
  document.getElementById('holding-buy-price').value = h.buyPrice ?? '';
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
}

function initHoldingForm() {
  document.getElementById('holding-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const coinId = document.getElementById('holding-coin-id').value;
    const amount = parseFloat(document.getElementById('holding-amount').value);
    const buyPriceRaw = document.getElementById('holding-buy-price').value;
    const buyDateRaw = document.getElementById('holding-buy-date').value;
    const editingId = document.getElementById('holding-editing-id').value;

    if (!coinId || !state.coins.some((c) => c.id === coinId)) {
      alert('Bitte einen gültigen Coin aus der Vorschlagsliste auswählen.');
      return;
    }
    if (!(amount > 0)) {
      alert('Bitte eine gültige Menge größer als 0 eingeben.');
      return;
    }

    const holding = {
      id: editingId || genId(),
      coinId,
      amount,
      buyPrice: buyPriceRaw !== '' ? parseFloat(buyPriceRaw) : null,
      buyDate: buyDateRaw || null,
    };

    if (editingId) {
      holdings = holdings.map((h) => (h.id === editingId ? holding : h));
    } else {
      holdings.push(holding);
    }
    saveHoldings();
    resetHoldingForm();
    renderPortfolio();
  });

  document.getElementById('holding-cancel-btn')?.addEventListener('click', resetHoldingForm);
}

/* ===================================================================
   PORTFOLIO — Berechnung & Rendering
   =================================================================== */

function computePortfolioRows() {
  const priceMap = new Map(state.coins.map((c) => [c.id, c]));
  return holdings.map((h) => {
    const coin = priceMap.get(h.coinId);
    const price = coin ? coin.current_price : null;
    const value = price != null ? price * h.amount : null;
    const dayChangeAbs = (coin && coin.price_change_24h != null) ? coin.price_change_24h * h.amount : null;
    const costBasis = h.buyPrice != null ? h.buyPrice * h.amount : null;
    const plAbs = (value != null && costBasis != null) ? value - costBasis : null;
    const plPct = (plAbs != null && costBasis) ? (plAbs / costBasis) * 100 : null;
    return { holding: h, coin, price, value, dayChangeAbs, costBasis, plAbs, plPct };
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

  document.getElementById('portfolio-total-value').textContent = formatCurrency(totalValue);

  const dayChangeEl = document.getElementById('portfolio-day-change');
  dayChangeEl.textContent = rows.length ? `${totalDayChange >= 0 ? '+' : ''}${formatCurrency(totalDayChange)}` : formatCurrency(0);
  dayChangeEl.className = `summary-value ${rows.length ? changeClass(totalDayChange) : ''}`;

  const dayChangePctEl = document.getElementById('portfolio-day-change-pct');
  dayChangePctEl.textContent = rows.length ? formatPercent(dayChangePct) : '—';
  dayChangePctEl.className = `summary-sub ${rows.length ? changeClass(dayChangePct) : ''}`;

  const totalPlEl = document.getElementById('portfolio-total-pl');
  totalPlEl.textContent = hasCostBasis ? `${totalPl >= 0 ? '+' : ''}${formatCurrency(totalPl)}` : '—';
  totalPlEl.className = `summary-value ${hasCostBasis ? changeClass(totalPl) : ''}`;

  const totalPlPctEl = document.getElementById('portfolio-total-pl-pct');
  totalPlPctEl.textContent = totalPlPct != null ? formatPercent(totalPlPct) : '—';
  totalPlPctEl.className = `summary-sub ${totalPlPct != null ? changeClass(totalPlPct) : ''}`;
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
          ${r.coin ? `<img class="coin-icon" src="${escapeHtml(r.coin.image)}" alt="" width="24" height="24">` : ''}
          <span class="coin-name-text">${escapeHtml(r.coin ? r.coin.name : r.holding.coinId)}</span>
          ${r.coin ? `<span class="coin-symbol">${escapeHtml((r.coin.symbol || '').toUpperCase())}</span>` : ''}
        </div>
      </td>
      <td class="mono">${formatAmount(r.holding.amount)}</td>
      <td class="mono">${r.price != null ? formatCurrency(r.price) : '—'}</td>
      <td class="mono">${r.value != null ? formatCurrency(r.value) : '—'}</td>
      <td class="mono">${r.holding.buyPrice != null ? formatCurrency(r.holding.buyPrice) : '—'}</td>
      <td class="mono ${r.plAbs != null ? changeClass(r.plAbs) : ''}">${r.plAbs != null ? `${r.plAbs >= 0 ? '+' : ''}${formatCurrency(r.plAbs)} (${formatPercent(r.plPct)})` : '—'}</td>
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

  const byCoin = new Map();
  rows.forEach((r) => {
    if (r.value == null) return;
    const key = r.holding.coinId;
    const existing = byCoin.get(key) || { label: r.coin ? (r.coin.symbol || '').toUpperCase() : key, value: 0 };
    existing.value += r.value;
    byCoin.set(key, existing);
  });
  const entries = [...byCoin.values()].sort((a, b) => b.value - a.value);

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
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } },
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
  renderPortfolioSummary(rows);
  renderHoldingsTable(rows);
  renderDonut(rows);
}

/* ===================================================================
   NEWS
   =================================================================== */

function extractCategories(item) {
  return String(item.categories || '')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function loadNews() {
  const statusEl = document.getElementById('news-status');
  if (statusEl && !state.news.length) statusEl.textContent = 'Lade News …';
  try {
    const json = await fetchWithRetry(NEWS_API_URL, { retries: 2 });
    state.news = (json && json.Data) || [];
    hideNewsError();
    renderNewsCategoryPills();
    renderNews();
  } catch (err) {
    console.error('News konnten nicht geladen werden:', err);
    showNewsError();
    if (state.news.length) renderNews();
  } finally {
    if (statusEl && !state.news.length) statusEl.textContent = 'Keine News verfügbar.';
  }
}

function showNewsError() {
  const el = document.getElementById('news-error');
  if (!el) return;
  el.textContent = 'News konnten nicht geladen werden — zeige zuletzt geladene Artikel (falls vorhanden).';
  el.classList.remove('hidden');
}

function hideNewsError() {
  document.getElementById('news-error')?.classList.add('hidden');
}

function renderNewsCategoryPills() {
  const container = document.getElementById('news-category-pills');
  if (!container) return;

  const counts = new Map();
  state.news.forEach((item) => extractCategories(item).forEach((cat) => counts.set(cat, (counts.get(cat) || 0) + 1)));
  const topCats = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat]) => cat);

  if (!topCats.includes(newsCategoryFilter) && newsCategoryFilter !== 'ALL') {
    newsCategoryFilter = 'ALL';
  }

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
  if (newsCategoryFilter !== 'ALL') {
    items = items.filter((item) => extractCategories(item).includes(newsCategoryFilter));
  }
  items = [...items].sort((a, b) => b.published_on - a.published_on);

  if (!items.length) {
    list.innerHTML = '';
    statusEl.textContent = state.news.length ? 'Keine News in dieser Kategorie.' : 'Keine News verfügbar.';
    return;
  }
  statusEl.textContent = '';

  list.innerHTML = items.map((item) => `
    <li class="news-item">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="news-link">
        <div class="news-thumb-wrap">
          <img class="news-thumb" src="${escapeHtml(item.imageurl)}" alt="" loading="lazy" onerror="this.closest('.news-thumb-wrap').style.visibility='hidden'">
        </div>
        <div class="news-body">
          <span class="news-meta">${escapeHtml((item.source_info && item.source_info.name) || item.source || 'Unbekannt')} · ${formatRelativeTime(item.published_on)}</span>
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
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

/* ===================================================================
   INIT
   =================================================================== */

async function init() {
  initTabs();
  initMarketControls();
  initModal();
  initCoinCombobox();
  initHoldingForm();
  updateSortPillsUI();
  renderPortfolio();

  await loadMarketData();
  await loadNews();

  setInterval(() => loadMarketData({ silent: true }), MARKET_REFRESH_MS);
  setInterval(() => loadNews(), NEWS_REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', init);
