// =====================================================
// Jim's Betting Results - Interactive Core Script
// =====================================================

const STORAGE_KEY = 'jim_betting_picks_v1';
const SETTINGS_KEY = 'jim_betting_settings_v1';
let picks = [];
let currentEditingPickId = null;
let currentEditPickId = null;
let settings = { unitDollarValue: 0, statsSport: '', statsPeriod: 'all' };
let loadErrorNotified = false;
// Simple HTML escape to prevent XSS from user input (matchup, notes, usernames, etc.)
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      settings = {
        unitDollarValue: Number(parsed.unitDollarValue) || 0,
        statsSport: parsed.statsSport || '',
        statsPeriod: parsed.statsPeriod || 'all'
      };
    }
  } catch (e) {
    console.warn('[JimBetting] Settings reset after load error.', e);
    settings = { unitDollarValue: 0, statsSport: '', statsPeriod: 'all' };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettingsToUI() {
  const unitInput = document.getElementById('unit-dollar-value');
  if (unitInput) unitInput.value = settings.unitDollarValue || '';
  const sportFilter = document.getElementById('stats-sport-filter');
  if (sportFilter) sportFilter.value = settings.statsSport || '';
  const periodFilter = document.getElementById('stats-period-filter');
  if (periodFilter) periodFilter.value = settings.statsPeriod || 'all';
}

function onUnitSettingChange() {
  const val = parseFloat(document.getElementById('unit-dollar-value')?.value);
  settings.unitDollarValue = val > 0 ? val : 0;
  saveSettings();
  renderStats();
}

function onStatsFilterChange() {
  settings.statsSport = document.getElementById('stats-sport-filter')?.value || '';
  settings.statsPeriod = document.getElementById('stats-period-filter')?.value || 'all';
  saveSettings();
  renderStats();
}

// Load data from localStorage. Starts empty on first visit (no auto demo seed).
function loadPicks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      picks = [];
      return;
    }

    const data = JSON.parse(stored);
    if (!Array.isArray(data)) throw new Error('Invalid picks format');

    const hasOldFormat = data.some(p => 'stake' in p && !('units' in p));
    if (hasOldFormat) {
      console.log('[JimBetting] Old stake-based data detected. Starting fresh with unit model.');
      localStorage.removeItem(STORAGE_KEY);
      picks = [];
      return;
    }

    picks = data;
  } catch (e) {
    console.error('[JimBetting] Failed to load picks:', e);
    localStorage.removeItem(STORAGE_KEY);
    picks = [];
    loadErrorNotified = true;
  }
}

function savePicks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
}

function normalizeAmericanOdds(odds) {
  if (!odds) return '';
  const trimmed = String(odds).trim().replace(/\s/g, '');
  if (/^[+-]\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return n > 0 ? `+${n}` : `${n}`;
  }
  return trimmed;
}

function isValidAmericanOdds(odds) {
  const normalized = normalizeAmericanOdds(odds);
  if (!/^[+-]\d+$/.test(normalized)) return false;
  const n = parseInt(normalized, 10);
  if (n === 0) return false;
  return n >= 100 || n <= -100;
}

function pickMatchesSportFilter(pick, sport) {
  if (!sport) return true;
  if (pick.sport === sport) return true;
  if (hasParlayLegs(pick)) {
    return pick.parlayLegs.some(leg => leg.sport === sport);
  }
  return false;
}

function getPeriodCutoff(period) {
  const now = new Date();
  if (period === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (period === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  if (period === 'ytd') {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null;
}

function getStatsFilterOptions() {
  return {
    sport: settings.statsSport || '',
    period: settings.statsPeriod || 'all'
  };
}

function formatParlayLegsForCsv(pick) {
  if (!hasParlayLegs(pick)) return '';
  return pick.parlayLegs
    .map((leg, i) => `${i + 1}. ${leg.sport} | ${leg.matchup} | ${leg.selection}`)
    .join(' / ');
}

// Seed realistic demo data using UNITS (not dollars).
// Typical serious bettors use 1–5 units per play.
function seedDemoData() {
  const demo = [
    {
      id: 'p' + Date.now() + '1',
      user: 'Jim',
      date: '2026-02-18',
      sport: 'NBA',
      matchup: 'Boston Celtics vs Milwaukee Bucks',
      pickType: 'Spread',
      selection: 'BOS -4.5',
      odds: '-110',
      units: 2.0,
      confidence: 8,
      notes: 'Celtics rested and playing great D at home. Bucks on back-to-back.',
      status: 'won',
      resultProfit: 1.818   // 2u @ -110
    },
    {
      id: 'p' + Date.now() + '2',
      user: 'Jim',
      date: '2026-02-17',
      sport: 'NFL',
      matchup: 'Kansas City Chiefs vs Buffalo Bills',
      pickType: 'Moneyline',
      selection: 'Chiefs ML',
      odds: '-135',
      units: 3.0,
      confidence: 7,
      notes: 'Mahomes in the playoffs is different. Taking the value.',
      status: 'won',
      resultProfit: 2.222   // 3u @ -135
    },
    {
      id: 'p' + Date.now() + '3',
      user: 'Jim',
      date: '2026-02-15',
      sport: 'NHL',
      matchup: 'Colorado Avalanche vs Dallas Stars',
      pickType: 'Total',
      selection: 'Over 6.5',
      odds: '+110',
      units: 1.5,
      confidence: 6,
      notes: 'High event game expected. Both teams average over 3.4 goals lately.',
      status: 'lost',
      resultProfit: -1.5
    },
    {
      id: 'p' + Date.now() + '4',
      user: 'Jim',
      date: '2026-02-14',
      sport: 'MLB',
      matchup: 'New York Yankees vs Boston Red Sox',
      pickType: 'Spread',
      selection: 'NYY -1.5',
      odds: '-130',
      units: 1.0,
      confidence: 5,
      notes: 'Early season but Yankees lineup is stacked.',
      status: 'won',
      resultProfit: 0.769   // 1u @ -130
    },
    {
      id: 'p' + Date.now() + '5',
      user: 'Jim',
      date: '2026-02-19',
      sport: 'NBA',
      matchup: 'Golden State Warriors vs LA Clippers',
      pickType: 'Prop',
      selection: 'Curry 4+ Threes',
      odds: '-115',
      units: 1.5,
      confidence: 8,
      notes: 'Clippers give up a ton of threes lately.',
      status: 'pending',
      resultProfit: 0
    },
    {
      id: 'p' + Date.now() + '6',
      user: 'Jim',
      date: '2026-02-12',
      sport: 'NFL',
      matchup: 'Philadelphia Eagles vs Tampa Bay Buccaneers',
      pickType: 'Spread',
      selection: 'Eagles -3',
      odds: '-105',
      units: 2.0,
      confidence: 7,
      notes: 'Eagles run game will wear them down.',
      status: 'lost',
      resultProfit: -2.0
    }
  ];
  return demo;
}

function getCurrentUser() {
  return document.getElementById('current-user')?.value.trim() || 'Jim';
}

function syncPickUserField() {
  const pickUser = document.getElementById('pick-user');
  if (pickUser) pickUser.value = getCurrentUser();
}

function updateCurrentUser(newName) {
  // Picks keep their original user attribution; display name drives stats + new submissions.
  syncPickUserField();
  renderAll();
}

// Utility: Calculate unit profit/loss from American odds
// Positive = units won, Negative = units lost
function calculateUnitProfit(odds, units, status) {
  if (status === 'push') return 0;
  if (status !== 'won') return -units;   // lost = full units risked

  const o = parseInt(odds, 10);
  if (isNaN(o) || units <= 0) return 0;

  if (o > 0) {
    // Positive moneyline: e.g. +150 → win 1.5 units per 1 unit
    return (units * o) / 100;
  } else {
    // Negative moneyline: e.g. -110 → win ~0.909 units per 1 unit
    return (units / Math.abs(o)) * 100;
  }
}

// Backwards compat wrapper (will be removed after migration)
function calculateProfit(odds, stake, status) {
  return calculateUnitProfit(odds, stake, status);
}

// Format currency nicely
function formatMoney(amount) {
  // Legacy - kept for any old paths. Prefer formatUnits going forward.
  const sign = amount >= 0 ? '+' : '';
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// Format unit profit/loss nicely: +1.82u or -2.00u
function formatUnits(amount) {
  if (amount === 0) return '0.00u';
  const sign = amount > 0 ? '+' : '';
  return `${sign}${amount.toFixed(2)}u`;
}

function formatDollarEquivalent(unitAmount) {
  if (!settings.unitDollarValue || settings.unitDollarValue <= 0) return '';
  const dollars = unitAmount * settings.unitDollarValue;
  const sign = dollars >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
}

// Returns the P/L string to display.
// For pending picks, returns '—' (no +/- shown until user explicitly marks the result).
function getDisplayPL(pick) {
  if (!pick || pick.status === 'pending') {
    return '—';
  }
  const u = pick.units ?? pick.stake ?? 1;
  const profit = pick.resultProfit ?? calculateUnitProfit(pick.odds, u, pick.status);
  return formatUnits(profit);
}

// Returns the CSS classes for the P/L cell based on status and profit value
function getPLClasses(pick) {
  if (!pick || pick.status === 'pending') {
    return 'text-zinc-500';
  }
  const u = pick.units ?? pick.stake ?? 1;
  const profit = pick.resultProfit ?? calculateUnitProfit(pick.odds, u, pick.status);
  if (pick.status === 'push') return 'text-amber-400';
  return profit > 0 ? 'profit-positive' : 'profit-negative';
}

// Format date pretty
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Toast helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  const colors = type === 'success' 
    ? 'bg-emerald-900 border-emerald-700 text-emerald-300' 
    : type === 'error' 
      ? 'bg-red-900 border-red-700 text-red-300' 
      : 'bg-zinc-800 border-zinc-600 text-zinc-300';
  
  toast.className = `toast flex items-center gap-3 px-4 py-3 rounded-2xl border ${colors} shadow-xl max-w-xs`;
  toast.innerHTML = `
    <div class="flex-1 text-sm">${message}</div>
    <button class="text-lg leading-none opacity-60 hover:opacity-100">×</button>
  `;
  
  container.appendChild(toast);
  
  toast.querySelector('button').onclick = () => toast.remove();
  
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3800);
}

// Main stats calculation
function calculateStats(userFilter = null, filterOptions = null) {
  const opts = filterOptions || getStatsFilterOptions();
  let filtered = picks;
  if (userFilter) {
    filtered = picks.filter(p => p.user === userFilter);
  }
  if (opts.sport) {
    filtered = filtered.filter(p => pickMatchesSportFilter(p, opts.sport));
  }
  const cutoff = getPeriodCutoff(opts.period);
  if (cutoff) {
    filtered = filtered.filter(p => new Date(p.date) >= cutoff);
  }

  const total = filtered.length;
  if (total === 0) {
    return { total: 0, winRate: 0, profit: 0, streak: 0, streakType: 'none' };
  }

  const decided = filtered.filter(p => p.status !== 'pending');
  const won = decided.filter(p => p.status === 'won').length;
  const winRate = decided.length > 0 ? (won / decided.length) * 100 : 0;

  let profit = 0;
  decided.forEach(p => {
    const u = p.units ?? p.stake ?? 1;
    profit += (p.resultProfit || calculateUnitProfit(p.odds, u, p.status));
  });

  // Current streak (most recent results) + direction
  let streak = 0;
  let streakType = 'none'; // 'win' | 'loss' | 'none'
  const sorted = [...decided].sort((a, b) => new Date(b.date) - new Date(a.date));
  const firstStatus = sorted[0]?.status;
  if (firstStatus === 'won' || firstStatus === 'lost') {
    streakType = firstStatus === 'won' ? 'win' : 'loss';
    for (let pick of sorted) {
      if (pick.status === firstStatus) streak++;
      else break;
    }
  }

  return {
    total,
    winRate: parseFloat(winRate.toFixed(1)),
    profit: parseFloat(profit.toFixed(2)),
    streak,
    streakType
  };
}

// Render all dashboard stats
function renderStats() {
  const currentUser = getCurrentUser();
  const stats = calculateStats(currentUser);

  document.getElementById('stat-total').innerText = stats.total;

  const wrEl = document.getElementById('stat-winrate');
  wrEl.innerHTML = `${stats.winRate}<span class="text-xl font-normal align-super">%</span>`;

  const profitEl = document.getElementById('stat-profit');
  const dollarHint = formatDollarEquivalent(stats.profit);
  profitEl.innerHTML = formatUnits(stats.profit) +
    (dollarHint ? `<div class="text-sm font-normal mt-0.5 opacity-80">${dollarHint}</div>` : '');
  profitEl.className = `text-4xl font-semibold tabular-nums stat-value ${stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`;

  const streakLabel = stats.streakType === 'loss' ? 'L' : 'W';
  const streakColor = stats.streakType === 'loss' ? 'text-red-400' : 'text-emerald-400';
  document.getElementById('stat-streak').innerHTML = `${stats.streak} <span class="text-lg font-normal ${streakColor}">${streakLabel}</span>`;

  const periodLabel = document.getElementById('stat-period-label');
  if (periodLabel) {
    const labels = { all: 'ALL TIME', '7d': 'LAST 7 DAYS', '30d': 'LAST 30 DAYS', ytd: 'YEAR TO DATE' };
    periodLabel.textContent = labels[settings.statsPeriod] || 'ALL TIME';
  }
}

// --- Parlay form helpers ---
const MIN_PARLAY_LEGS = 2;
const MAX_PARLAY_LEGS = 12;

function getSportSelectHtml(selectedSport) {
  const template = document.getElementById('pick-sport');
  if (!template) return '';
  return Array.from(template.options)
    .map(opt => {
      const sel = opt.value === selectedSport ? ' selected' : '';
      return `<option value="${escapeHtml(opt.value)}"${sel}>${escapeHtml(opt.text)}</option>`;
    })
    .join('');
}

function hasParlayLegs(pick) {
  return Array.isArray(pick?.parlayLegs) && pick.parlayLegs.length > 0;
}

function formatPickSelection(pick) {
  if (hasParlayLegs(pick)) {
    return pick.parlayLegs.map((leg, i) => `Leg ${i + 1}: ${leg.selection}`).join(' • ');
  }
  return pick.selection || '';
}

function formatPickSelectionHtml(pick) {
  if (hasParlayLegs(pick)) {
    return pick.parlayLegs.map((leg, i) => `
      <div class="text-xs leading-snug ${i > 0 ? 'mt-1' : ''}">
        <span class="text-zinc-500 font-mono">${i + 1}.</span>
        <span class="text-zinc-400">${escapeHtml(leg.sport)}</span>
        <span class="text-zinc-500"> · </span>${escapeHtml(leg.matchup)}
        <span class="text-zinc-500"> — </span><span class="text-amber-400/90">${escapeHtml(leg.selection)}</span>
      </div>
    `).join('');
  }
  return escapeHtml(pick.selection || '');
}

function pickMatchesSearchText(pick, search) {
  if (!search) return true;
  const haystack = [
    p.matchup,
    p.selection,
    p.notes,
    ...(hasParlayLegs(p) ? p.parlayLegs.flatMap(leg => [leg.sport, leg.matchup, leg.selection]) : [])
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(search);
}

function isParlayPickType() {
  return document.getElementById('pick-type')?.value === 'Parlay';
}

function togglePickTypeUI() {
  const isParlay = isParlayPickType();
  document.getElementById('pick-single-selection-wrap')?.classList.toggle('hidden', isParlay);
  document.getElementById('pick-sport-wrap')?.classList.toggle('hidden', isParlay);
  document.getElementById('parlay-legs-section')?.classList.toggle('hidden', !isParlay);

  const matchupLabel = document.getElementById('pick-matchup-label');
  const matchupInput = document.getElementById('pick-matchup');
  if (matchupLabel) {
    matchupLabel.textContent = isParlay ? 'PARLAY TITLE (OPTIONAL)' : 'MATCHUP / GAME';
  }
  if (matchupInput) {
    matchupInput.placeholder = isParlay ? 'e.g. Sunday 3-Leg NBA Parlay' : 'Lakers vs Warriors';
  }

  if (isParlay && document.querySelectorAll('#parlay-legs-container .parlay-leg-row').length < MIN_PARLAY_LEGS) {
    resetParlayLegs();
  }
}

function createParlayLegRow(legIndex, defaults = {}, containerId = 'parlay-legs-container') {
  const row = document.createElement('div');
  row.className = 'parlay-leg-row grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-start bg-zinc-950/60 border border-zinc-800 rounded-2xl p-3';
  row.innerHTML = `
    <div class="md:col-span-1 flex items-center h-[42px]">
      <span class="parlay-leg-label text-xs font-bold text-amber-400/80 tracking-wider">LEG ${legIndex}</span>
    </div>
    <div class="md:col-span-2">
      <label class="block text-[10px] font-semibold tracking-widest text-zinc-500 mb-1 md:sr-only">SPORT</label>
      <select class="parlay-leg-sport w-full bg-zinc-950 border border-zinc-700 focus:border-blue-500 focus-blue transition px-3 py-2.5 rounded-2xl text-sm">
        ${getSportSelectHtml(defaults.sport || 'NBA')}
      </select>
    </div>
    <div class="md:col-span-4">
      <label class="block text-[10px] font-semibold tracking-widest text-zinc-500 mb-1 md:sr-only">MATCHUP</label>
      <input type="text" class="parlay-leg-matchup w-full bg-zinc-950 border border-zinc-700 focus:border-blue-500 focus-blue transition px-3 py-2.5 rounded-2xl text-sm" placeholder="Lakers vs Warriors" value="${escapeHtml(defaults.matchup || '')}">
    </div>
    <div class="md:col-span-4">
      <label class="block text-[10px] font-semibold tracking-widest text-zinc-500 mb-1 md:sr-only">SELECTION</label>
      <input type="text" class="parlay-leg-selection w-full bg-zinc-950 border border-zinc-700 focus:border-blue-500 focus-blue transition px-3 py-2.5 rounded-2xl text-sm" placeholder="LAL -5.5" value="${escapeHtml(defaults.selection || '')}">
    </div>
    <div class="md:col-span-1 flex items-center justify-end h-[42px]">
      <button type="button" onclick="removeParlayLegIn('${containerId}', this)" class="parlay-leg-remove w-9 h-9 rounded-xl bg-zinc-800 hover:bg-red-900/40 border border-zinc-700 text-zinc-400 hover:text-red-400 transition text-lg leading-none" title="Remove leg">×</button>
    </div>
  `;
  return row;
}

function resetParlayLegsIn(containerId = 'parlay-legs-container', legDefaults = null) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const defaultsList = legDefaults?.length
    ? legDefaults
    : Array.from({ length: MIN_PARLAY_LEGS }, () => ({}));
  const count = Math.max(MIN_PARLAY_LEGS, defaultsList.length);
  for (let i = 0; i < count; i++) {
    container.appendChild(createParlayLegRow(i + 1, defaultsList[i] || {}, containerId));
  }
  renumberParlayLegsIn(containerId);
}

function resetParlayLegs() {
  resetParlayLegsIn('parlay-legs-container');
}

function addParlayLegIn(containerId = 'parlay-legs-container') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const count = container.querySelectorAll('.parlay-leg-row').length;
  if (count >= MAX_PARLAY_LEGS) {
    showToast(`Maximum ${MAX_PARLAY_LEGS} legs per parlay.`, 'error');
    return;
  }
  container.appendChild(createParlayLegRow(count + 1, {}, containerId));
  renumberParlayLegsIn(containerId);
}

function addParlayLeg() {
  addParlayLegIn('parlay-legs-container');
}

function removeParlayLegIn(containerId, btn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = container.querySelectorAll('.parlay-leg-row');
  if (rows.length <= MIN_PARLAY_LEGS) return;
  btn.closest('.parlay-leg-row')?.remove();
  renumberParlayLegsIn(containerId);
}

function removeParlayLeg(btn) {
  removeParlayLegIn('parlay-legs-container', btn);
}

function renumberParlayLegsIn(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = container.querySelectorAll('.parlay-leg-row');
  rows.forEach((row, idx) => {
    const legLabel = row.querySelector('.parlay-leg-label');
    if (legLabel) legLabel.textContent = `LEG ${idx + 1}`;
    const removeBtn = row.querySelector('.parlay-leg-remove');
    if (!removeBtn) return;
    const atMin = rows.length <= MIN_PARLAY_LEGS;
    removeBtn.disabled = atMin;
    removeBtn.classList.toggle('opacity-30', atMin);
    removeBtn.classList.toggle('cursor-not-allowed', atMin);
  });
}

function collectParlayLegsFromContainer(containerId = 'parlay-legs-container') {
  const rows = document.querySelectorAll(`#${containerId} .parlay-leg-row`);
  return Array.from(rows).map(row => ({
    sport: row.querySelector('.parlay-leg-sport')?.value || 'NBA',
    matchup: row.querySelector('.parlay-leg-matchup')?.value.trim() || '',
    selection: row.querySelector('.parlay-leg-selection')?.value.trim() || ''
  }));
}

function collectParlayLegsFromForm() {
  return collectParlayLegsFromContainer('parlay-legs-container');
}

function resolveParlaySport(legs) {
  const sports = [...new Set(legs.map(l => l.sport))];
  return sports.length === 1 ? sports[0] : 'Multi';
}

function setupPickForm() {
  const pickType = document.getElementById('pick-type');
  if (pickType) {
    pickType.addEventListener('change', togglePickTypeUI);
  }
  const editPickType = document.getElementById('edit-pick-type');
  if (editPickType) {
    editPickType.addEventListener('change', toggleEditPickTypeUI);
  }
  resetParlayLegs();
  resetParlayLegsIn('edit-parlay-legs-container');
  togglePickTypeUI();
  toggleEditPickTypeUI();
}

// Submit new pick from the form
function submitPick() {
  const user = document.getElementById('pick-user').value.trim() || 'Anonymous';
  const pickType = document.getElementById('pick-type').value;
  const isParlay = pickType === 'Parlay';
  let sport = document.getElementById('pick-sport').value;
  let matchup = document.getElementById('pick-matchup').value.trim();
  let selection = document.getElementById('pick-selection').value.trim();
  let parlayLegs = null;
  const odds = document.getElementById('pick-odds').value.trim();
  const units = parseFloat(document.getElementById('pick-stake').value) || 1.0;
  const confidence = parseInt(document.getElementById('pick-confidence').value);
  const notes = document.getElementById('pick-notes').value.trim();
  const date = document.getElementById('pick-date')?.value || new Date().toISOString().split('T')[0];
  const oddsNormalized = normalizeAmericanOdds(odds);

  if (!isValidAmericanOdds(oddsNormalized)) {
    showToast('Enter valid American odds (e.g. -110, +150).', 'error');
    return;
  }

  if (isParlay) {
    parlayLegs = collectParlayLegsFromForm();
    const incomplete = parlayLegs.findIndex(leg => !leg.matchup || !leg.selection);
    if (parlayLegs.length < MIN_PARLAY_LEGS) {
      showToast(`Add at least ${MIN_PARLAY_LEGS} legs to your parlay.`, 'error');
      return;
    }
    if (incomplete !== -1) {
      showToast(`Leg ${incomplete + 1} needs a matchup and selection.`, 'error');
      return;
    }
    sport = resolveParlaySport(parlayLegs);
    matchup = matchup || `${parlayLegs.length}-Leg Parlay`;
    selection = parlayLegs.map((leg, i) => `Leg ${i + 1}: ${leg.selection}`).join(' • ');
  } else if (!matchup || !selection) {
    showToast('Please add a matchup and your selection.', 'error');
    return;
  }

  if (units <= 0) {
    showToast('Units must be greater than 0.', 'error');
    return;
  }

  const newPick = {
    id: 'p' + Date.now() + Math.random().toString(16).slice(2),
    user,
    date,
    sport,
    matchup,
    pickType,
    selection,
    odds: oddsNormalized,
    units,
    confidence,
    notes,
    status: 'pending',
    resultProfit: 0
  };
  if (parlayLegs) newPick.parlayLegs = parlayLegs;

  picks.unshift(newPick);
  savePicks();

  // Clear form (keep user + sport)
  document.getElementById('pick-matchup').value = '';
  document.getElementById('pick-selection').value = '';
  document.getElementById('pick-odds').value = '';
  document.getElementById('pick-stake').value = '1.0';
  document.getElementById('pick-notes').value = '';
  document.getElementById('pick-confidence').value = '7';
  document.getElementById('conf-val').innerText = '7';
  document.getElementById('pick-type').value = 'Spread';
  document.getElementById('pick-date').value = new Date().toISOString().split('T')[0];
  resetParlayLegs();
  togglePickTypeUI();

  renderAll();
  showToast('Pick added to your log!');
  
  // Scroll to my picks section
  setTimeout(() => {
    document.getElementById('mypicks').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 450);
}

// Render My Picks table
function renderMyPicks(filteredPicks = null) {
  const tbody = document.getElementById('my-picks-tbody');
  const empty = document.getElementById('my-picks-empty');
  tbody.innerHTML = '';

  const currentUser = document.getElementById('current-user').value.trim();
  let userPicks = picks.filter(p => p.user === currentUser);

  // If no explicit filtered list passed, re-apply current filter inputs so state never desyncs
  if (!filteredPicks) {
    const search = (document.getElementById('filter-my-picks')?.value || '').toLowerCase().trim();
    const status = document.getElementById('status-filter')?.value || '';

    if (search) {
      userPicks = userPicks.filter(p => pickMatchesSearchText(p, search));
    }
    if (status) {
      userPicks = userPicks.filter(p => p.status === status);
    }
  } else {
    userPicks = filteredPicks;
  }

  if (userPicks.length === 0) {
    empty.classList.remove('hidden');
    return;
  } else {
    empty.classList.add('hidden');
  }

  // Sort newest first
  userPicks.sort((a, b) => new Date(b.date) - new Date(a.date));

  userPicks.forEach(pick => {
    const plText = getDisplayPL(pick);
    const plClasses = getPLClasses(pick);

    const row = document.createElement('tr');
    row.className = `pick-row border-b border-zinc-800 text-sm`;
    row.innerHTML = `
      <td class="pl-6 py-3.5 text-zinc-400 whitespace-nowrap">${formatDate(pick.date)}</td>
      <td class="py-3.5">
        <span class="league-pill inline-block bg-zinc-800 text-amber-400/90 font-bold rounded px-2 py-px">${pick.sport}</span>
      </td>
      <td class="py-3.5 pr-3">
        <div class="font-medium leading-tight">${escapeHtml(pick.matchup)}</div>
        <div class="text-[10px] text-zinc-500">${escapeHtml(pick.pickType)}</div>
      </td>
      <td class="py-3.5 font-medium max-w-[220px]">${formatPickSelectionHtml(pick)}</td>
      <td class="py-3.5 text-center font-mono text-amber-400">${escapeHtml(pick.odds)}</td>
      <td class="py-3.5 pr-2 text-right font-medium tabular-nums">${pick.units ?? pick.stake ?? 1} <span class="text-[10px] text-zinc-500">u</span></td>
      <td class="py-3.5 text-center">
        <span class="status-badge status-${pick.status}">${pick.status.toUpperCase()}</span>
      </td>
      <td class="py-3.5 pr-6 text-right font-semibold tabular-nums ${plClasses}">
        ${plText}
      </td>
      <td class="py-3.5">
        <div class="flex items-center justify-center gap-1.5 pr-1">
          <button onclick="showEditPickModal('${pick.id}')" class="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 transition rounded-xl text-zinc-300 hover:text-white" title="Edit pick">
            <i class="fa-solid fa-pen text-[10px]"></i>
          </button>
          ${pick.status === 'pending'
            ? `<button onclick="showMarkModal('${pick.id}')" class="px-3 py-1 text-xs bg-zinc-800 hover:bg-amber-900 transition rounded-xl text-amber-300 font-medium">MARK</button>`
            : `<button onclick="showMarkModal('${pick.id}')" class="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 transition rounded-xl text-blue-400 hover:text-blue-300">RESULT</button>`
          }
          ${addShareImageButtonToPick(pick.id)}
          <button onclick="deletePick('${pick.id}')" class="px-2 py-1 text-xs text-red-400 hover:text-red-500 transition">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Filter function for my picks table
function filterMyPicks() {
  const search = document.getElementById('filter-my-picks').value.toLowerCase().trim();
  const status = document.getElementById('status-filter').value;
  const currentUser = document.getElementById('current-user').value.trim();

  let filtered = picks.filter(p => p.user === currentUser);

  if (search) {
    filtered = filtered.filter(p => pickMatchesSearchText(p, search));
  }
  if (status) {
    filtered = filtered.filter(p => p.status === status);
  }

  renderMyPicks(filtered);
}

// Mark result modal
function showMarkModal(pickId) {
  currentEditingPickId = pickId;
  const pick = picks.find(p => p.id === pickId);
  if (!pick) return;

  document.getElementById('mark-modal-matchup').innerHTML = `
    <span class="text-amber-400">${escapeHtml(pick.sport)}</span> • ${escapeHtml(pick.matchup)} <span class="text-zinc-400">(${escapeHtml(formatPickSelection(pick))})</span>
  `;
  document.getElementById('mark-modal').classList.remove('hidden');
  document.getElementById('mark-modal').classList.add('flex');
}

function hideMarkModal() {
  const modal = document.getElementById('mark-modal');
  modal.classList.remove('flex');
  modal.classList.add('hidden');
  currentEditingPickId = null;
}

function setResult(status) {
  if (!currentEditingPickId) return;

  const pick = picks.find(p => p.id === currentEditingPickId);
  if (!pick) return;

  const oldStatus = pick.status;
  pick.status = status;

  // Recalculate profit
  if (status === 'push') {
    pick.resultProfit = 0;
  } else if (status === 'won') {
    if (!isValidAmericanOdds(pick.odds)) {
      showToast('Fix odds before marking won (e.g. -110, +150).', 'error');
      pick.status = oldStatus;
      return;
    }
    const u = pick.units ?? pick.stake ?? 1;
    pick.resultProfit = calculateUnitProfit(normalizeAmericanOdds(pick.odds), u, 'won');
  } else {
    const u = pick.units ?? pick.stake ?? 1;
    pick.resultProfit = -u;
  }

  savePicks();
  hideMarkModal();
  renderAll();

  if (status === 'won' && (oldStatus !== 'won')) {
    showToast(`Nice hit! ${formatUnits(pick.resultProfit)} recorded.`, 'success');
    
    // Fun confetti for big unit wins
    if (pick.resultProfit > 3) {
      launchConfetti();
    }
  } else {
    showToast(`Result updated to ${status.toUpperCase()}.`);
  }
}

function isEditParlayPickType() {
  return document.getElementById('edit-pick-type')?.value === 'Parlay';
}

function toggleEditPickTypeUI() {
  const isParlay = isEditParlayPickType();
  document.getElementById('edit-single-selection-wrap')?.classList.toggle('hidden', isParlay);
  document.getElementById('edit-sport-wrap')?.classList.toggle('hidden', isParlay);
  document.getElementById('edit-parlay-legs-section')?.classList.toggle('hidden', !isParlay);
  const label = document.getElementById('edit-matchup-label');
  const input = document.getElementById('edit-pick-matchup');
  if (label) label.textContent = isParlay ? 'PARLAY TITLE (OPTIONAL)' : 'MATCHUP / GAME';
  if (input) input.placeholder = isParlay ? 'e.g. Sunday 3-Leg Parlay' : 'Lakers vs Warriors';
}

function showEditPickModal(pickId) {
  const pick = picks.find(p => p.id === pickId);
  if (!pick) return;

  currentEditPickId = pickId;
  document.getElementById('edit-pick-date').value = pick.date || '';
  document.getElementById('edit-pick-sport').value = pick.sport || 'NBA';
  document.getElementById('edit-pick-matchup').value = pick.matchup || '';
  document.getElementById('edit-pick-type').value = pick.pickType || 'Spread';
  document.getElementById('edit-pick-selection').value = pick.selection || '';
  document.getElementById('edit-pick-odds').value = pick.odds || '';
  document.getElementById('edit-pick-stake').value = pick.units ?? pick.stake ?? 1;
  document.getElementById('edit-pick-confidence').value = pick.confidence ?? 7;
  document.getElementById('edit-conf-val').innerText = pick.confidence ?? 7;
  document.getElementById('edit-pick-notes').value = pick.notes || '';

  if (hasParlayLegs(pick)) {
    resetParlayLegsIn('edit-parlay-legs-container', pick.parlayLegs);
  } else {
    resetParlayLegsIn('edit-parlay-legs-container');
  }
  toggleEditPickTypeUI();

  document.getElementById('edit-pick-modal').classList.remove('hidden');
  document.getElementById('edit-pick-modal').classList.add('flex');
}

function hideEditPickModal() {
  document.getElementById('edit-pick-modal')?.classList.remove('flex');
  document.getElementById('edit-pick-modal')?.classList.add('hidden');
  currentEditPickId = null;
}

function saveEditPick() {
  if (!currentEditPickId) return;
  const pick = picks.find(p => p.id === currentEditPickId);
  if (!pick) return;

  const pickType = document.getElementById('edit-pick-type').value;
  const isParlay = pickType === 'Parlay';
  const oddsRaw = document.getElementById('edit-pick-odds').value.trim();
  const oddsNormalized = normalizeAmericanOdds(oddsRaw);

  if (!isValidAmericanOdds(oddsNormalized)) {
    showToast('Enter valid American odds (e.g. -110, +150).', 'error');
    return;
  }

  let sport = document.getElementById('edit-pick-sport').value;
  let matchup = document.getElementById('edit-pick-matchup').value.trim();
  let selection = document.getElementById('edit-pick-selection').value.trim();
  let parlayLegs = null;

  if (isParlay) {
    parlayLegs = collectParlayLegsFromContainer('edit-parlay-legs-container');
    const incomplete = parlayLegs.findIndex(leg => !leg.matchup || !leg.selection);
    if (parlayLegs.length < MIN_PARLAY_LEGS) {
      showToast(`Add at least ${MIN_PARLAY_LEGS} legs to your parlay.`, 'error');
      return;
    }
    if (incomplete !== -1) {
      showToast(`Leg ${incomplete + 1} needs a matchup and selection.`, 'error');
      return;
    }
    sport = resolveParlaySport(parlayLegs);
    matchup = matchup || `${parlayLegs.length}-Leg Parlay`;
    selection = parlayLegs.map((leg, i) => `Leg ${i + 1}: ${leg.selection}`).join(' • ');
    pick.parlayLegs = parlayLegs;
  } else {
    delete pick.parlayLegs;
    if (!matchup || !selection) {
      showToast('Please add a matchup and your selection.', 'error');
      return;
    }
  }

  pick.date = document.getElementById('edit-pick-date').value || pick.date;
  pick.sport = sport;
  pick.matchup = matchup;
  pick.pickType = pickType;
  pick.selection = selection;
  pick.odds = oddsNormalized;
  pick.units = parseFloat(document.getElementById('edit-pick-stake').value) || 1;
  pick.confidence = parseInt(document.getElementById('edit-pick-confidence').value, 10);
  pick.notes = document.getElementById('edit-pick-notes').value.trim();

  if (pick.status === 'won') {
    pick.resultProfit = calculateUnitProfit(pick.odds, pick.units, 'won');
  } else if (pick.status === 'lost') {
    pick.resultProfit = -pick.units;
  } else if (pick.status === 'push') {
    pick.resultProfit = 0;
  }

  savePicks();
  hideEditPickModal();
  renderAll();
  showToast('Pick updated.');
}

// Delete pick
function deletePick(pickId) {
  if (!confirm('Delete this pick permanently?')) return;
  
  picks = picks.filter(p => p.id !== pickId);
  savePicks();
  renderAll();
  showToast('Pick deleted.');
}

// Add a quick demo pick (fun button)
function addDemoPick() {
  const demoOptions = [
    { sport: 'NBA', matchup: 'Memphis Grizzlies vs Minnesota Timberwolves', selection: 'Grizzlies +8', odds: '+105', units: 1.5, confidence: 6, notes: 'Ja back and motivated. Line is inflated.' },
    { sport: 'NHL', matchup: 'New York Rangers vs Boston Bruins', selection: 'Under 5.5', odds: '-125', units: 2.0, confidence: 7, notes: 'Both goalies are elite. Expect a tight, low scoring game.' },
    { sport: 'NFL', matchup: 'Baltimore Ravens vs Cleveland Browns', selection: 'Ravens -7', odds: '-110', units: 2.5, confidence: 8, notes: 'Lamar in a revenge spot. Browns offense looks anemic.' },
    { sport: 'MLB', matchup: 'Atlanta Braves vs Philadelphia Phillies', selection: 'Braves ML', odds: '-130', units: 1.0, confidence: 5, notes: 'Strider on the mound. Phillies struggling vs lefties.' }
  ];
  
  const pick = demoOptions[Math.floor(Math.random() * demoOptions.length)];
  const currentUser = document.getElementById('current-user').value.trim() || 'Jim';

  const newPick = {
    id: 'p' + Date.now() + 'demo',
    user: currentUser,
    date: new Date().toISOString().split('T')[0],
    sport: pick.sport,
    matchup: pick.matchup,
    pickType: pick.selection.includes('+') || pick.selection.includes('-') ? 'Spread' : 'Moneyline',
    selection: pick.selection,
    odds: pick.odds,
    units: pick.units,
    confidence: pick.confidence,
    notes: pick.notes,
    status: 'pending',
    resultProfit: 0
  };

  picks.unshift(newPick);
  savePicks();
  renderAll();
  showToast('Demo pick added. Mark it as won or lost to see stats update!');

  // Scroll to table
  document.getElementById('mypicks').scrollIntoView({ behavior: 'smooth' });
}

// Simulate random results for all pending picks (great demo tool)
function simulateResultsForPending() {
  const currentUser = getCurrentUser();
  const pending = picks.filter(p => p.status === 'pending' && p.user === currentUser);
  if (pending.length === 0) {
    showToast('No pending picks to simulate.', 'error');
    return;
  }

  let wins = 0;
  pending.forEach(p => {
    const rand = Math.random();
    if (rand < 0.52) {
      p.status = 'won';
      const u = p.units ?? p.stake ?? 1;
      p.resultProfit = calculateUnitProfit(p.odds, u, 'won');
      wins++;
    } else if (rand < 0.92) {
      p.status = 'lost';
      const u = p.units ?? p.stake ?? 1;
      p.resultProfit = -u;
    } else {
      p.status = 'push';
      p.resultProfit = 0;
    }
  });

  savePicks();
  renderAll();
  showToast(`Simulated ${pending.length} results • ${wins} wins recorded.`);
}

// Export all current user's picks to CSV
function exportToCSV() {
  const currentUser = document.getElementById('current-user').value.trim();
  const userPicks = picks.filter(p => p.user === currentUser);
  
  if (userPicks.length === 0) {
    showToast('Nothing to export.', 'error');
    return;
  }

  const headers = ['Date', 'Sport', 'Matchup', 'Pick Type', 'Selection', 'Parlay Legs', 'Odds', 'Units', 'Status', 'Profit (Units)'];
  const rows = userPicks.map(p => {
    const u = p.units ?? p.stake ?? 1;
    const profit = p.resultProfit || calculateUnitProfit(p.odds, u, p.status);
    const legs = formatParlayLegsForCsv(p).replace(/"/g, '""');
    return [
      p.date, p.sport, `"${p.matchup.replace(/"/g, '""')}"`, p.pickType,
      `"${(p.selection || '').replace(/"/g, '""')}"`, `"${legs}"`, p.odds, u, p.status, profit
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jims-betting-results-${currentUser.toLowerCase().replace(/\s/g, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('CSV exported successfully.');
}

// Main render orchestrator
function renderAll() {
  renderStats();
  renderMyPicks();
}

// Completely clear all saved picks so the user can start fresh with their own bets
function resetAllData() {
  if (!confirm('This will permanently delete ALL your saved picks. You will start with a completely empty list. This cannot be undone.\n\nAre you sure?')) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  picks = [];           // Fresh start - no demo data
  savePicks();
  renderAll();
  showToast('All data cleared. Start adding your own picks!');
}

// Mobile nav toggle
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  menu.classList.toggle('hidden');
}

// Simple confetti for big wins
function launchConfetti() {
  const colors = ['#f4c430', '#4ade80', '#eab308'];
  for (let i = 0; i < 38; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (Math.random() * 1.3 + 1.1) + 's';
    piece.style.opacity = Math.random() * 0.7 + 0.3;
    document.body.appendChild(piece);
    
    setTimeout(() => piece.remove(), 2400);
  }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName === 'BODY') {
      e.preventDefault();
      const search = document.getElementById('filter-my-picks');
      search.focus();
      search.select();
    }
    if (e.metaKey && e.key === 'Enter' && document.getElementById('pick-matchup') === document.activeElement) {
      e.preventDefault();
      submitPick();
    }
  });

  // Make sure confidence value shows on load
  const confSlider = document.getElementById('pick-confidence');
  if (confSlider) {
    confSlider.oninput = () => {
      document.getElementById('conf-val').innerText = confSlider.value;
    };
  }
}

// Initial boot
function init() {
  loadSettings();
  loadPicks();

  syncPickUserField();
  setupPickForm();
  applySettingsToUI();

  const dateInput = document.getElementById('pick-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Initial renders
  renderAll();

  if (loadErrorNotified) {
    showToast('Saved picks were corrupted — started with an empty log.', 'error');
  }

  // Boot keyboard niceties
  setupKeyboardShortcuts();

  // Show a friendly first-time toast
  setTimeout(() => {
    if (!localStorage.getItem('jim_betting_intro_shown')) {
      showToast('Log a pick, mark the result, and your stats update instantly.');
      localStorage.setItem('jim_betting_intro_shown', '1');
    }
  }, 5200);

  // Expose a couple helpers to console for power users
  window.JBR = { 
    reset: resetAllData, 
    addDemo: () => addDemoPick(), 
    simulate: () => simulateResultsForPending(),
    showSlip: (pickId) => showSlipModal('pick', pickId),
    shareRecord: () => showSlipModal('record')
  };
  
  console.log('%c[Jim\'s Betting Results] Website ready. All data in localStorage.', 'color:#555');
}

// =====================================================
// BET SLIP IMAGE GENERATOR (for @JimNewBettingSite X posts)
// =====================================================

let currentSlipMode = 'pick';   // 'pick' | 'record'
let currentSlipPickId = null;
let currentSlipPick = null;

function showSlipModal(mode = 'pick', pickId = null) {
  currentSlipMode = mode;
  currentSlipPickId = pickId;

  const modal = document.getElementById('slip-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Determine data source
  if (mode === 'pick' && pickId) {
    currentSlipPick = picks.find(p => p.id === pickId) || null;
  } else {
    currentSlipPick = null;
  }

  // Default tab highlight
  document.getElementById('slip-tab-pick').classList.toggle('bg-zinc-800', mode === 'pick');
  document.getElementById('slip-tab-pick').classList.toggle('text-white', mode === 'pick');
  document.getElementById('slip-tab-pick').classList.toggle('border-amber-400', mode === 'pick');
  document.getElementById('slip-tab-record').classList.toggle('bg-zinc-800', mode === 'record');
  document.getElementById('slip-tab-record').classList.toggle('text-white', mode === 'record');
  document.getElementById('slip-tab-record').classList.toggle('border-amber-400', mode === 'record');

  // Show/hide pick-specific controls
  document.getElementById('slip-pick-options').style.display = (mode === 'pick') ? 'flex' : 'none';

  renderSlipPreview();
}

function hideSlipModal() {
  const modal = document.getElementById('slip-modal');
  modal.classList.remove('flex');
  modal.classList.add('hidden');
  currentSlipPick = null;
  currentSlipPickId = null;
}

function switchSlipMode(mode) {
  currentSlipMode = mode;
  currentSlipPick = null; // reset when switching manually

  // Update tabs
  const pickTab = document.getElementById('slip-tab-pick');
  const recordTab = document.getElementById('slip-tab-record');

  if (mode === 'pick') {
    pickTab.classList.add('bg-zinc-800', 'text-white', 'border-amber-400');
    pickTab.classList.remove('text-zinc-400');
    recordTab.classList.remove('bg-zinc-800', 'text-white', 'border-amber-400');
    recordTab.classList.add('text-zinc-400');
    document.getElementById('slip-pick-options').style.display = 'flex';
  } else {
    recordTab.classList.add('bg-zinc-800', 'text-white', 'border-amber-400');
    recordTab.classList.remove('text-zinc-400');
    pickTab.classList.remove('bg-zinc-800', 'text-white', 'border-amber-400');
    pickTab.classList.add('text-zinc-400');
    document.getElementById('slip-pick-options').style.display = 'none';
  }

  renderSlipPreview();
}

function renderSlipPreview() {
  const container = document.getElementById('slip-preview');
  const includeNotes = document.getElementById('slip-include-notes')?.checked ?? true;

  let html = '';

  if (currentSlipMode === 'pick' && currentSlipPick) {
    const p = currentSlipPick;
    const u = p.units ?? p.stake ?? 1;
    const profit = (p.status !== 'pending') 
      ? (p.resultProfit ?? calculateUnitProfit(p.odds, u, p.status)) 
      : 0;
    const isWin = p.status === 'won';
    const isLoss = p.status === 'lost';
    const isPush = p.status === 'push';

    const dateStr = formatDate(p.date);
    const statusColor = isWin ? 'emerald' : isLoss ? 'red' : 'amber';

    html = `
      <div class="p-8 text-white" style="background: linear-gradient(160deg, #111113 0%, #0a0a0c 100%); min-height: 480px;">
        <!-- Header - minimal, no branding -->
        <div class="flex items-start justify-between">
          <div class="text-xs text-zinc-400 tracking-widest">BET SLIP</div>
          <div class="text-right">
            <div class="inline-block px-3 py-px rounded-full text-xs font-black tracking-wider bg-zinc-800 text-amber-400">${p.sport}</div>
            <div class="text-xs text-zinc-400 mt-1 font-mono">${dateStr}</div>
          </div>
        </div>

        <!-- Matchup -->
        <div class="mt-7">
          <div class="uppercase text-xs tracking-[2px] text-zinc-400 mb-1">MATCHUP</div>
          <div class="text-3xl font-semibold tracking-[-1.2px] leading-none">${escapeHtml(p.matchup)}</div>
        </div>

        <!-- Selection + Odds -->
        <div class="mt-6 flex items-end justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="uppercase text-xs tracking-[2px] text-zinc-400 mb-1">${hasParlayLegs(p) ? 'PARLAY LEGS' : 'YOUR PICK'}</div>
            ${hasParlayLegs(p) ? `
              <div class="space-y-2 mt-1">${p.parlayLegs.map((leg, i) => `
                <div class="text-sm leading-snug">
                  <span class="text-zinc-500 font-mono">${i + 1}.</span>
                  <span class="text-zinc-400">${escapeHtml(leg.sport)}</span>
                  <span class="text-zinc-300"> ${escapeHtml(leg.matchup)}</span>
                  <span class="text-amber-400 font-semibold"> — ${escapeHtml(leg.selection)}</span>
                </div>
              `).join('')}</div>
            ` : `<div class="text-4xl font-bold tracking-[-1.5px] text-amber-400">${escapeHtml(p.selection)}</div>`}
          </div>
          <div class="text-right flex-shrink-0">
            <div class="text-xs text-zinc-400">ODDS</div>
            <div class="font-mono text-3xl font-semibold">${escapeHtml(p.odds)}</div>
          </div>
        </div>

        <!-- Units + Confidence -->
        <div class="mt-6 grid grid-cols-2 gap-4">
          <div class="bg-zinc-900/70 border border-zinc-700 rounded-2xl px-4 py-3">
            <div class="text-xs text-zinc-400">UNITS RISKED</div>
            <div class="text-3xl font-semibold tabular-nums mt-0.5">${u} <span class="text-base font-normal text-zinc-400">u</span></div>
          </div>
          <div class="bg-zinc-900/70 border border-zinc-700 rounded-2xl px-4 py-3">
            <div class="text-xs text-zinc-400">CONFIDENCE</div>
            <div class="flex items-baseline gap-1 mt-0.5">
              <div class="text-3xl font-semibold">${p.confidence}</div>
              <div class="text-base text-zinc-400">/10</div>
            </div>
          </div>
        </div>

        ${includeNotes && p.notes ? `
          <div class="mt-5 text-sm text-zinc-300 border-l-2 border-amber-400/60 pl-3 leading-snug">
            ${escapeHtml(p.notes)}
          </div>
        ` : ''}

        <!-- Result / P/L -->
        <div class="mt-7 pt-5 border-t border-zinc-700 flex items-center justify-between">
          <div>
            ${p.status === 'pending' 
              ? `<span class="status-badge status-pending px-4 py-1 text-sm">PENDING</span>` 
              : `<span class="px-4 py-1 rounded-2xl text-sm font-bold ${isWin ? 'bg-emerald-900 text-emerald-400' : isLoss ? 'bg-red-900 text-red-400' : 'bg-amber-900 text-amber-400'}">${p.status.toUpperCase()}</span>`
            }
          </div>
          <div class="text-right">
            ${p.status !== 'pending' ? `
              <div class="text-xs text-zinc-400">P/L</div>
              <div class="text-3xl font-bold tabular-nums ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">
                ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}u
              </div>
            ` : `<div class="text-xs text-zinc-500">Mark result to see P/L</div>`}
          </div>
        </div>
      </div>
    `;
  } else {
    // RECORD SUMMARY MODE
    const currentUser = getCurrentUser();
    const filterOpts = getStatsFilterOptions();
    const stats = calculateStats(currentUser, filterOpts);
    const streakLabel = stats.streakType === 'loss' ? 'L' : 'W';
    const streakColor = stats.streakType === 'loss' ? 'text-red-400' : 'text-emerald-400';
    const winRate = stats.winRate.toFixed(0);
    let userPicks = picks.filter(p => p.user === currentUser);
    if (filterOpts.sport) userPicks = userPicks.filter(p => pickMatchesSportFilter(p, filterOpts.sport));
    const cutoff = getPeriodCutoff(filterOpts.period);
    if (cutoff) userPicks = userPicks.filter(p => new Date(p.date) >= cutoff);
    const decided = userPicks.filter(p => p.status !== 'pending');

    // Simple sport breakdown
    const sportMap = {};
    decided.forEach(p => {
      sportMap[p.sport] = (sportMap[p.sport] || 0) + 1;
    });
    const topSports = Object.entries(sportMap).sort((a,b)=>b[1]-a[1]).slice(0,3);

    html = `
      <div class="p-8 text-white" style="background: linear-gradient(160deg, #111113 0%, #0a0a0c 100%); min-height: 480px;">
        <div class="flex justify-between items-start">
          <div>
            <div class="font-display text-2xl tracking-[-1px] font-semibold">${escapeHtml(currentUser)}'s Record</div>
          </div>
          <div class="text-right text-xs">
            <div class="text-emerald-400 font-semibold">LIVE FROM THE LOG</div>
            <div class="text-zinc-400">${new Date().toLocaleDateString('en-US', {month:'short', year:'numeric'})}</div>
          </div>
        </div>

        <div class="mt-7">
          <div class="text-xs tracking-[1.5px] text-zinc-400">NET PROFIT ALL TIME</div>
          <div class="text-7xl font-bold tabular-nums tracking-[-3px] mt-1 ${stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}">
            ${stats.profit >= 0 ? '+' : ''}${stats.profit}u
          </div>
        </div>

        <div class="mt-6 grid grid-cols-3 gap-3 text-center">
          <div class="bg-zinc-900/60 rounded-2xl py-3 border border-zinc-700">
            <div class="text-3xl font-semibold tabular-nums">${stats.total}</div>
            <div class="text-xs text-zinc-400 mt-px">PICKS LOGGED</div>
          </div>
          <div class="bg-zinc-900/60 rounded-2xl py-3 border border-zinc-700">
            <div class="text-3xl font-semibold tabular-nums">${winRate}<span class="text-lg align-super font-normal">%</span></div>
            <div class="text-xs text-zinc-400 mt-px">WIN RATE</div>
          </div>
          <div class="bg-zinc-900/60 rounded-2xl py-3 border border-zinc-700">
            <div class="text-3xl font-semibold tabular-nums">${stats.streak}<span class="text-lg align-super font-normal ${streakColor}">${streakLabel}</span></div>
            <div class="text-xs text-zinc-400 mt-px">CURRENT STREAK</div>
          </div>
        </div>

        ${topSports.length ? `
          <div class="mt-6">
            <div class="text-xs tracking-widest text-zinc-400 mb-2">TOP SPORTS</div>
            <div class="flex flex-wrap gap-2">
              ${topSports.map(([sport, count]) => `
                <div class="px-3 py-1 rounded-2xl bg-zinc-800 text-xs font-bold text-amber-300">${sport} <span class="text-zinc-400">· ${count}</span></div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Clean bottom - no "Track your edge at", no JimNewBettingSite, no @ handle -->
      </div>
    `;
  }

  container.innerHTML = html;

  // Live caption update
  const captionEl = document.getElementById('slip-caption');
  if (captionEl) captionEl.value = getSlipCaption();
}

// Generate casual Jim-style X caption
function getSlipCaption() {
  const currentUser = document.getElementById('current-user').value.trim() || 'Jim';

  if (currentSlipMode === 'pick' && currentSlipPick) {
    const p = currentSlipPick;
    const u = p.units ?? 1;
    const profit = p.status !== 'pending' ? (p.resultProfit ?? calculateUnitProfit(p.odds, u, p.status)) : 0;

    if (p.status === 'won') {
      const hooks = [
        `Who else was riding the ${p.selection} in the ${p.sport}? ${u}u winner. Easy. 🔥`,
        `Hit ${p.selection} (${p.odds}) for ${u}u. ${p.notes ? p.notes.split('.')[0] + '.' : 'Felt good all night.'} Who else?`,
        `${p.sport} cash. ${p.selection} comes through for ${formatUnits(profit)}. Not mad about it.`
      ];
      return hooks[Math.floor(Math.random() * hooks.length)] + ` Full log on the site. @JimNewBettingSite`;
    } else if (p.status === 'lost') {
      return `Tough beat on the ${p.selection} (${u}u). Happens. Back at it tomorrow. What's your favorite play today? @JimNewBettingSite`;
    } else {
      return `Logged ${p.selection} in the ${p.sport} for ${u}u @ ${p.odds}. Who else is on this one? @JimNewBettingSite`;
    }
  } else {
    // Record summary
    const stats = calculateStats(getCurrentUser(), getStatsFilterOptions());
    return `Current record: ${stats.total} picks • ${stats.winRate}% win rate • ${formatUnits(stats.profit)} net. Still grinding the edge. Full transparent log at JimNewBettingSite. @JimNewBettingSite`;
  }
}

async function copySlipCaption() {
  const ta = document.getElementById('slip-caption');
  if (!ta?.value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ta.value);
    } else {
      ta.select();
      document.execCommand('copy');
    }
    showToast('Caption copied — paste it with the image on X!');
  } catch {
    showToast('Could not copy caption.', 'error');
  }
}

async function downloadSlipImage() {
  const preview = document.getElementById('slip-preview');
  if (!preview) return;

  try {
    const canvas = await html2canvas(preview, {
      scale: 2,
      backgroundColor: '#0f0f11',
      logging: false,
      width: preview.offsetWidth,
      height: preview.offsetHeight
    });

    const link = document.createElement('a');
    let filename = 'jim-bet-slip';

    if (currentSlipMode === 'pick' && currentSlipPick) {
      const p = currentSlipPick;
      const safe = (p.matchup || 'pick').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28);
      filename = `jim-slip-${p.sport.toLowerCase()}-${safe}`;
    } else {
      filename = `jim-record-${new Date().toISOString().slice(0,10)}`;
    }

    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('High-res PNG downloaded. Perfect for X posts 🔥');
  } catch (err) {
    console.error(err);
    showToast('Image export failed. Check console.', 'error');
  }
}

// Quick helper so other code can trigger slips easily
function addShareImageButtonToPick(pickId) {
  // Used inside renderMyPicks
  return `<button onclick="event.stopImmediatePropagation(); showSlipModal('pick', '${pickId}')" 
                 class="px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 transition rounded-xl text-amber-300 hover:text-amber-400 flex items-center gap-1"
                 title="Create shareable image for X">
            <i class="fa-solid fa-camera text-xs"></i>
          </button>`;
}

// Boot the app
document.addEventListener('DOMContentLoaded', init);