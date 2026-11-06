const LANG_STORAGE_KEY = 'view1_lang';

function storageGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function storageSet(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }

let currentLang = Object.hasOwn(LANG, storageGet(LANG_STORAGE_KEY)) ? storageGet(LANG_STORAGE_KEY) : 'ja';

function t(key){ return LANG[currentLang][key] || LANG.ja[key] || key; }

// localStorage の JSON 読み書き（壊れたデータや保存不可でもアプリを止めない）
function loadJSON(key, isValid, fallback){
  try {
    const raw = storageGet(key);
    if(raw){ const v = JSON.parse(raw); if(isValid(v)) return v; }
  } catch(e) { /* ignore */ }
  return fallback;
}
function saveJSON(key, value){ return storageSet(key, JSON.stringify(value)); }

function escapeHtml(str){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

const safeColor = c => /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#adb5bd';

function applyLang(){
  document.documentElement.lang = currentLang;
  // static data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  // settings modal language selector indicators
  const langJa = document.getElementById('lang-option-ja');
  const langEn = document.getElementById('lang-option-en');
  const langVal = document.getElementById('settings-lang-value');
  if(langVal) langVal.textContent = currentLang === 'ja' ? '日本語' : 'English';
  if(langJa) langJa.classList.toggle('selected', currentLang === 'ja');
  if(langEn) langEn.classList.toggle('selected', currentLang === 'en');
  renderClockBoard();
  renderTtPalette();
  renderTtGrid();
  dlRender();
  // re-render weather if already loaded
  if(weatherCache.tokyo)    renderWeatherCard('weather-tokyo',    weatherCache.tokyo);
  if(weatherCache.tsuruoka) renderWeatherCard('weather-tsuruoka', weatherCache.tsuruoka);
  if(weatherCache.search && weatherSearchLabel) {
    renderWeatherCard('weather-search-result', weatherCache.search, weatherSearchLabel);
  }
}

function setLang(lang){
  if(!Object.hasOwn(LANG, lang)) return;
  currentLang = lang;
  storageSet(LANG_STORAGE_KEY, lang);
  applyLang();
}

let settingsLastFocus = null, settingsCloseTimer = null;
const MOTION_KEY = 'view1_reduce_motion';

// iOS の「設定」と同じ：メイン → サブページへ横にスライド
function settingsShowPage(name){
  const modal = document.querySelector('.settings-modal');
  const main = document.getElementById('set-page-main');
  const lang = document.getElementById('set-page-lang');
  const pushed = name !== 'main';
  modal.classList.toggle('pushed', pushed);
  main.inert = pushed;  main.setAttribute('aria-hidden', String(pushed));
  lang.inert = !pushed; lang.setAttribute('aria-hidden', String(!pushed));
  document.getElementById('set-back').hidden = !pushed;
  document.getElementById('set-done').hidden = pushed;
  const focusEl = pushed ? document.getElementById('set-back') : document.getElementById('set-done');
  if(focusEl) focusEl.focus({ preventScroll: true });
}

function openSettingsModal(){
  clearTimeout(settingsCloseTimer);
  settingsLastFocus = document.activeElement;
  const ov = document.getElementById('settings-modal-overlay');
  ov.classList.remove('closing');
  ov.classList.add('open');
  settingsShowPage('main');
  applyLang();
}

function closeSettingsModal(){
  const ov = document.getElementById('settings-modal-overlay');
  if(!ov.classList.contains('open') || ov.classList.contains('closing')) return;
  ov.classList.add('closing');
  settingsCloseTimer = setTimeout(() => {
    ov.classList.remove('open', 'closing');
    if(settingsLastFocus && settingsLastFocus.focus) settingsLastFocus.focus({ preventScroll: true });
  }, prefersReducedMotion() ? 0 : 260);
}

function setReduceMotion(on){
  document.body.classList.toggle('reduce-motion', on);
  const sw = document.getElementById('motion-switch');
  if(sw) sw.setAttribute('aria-checked', String(on));
}
function toggleReduceMotion(){
  const on = !document.body.classList.contains('reduce-motion');
  storageSet(MOTION_KEY, on ? '1' : '0');
  setReduceMotion(on);
}
setReduceMotion(storageGet(MOTION_KEY) === '1');

function handleSettingsOverlayClick(e){
  if(e.target === document.getElementById('settings-modal-overlay')) closeSettingsModal();
}

// ===== TAB =====
let currentTab = 'home';
let tabTimer = null, staggerTimer = null;
const TAB_LEAVE_MS = 180;
const prefersReducedMotion = () => document.body.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function tabOrder() {
  return Array.from(document.querySelectorAll('.sidebar .tab-btn')).map(b => b.dataset.tab);
}

// ナビの選択ピルを対象ボタンの位置へ移動
function movePill(name, instant) {
  const nav = document.querySelector('.sidebar nav');
  if (!nav) return;
  let pill = nav.querySelector('.nav-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'nav-pill';
    nav.prepend(pill);
  }
  const target = nav.querySelector('.tab-btn[data-tab="' + name + '"]');
  if (!target) return;
  if (instant) pill.classList.add('no-anim');
  pill.style.width = target.offsetWidth + 'px';
  pill.style.transform = 'translateX(' + target.offsetLeft + 'px)';
  pill.classList.add('ready');
  if (instant) { void pill.offsetWidth; pill.classList.remove('no-anim'); }
  // 画面外にあるタブが選ばれたらナビをスクロールして見えるように
  target.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: instant ? 'auto' : 'smooth' });
}

function clearTabClasses(el) {
  el.classList.remove('tab-leave', 'tab-enter', 'tab-stagger');
}

function switchTab(name, btn) {
  const next = document.getElementById('tab-' + name);
  if (!next) return;

  // サイドバー側のボタンをハイライト
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  if (btn && btn.classList && btn.classList.contains('tab-btn')) {
    btn.classList.add('active');
  } else {
    const sideBtn = document.querySelector('.sidebar .tab-btn[data-tab="' + name + '"]');
    if (sideBtn) sideBtn.classList.add('active');
  }
  movePill(name, false);

  // 同じタブなら何もしない
  if (name === currentTab && next.classList.contains('active')) return;

  // 連打対策：進行中の切り替えを即座に確定させる
  clearTimeout(tabTimer);
  clearTimeout(staggerTimer);
  document.querySelectorAll('.tab-content').forEach(el => {
    clearTabClasses(el);
    if (el !== next) el.classList.remove('active');
  });

  const order = tabOrder();
  const dir = order.indexOf(name) >= order.indexOf(currentTab) ? 1 : -1;
  const prev = document.getElementById('tab-' + currentTab);
  currentTab = name;

  const reveal = () => {
    if (prev && prev !== next) prev.classList.remove('active');
    if (prev) clearTabClasses(prev);
    next.classList.add('active');
    document.body.classList.toggle('home-active', name === 'home');

    // スクロール位置をリセット
    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);

    if (prefersReducedMotion()) return;

    // 中身のスタッガー用に --i を付与
    const kids = Array.from(next.children);
    kids.forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
    kids.forEach((grid, gi) => {
      if (!grid.classList.contains('grid-2')) return;
      Array.from(grid.children).forEach((el, j) => {
        el.style.setProperty('--i', Math.min(gi + j, 10));
      });
    });

    next.style.setProperty('--dir', dir);
    next.classList.add('tab-enter', 'tab-stagger');
    staggerTimer = setTimeout(() => clearTabClasses(next), 1100);
  };

  if (prefersReducedMotion() || !prev || prev === next || !prev.classList.contains('active')) {
    reveal();
  } else {
    // 先に今の画面をフェードアウトしてから、新しい画面を表示
    prev.style.setProperty('--dir', dir);
    prev.classList.add('tab-leave');
    tabTimer = setTimeout(reveal, TAB_LEAVE_MS);
  }
}

// ピルの初期位置とリサイズ・言語切替時の再計測
window.addEventListener('load', () => movePill(currentTab, true));
window.addEventListener('resize', () => movePill(currentTab, true));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(currentTab, true));
(function () {
  const nav = document.querySelector('.sidebar nav');
  if (nav && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(() => movePill(currentTab, true));
    nav.querySelectorAll('.tab-btn').forEach(b => ro.observe(b));
  }
})();

// ===== LIVE CLOCK =====
const CLOCK_STORAGE_KEY = 'view1_clocks';
const CLOCK_MAX = 12;

const DEFAULT_CLOCKS = [
  { id: '1850147', name: 'Tokyo',     admin1: 'Tokyo',  country: 'Japan',          tz: 'Asia/Tokyo' },
  { id: '2950159', name: 'Berlin',    admin1: 'Berlin', country: 'Germany',        tz: 'Europe/Berlin' },
  { id: '5128581', name: 'New York',  admin1: 'New York', country: 'United States', tz: 'America/New_York' },
  { id: '2147714', name: 'Sydney',    admin1: 'New South Wales', country: 'Australia', tz: 'Australia/Sydney' },
];

let clockZones = [];
let clockDragId = null;

function pad(n){ return String(n).padStart(2,'0'); }

function dayNames(){
  return currentLang === 'ja'
    ? ['日','月','火','水','木','金','土']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
}

function isValidTz(tz){
  if(typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch(e){ return false; }
}

function loadClockZones(){
  const list = loadJSON(CLOCK_STORAGE_KEY, Array.isArray, [])
    .filter(c => c && typeof c.id === 'string' && c.id.length <= 32 && typeof c.name === 'string' && isValidTz(c.tz))
    .slice(0, CLOCK_MAX)
    .map(c => ({ id: c.id, name: c.name.slice(0, 80), admin1: String(c.admin1 || '').slice(0, 80), country: String(c.country || '').slice(0, 80), tz: c.tz }));
  return list.length ? list : DEFAULT_CLOCKS.map(c => ({ ...c }));
}

function saveClockZones(){ saveJSON(CLOCK_STORAGE_KEY, clockZones); }

function clockLabel(clock){
  const parts = [clock.name];
  if(clock.admin1 && clock.admin1 !== clock.name) parts.push(clock.admin1);
  if(clock.country) parts.push(clock.country);
  return parts.join(' · ');
}

function formatTzLabel(tz){
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName');
    return part?.value || tz;
  } catch(e) {
    return tz;
  }
}

function renderClockBoard(){
  const board = document.getElementById('clock-board');
  if(!board) return;

  if(!clockZones.length){
    board.innerHTML = `<div class="loading-text">${t('clock_empty')}</div>`;
    return;
  }

  board.innerHTML = clockZones.map(c => `
    <div class="clock-card-wrap" data-clock-id="${escapeHtml(c.id)}" draggable="true">
      <button type="button" class="clock-remove-btn" data-clock-id="${escapeHtml(c.id)}" title="${t('clock_remove')}" aria-label="${t('clock_remove')}">
        <span class="material-icons">close</span>
      </button>
      <div class="clock-card">
        <div class="clock-city">${escapeHtml(clockLabel(c))}</div>
        <div class="clock-time">--:--:--</div>
        <div class="clock-date">---</div>
        <div class="clock-tz">${escapeHtml(formatTzLabel(c.tz))}</div>
        <div class="clock-move">
          <button type="button" class="clock-move-btn" data-act="clock-move" data-dir="-1" data-clock-id="${escapeHtml(c.id)}" aria-label="${t('clock_move_prev')}"><span class="material-icons">chevron_left</span></button>
          <button type="button" class="clock-move-btn" data-act="clock-move" data-dir="1" data-clock-id="${escapeHtml(c.id)}" aria-label="${t('clock_move_next')}"><span class="material-icons">chevron_right</span></button>
        </div>
      </div>
    </div>`).join('');

  setupClockDragDrop();
  updateClocks();
}

function setupClockDragDrop(){
  const board = document.getElementById('clock-board');
  if(!board) return;

  board.querySelectorAll('.clock-card-wrap').forEach(wrap => {
    wrap.addEventListener('dragstart', e => {
      if(e.target.closest('.clock-remove-btn')){ e.preventDefault(); return; }
      clockDragId = wrap.dataset.clockId;
      wrap.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    wrap.addEventListener('dragend', () => {
      wrap.classList.remove('dragging');
      board.querySelectorAll('.clock-card-wrap').forEach(w => w.classList.remove('drag-over'));
      clockDragId = null;
    });
    wrap.addEventListener('dragover', e => {
      e.preventDefault();
      if(wrap.dataset.clockId !== clockDragId) wrap.classList.add('drag-over');
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drag-over'));
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      wrap.classList.remove('drag-over');
      const targetId = wrap.dataset.clockId;
      if(!clockDragId || clockDragId === targetId) return;
      const from = clockZones.findIndex(c => c.id === clockDragId);
      const to = clockZones.findIndex(c => c.id === targetId);
      if(from < 0 || to < 0) return;
      const [item] = clockZones.splice(from, 1);
      clockZones.splice(to, 0, item);
      saveClockZones();
      renderClockBoard();
    });
  });

  board.querySelectorAll('.clock-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeClock(btn.dataset.clockId);
    });
  });
}

function moveClock(id, dir){
  const i = clockZones.findIndex(c => c.id === id), j = i + dir;
  if(i < 0 || j < 0 || j >= clockZones.length) return;
  [clockZones[i], clockZones[j]] = [clockZones[j], clockZones[i]];
  saveClockZones();
  renderClockBoard();
}

function removeClock(id){
  clockZones = clockZones.filter(c => c.id !== id);
  saveClockZones();
  renderClockBoard();
}

async function searchClockCity(){
  const input = document.getElementById('clock-search-input');
  const errEl = document.getElementById('clock-search-error');
  const query = input.value.trim();
  errEl.textContent = '';

  if(!query){
    errEl.textContent = t('clock_city_empty');
    return;
  }

  try {
    const place = await geocodeCity(query);
    if(!place) throw new Error('not found');
    if(!place.timezone || !isValidTz(place.timezone)) throw new Error('no tz');

    const id = String(place.id);
    if(clockZones.some(c => c.id === id)){
      errEl.textContent = t('clock_already');
      return;
    }
    if(clockZones.length >= CLOCK_MAX){
      errEl.textContent = t('clock_max');
      return;
    }

    clockZones.push({
      id,
      name: place.name,
      admin1: place.admin1 || '',
      country: place.country || '',
      tz: place.timezone,
    });
    saveClockZones();
    input.value = '';
    renderClockBoard();
  } catch(e) {
    errEl.textContent = e.message === 'no tz' ? t('clock_no_tz') : t('clock_city_notfound');
  }
}

function updateClocks(){
  const now = new Date();
  document.getElementById('live-time').textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const days = dayNames();
  document.querySelectorAll('#clock-board .clock-card-wrap').forEach(w => {
    const c = clockZones.find(z => z.id === w.dataset.clockId);
    const timeEl = w.querySelector('.clock-time'), dateEl = w.querySelector('.clock-date');
    if(!c || !timeEl || !dateEl) return;
    try {
      const p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: c.tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(now).forEach(x => { p[x.type] = x.value; });
      const wd = new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay();
      timeEl.textContent = `${p.hour}:${p.minute}:${p.second}`;
      dateEl.textContent = `${days[wd]}  ${+p.month}/${+p.day}`;
    } catch(e) {
      timeEl.textContent = '--:--:--';
      dateEl.textContent = '---';
    }
  });
}

document.getElementById('clock-search-input').addEventListener('keydown', e => {
  if(e.key === 'Enter') searchClockCity();
});

clockZones = loadClockZones();
renderClockBoard();
setInterval(updateClocks, 1000);
updateClocks();



// ===== WEATHER =====
const weatherEmoji = {
  0:'☀️', 1:'🌤', 2:'⛅', 3:'☁️',
  45:'🌫', 48:'🌫', 51:'🌦', 53:'🌦', 55:'🌧',
  56:'🌧', 57:'🌧', 61:'🌧', 63:'🌧', 65:'🌧', 66:'🌧', 67:'🌧', 71:'🌨', 73:'🌨', 75:'❄️', 77:'🌨', 85:'🌨', 86:'❄️',
  80:'🌦', 81:'🌧', 82:'⛈', 95:'⛈', 96:'⛈', 99:'⛈'
};

const weatherCache = {};
const weatherReq = {};

async function fetchJSON(url){
  const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function weatherFail(id){
  const el = document.getElementById(id);
  const l = el && el.querySelector('.loading-text');
  if(l){ l.className = 'error-text'; l.textContent = t('weather_error'); }
}

// Map WMO weather code → CSS class
function weatherBgClass(code){
  if(code === 0 || code === 1)              return 'wx-sunny';
  if(code === 2)                             return 'wx-partly';
  if(code === 3)                             return 'wx-cloudy';
  if(code === 45 || code === 48)             return 'wx-fog';
  if(code >= 51 && code <= 55)              return 'wx-drizzle';
  if(code >= 61 && code <= 67)              return 'wx-rain';
  if(code >= 71 && code <= 77)              return 'wx-snow';
  if(code >= 80 && code <= 82)              return 'wx-rain';
  if(code === 85 || code === 86)             return 'wx-snow';
  if(code >= 95 && code <= 99)              return 'wx-thunder';
  return 'wx-cloudy';
}

const WX_CLASSES = ['wx-sunny','wx-partly','wx-cloudy','wx-fog','wx-drizzle','wx-rain','wx-snow','wx-thunder'];

const WEATHER_FIXED_LABELS = {
  'weather-tokyo':    { ja: '東京 · Tokyo', en: 'Tokyo · 東京' },
  'weather-tsuruoka': { ja: '鶴岡 · Tsuruoka', en: 'Tsuruoka · 鶴岡' },
};

let weatherSearchLabel = '';

function weatherCardLabel(elementId, labelOverride){
  if(labelOverride) return labelOverride;
  const fixed = WEATHER_FIXED_LABELS[elementId];
  if(!fixed) return '';
  return currentLang === 'ja' ? fixed.ja : fixed.en;
}

function renderWeatherCard(elementId, data, labelOverride){
  const el = document.getElementById(elementId);
  if(!el) return;

  const { c, d, code } = data;
  const icon = weatherEmoji[code] || '🌡';
  const desc = (weatherDescMap[currentLang][code]) || t('weather_unk');
  const tmax = Math.round(d.temperature_2m_max[0]);
  const tmin = Math.round(d.temperature_2m_min[0]);
  const label = weatherCardLabel(elementId, labelOverride);

  el.classList.remove(...WX_CLASSES);
  el.classList.add(weatherBgClass(code));

  el.innerHTML = `
    <div class="card-title">${escapeHtml(label)}</div>
    <div class="weather-main">
      <div class="weather-icon">${icon}</div>
      <div class="weather-temp">${Math.round(c.temperature_2m)}°</div>
    </div>
    <div class="weather-desc">${desc}</div>
    <div class="weather-detail">
      <span><label>${t('weather_max')}</label><strong>${tmax}°C</strong></span>
      <span><label>${t('weather_min')}</label><strong>${tmin}°C</strong></span>
      <span><label>${t('weather_hum')}</label><strong>${Math.round(Number(c.relative_humidity_2m))}%</strong></span>
      <span><label>${t('weather_wind')}</label><strong>${Math.round(Number(c.wind_speed_10m ?? c.windspeed_10m))} km/h</strong></span>
    </div>`;
}

async function fetchWeather(lat, lon, cacheKey, elementId, timezone = 'Asia/Tokyo', labelOverride){
  const tz = encodeURIComponent(timezone);
  const token = weatherReq[cacheKey] = (weatherReq[cacheKey] || 0) + 1;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat)}&longitude=${Number(lon)}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=${tz}&forecast_days=1`;
  const data = await fetchJSON(url);
  if(!data.current || !data.daily) throw new Error('No weather data');
  if(token !== weatherReq[cacheKey]) return null;  // 古いリクエストの結果は捨てる
  const payload = { c: data.current, d: data.daily, code: data.current.weather_code ?? data.current.weathercode };
  weatherCache[cacheKey] = payload;
  renderWeatherCard(elementId, payload, labelOverride);
  return payload;
}

async function geocodeCity(query){
  const lang = currentLang === 'ja' ? 'ja' : 'en';
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.slice(0, 100))}&count=5&language=${lang}&format=json`;
  const data = await fetchJSON(url);
  return data.results?.[0] || null;
}

function formatGeocodeLabel(place){
  const parts = [place.name];
  if(place.admin1 && place.admin1 !== place.name) parts.push(place.admin1);
  if(place.country) parts.push(place.country);
  return parts.join(' · ');
}

async function searchWeatherCity(){
  const input = document.getElementById('weather-search-input');
  const errEl = document.getElementById('weather-search-error');
  const wrap = document.getElementById('weather-search-wrap');
  const card = document.getElementById('weather-search-result');
  const query = input.value.trim();

  errEl.textContent = '';
  if(!query){
    errEl.textContent = t('weather_city_empty');
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;
  card.innerHTML = `<div class="loading-text">${t('weather_searching')}</div>`;
  card.classList.remove(...WX_CLASSES);

  try {
    const place = await geocodeCity(query);
    if(!place) throw new Error('not found');

    weatherSearchLabel = formatGeocodeLabel(place);
    await fetchWeather(
      place.latitude,
      place.longitude,
      'search',
      'weather-search-result',
      place.timezone || 'auto',
      weatherSearchLabel
    );
  } catch(e) {
    weatherSearchLabel = '';
    delete weatherCache.search;
    wrap.hidden = true;
    errEl.textContent = t('weather_city_notfound');
  }
}

document.getElementById('weather-search-input').addEventListener('keydown', e => {
  if(e.key === 'Enter') searchWeatherCity();
});

fetchWeather(35.6762, 139.6503, 'tokyo',    'weather-tokyo').catch(() => weatherFail('weather-tokyo'));
fetchWeather(38.7243, 139.8235, 'tsuruoka', 'weather-tsuruoka').catch(() => weatherFail('weather-tsuruoka'));

// Keyboard: Esc closes settings modal
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') { closeSettingsModal(); }
});

// ===== 時間割 (TIMETABLE) =====
const TT_CUSTOM_KEY = 'view1_tt_custom';
const TT_DATA_KEY = 'view1_tt_data';
const TT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TT_PERIOD_COUNT = 6;
const TT_MAX_CUSTOM = 20;

const TT_DEFAULT_SUBJECTS = [
  { id: 'kokugo',   name: '国語',     color: '#ff6b6b' },
  { id: 'sugaku',   name: '数学',     color: '#4dabf7' },
  { id: 'eigo',     name: '英語',     color: '#51cf66' },
  { id: 'rika',     name: '理科',     color: '#ffa94d' },
  { id: 'shakai',   name: '社会',     color: '#cc5de8' },
  { id: 'taiiku',   name: '体育',     color: '#22b8cf' },
  { id: 'hoken',    name: '保健',     color: '#63e6be' },
  { id: 'geijutsu', name: '芸術',     color: '#ffd43b' },
  { id: 'katei',    name: '家庭',     color: '#f783ac' },
  { id: 'joho',     name: '情報',     color: '#748ffc' },
  { id: 'sogo',     name: '総合探究',  color: '#94d82d' },
  { id: 'hr',       name: 'HR',      color: '#adb5bd' },
];
 

const TT_CUSTOM_COLOR_CYCLE = [
  '#ff8787', '#74c0fc', '#69db7c', '#ffd43b', '#b197fc',
  '#ff9f43', '#3bc9db', '#f06595', '#a9e34b', '#fab005',
];

let ttCustomSubjects = [];
let ttScheduleData = {};
let ttSelected = null;
let ttDragId = null;

function ttLoadCustom(){
  return loadJSON(TT_CUSTOM_KEY, Array.isArray, [])
    .filter(s => s && typeof s.id === 'string' && /^[\w-]{1,40}$/.test(s.id) && typeof s.name === 'string' && s.name.trim())
    .slice(0, TT_MAX_CUSTOM)
    .map(s => ({ id: s.id, name: s.name.slice(0, 12), color: safeColor(s.color), custom: true }));
}
function ttSaveCustom(){ saveJSON(TT_CUSTOM_KEY, ttCustomSubjects); }

function ttLoadData(){
  const raw = loadJSON(TT_DATA_KEY, v => v && typeof v === 'object' && !Array.isArray(v), {});
  const out = {};
  TT_DAYS.forEach(d => {
    for(let p = 1; p <= TT_PERIOD_COUNT; p++){
      const v = raw[d + '-' + p];
      if(v && typeof v.name === 'string') out[d + '-' + p] = { name: v.name.slice(0, 12), color: safeColor(v.color) };
    }
  });
  return out;
}
function ttSaveData(){ saveJSON(TT_DATA_KEY, ttScheduleData); }

function ttAllSubjects(){ return TT_DEFAULT_SUBJECTS.concat(ttCustomSubjects); }

function ttAddCustomSubject(){
  const input = document.getElementById('tt-custom-input');
  const errEl = document.getElementById('tt-add-error');
  errEl.textContent = '';
  const name = input.value.trim();

  if(!name){ errEl.textContent = t('tt_err_empty'); return; }
  if(ttAllSubjects().some(s => s.name === name)){ errEl.textContent = t('tt_err_dup'); return; }
  if(ttCustomSubjects.length >= TT_MAX_CUSTOM){ errEl.textContent = t('tt_err_max'); return; }

  const color = TT_CUSTOM_COLOR_CYCLE[ttCustomSubjects.length % TT_CUSTOM_COLOR_CYCLE.length];
  const newSub = {
    id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2),
    name, color, custom: true,
  };
  ttCustomSubjects.push(newSub);
  ttSaveCustom();
  input.value = '';
  renderTtPalette();
}

function ttRemoveCustomSubject(id){
  ttCustomSubjects = ttCustomSubjects.filter(s => s.id !== id);
  ttSaveCustom();
  if(ttSelected && ttSelected.id === id) ttSelected = null;
  renderTtPalette();
}

function ttHandlePaletteClick(id){
  const sub = ttAllSubjects().find(s => s.id === id);
  if(!sub) return;
  ttSelected = (ttSelected && ttSelected.id === sub.id) ? null : sub;
  renderTtPalette();
}

function ttHintText(){
  if(ttSelected){
    return t('tt_hint_selected').replace('{name}', () => ttSelected.name);
  }
  return t('tt_hint_default');
}

function renderTtPalette(){
  const wrap = document.getElementById('tt-palette');
  if(!wrap) return;
  const all = ttAllSubjects();

  wrap.innerHTML = all.map(s => `
    <div class="tt-card ${ttSelected && ttSelected.id === s.id ? 'selected' : ''}" style="--tt-color:${safeColor(s.color)}"
      draggable="true" data-tt-id="${escapeHtml(s.id)}" data-act="tt-pick">
      <span class="tt-card-dot"></span><span class="tt-card-name">${escapeHtml(s.name)}</span>
      ${s.custom ? `<button type="button" class="tt-card-remove" data-act="tt-del" data-tt-id="${escapeHtml(s.id)}" aria-label="${t('tt_remove')}"><span class="material-icons">close</span></button>` : ''}
    </div>`).join('');

  setupTtPaletteDrag();

  const hint = document.getElementById('tt-hint');
  if(hint) hint.textContent = ttHintText();
}

function setupTtPaletteDrag(){
  document.querySelectorAll('#tt-palette .tt-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      if(e.target.closest('.tt-card-remove')){ e.preventDefault(); return; }
      ttDragId = card.dataset.ttId;
      e.dataTransfer.effectAllowed = 'copy';
    });
    card.addEventListener('dragend', () => { ttDragId = null; });
  });
}

function ttDayLabel(d){
  const map = currentLang === 'ja'
    ? { mon:'月', tue:'火', wed:'水', thu:'木', fri:'金', sat:'土' }
    : { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat' };
  return map[d];
}

function ttPeriodLabel(p){
  return currentLang === 'ja' ? `${p}時間目` : `Period ${p}`;
}

function renderTtGrid(){
  const grid = document.getElementById('tt-grid');
  if(!grid) return;

  let html = '<div class="tt-cell tt-head tt-corner"></div>';
  TT_DAYS.forEach(d => { html += `<div class="tt-cell tt-head">${escapeHtml(ttDayLabel(d))}</div>`; });

  for(let p = 1; p <= TT_PERIOD_COUNT; p++){
    html += `<div class="tt-cell tt-head tt-period-label">${escapeHtml(ttPeriodLabel(p))}</div>`;
    TT_DAYS.forEach(d => {
      const key = d + '-' + p;
      const val = ttScheduleData[key];
      if(val){
        html += `<div class="tt-cell tt-filled" data-day="${d}" data-period="${p}" style="--tt-color:${safeColor(val.color)}" data-act="tt-cell">
          <span class="tt-cell-name">${escapeHtml(val.name)}</span>
          <button type="button" class="tt-cell-remove" data-act="tt-clear" data-day="${d}" data-period="${p}" aria-label="${t('tt_remove')}"><span class="material-icons">close</span></button>
        </div>`;
      } else {
        html += `<div class="tt-cell tt-empty" data-day="${d}" data-period="${p}" data-act="tt-cell"></div>`;
      }
    });
  }

  grid.innerHTML = html;
  setupTtGridDrop();
}

function ttPlaceSubject(day, period, sub){
  ttScheduleData[day + '-' + period] = { name: sub.name, color: sub.color };
  ttSaveData();
  renderTtGrid();
}

function ttHandleCellClick(day, period){
  if(!ttSelected || !TT_DAYS.includes(day) || !(period >= 1 && period <= TT_PERIOD_COUNT)) return;
  ttPlaceSubject(day, period, ttSelected);
}

function ttClearCell(day, period){
  delete ttScheduleData[day + '-' + period];
  ttSaveData();
  renderTtGrid();
}

function setupTtGridDrop(){
  document.querySelectorAll('#tt-grid .tt-cell[data-day]').forEach(cell => {
    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('tt-drag-over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('tt-drag-over'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('tt-drag-over');
      if(!ttDragId) return;
      const sub = ttAllSubjects().find(s => s.id === ttDragId);
      ttDragId = null;
      if(!sub) return;
      ttPlaceSubject(cell.dataset.day, cell.dataset.period, sub);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const ttInput = document.getElementById('tt-custom-input');
  if(ttInput) ttInput.addEventListener('keydown', e => { if(e.key === 'Enter') ttAddCustomSubject(); });
});

ttCustomSubjects = ttLoadCustom();
ttScheduleData = ttLoadData();
renderTtPalette();
renderTtGrid();

// ===== 提出物・宿題カウントダウン (DEADLINE COUNTDOWN) =====
// 緊急度は残り日数から自動判定（手動の優先度設定はなし）
//   overdue: 期限切れ / urgent: 今日・明日 / soon: 2〜3日 / week: 4〜7日 / later: 8日以降
const DL_STORAGE_KEY = 'view1_deadlines';
const DL_MAX = 100;
let deadlines = [];

function dlLoad(){
  return loadJSON(DL_STORAGE_KEY, Array.isArray, [])
    .filter(d => d && typeof d.id === 'string' && /^[\w-]{1,40}$/.test(d.id) && typeof d.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .slice(0, DL_MAX)
    .map(d => ({ id: d.id, title: d.title.slice(0, 40), date: d.date, done: d.done === true }));
}
function dlSave(){ saveJSON(DL_STORAGE_KEY, deadlines); }

function dlParseDate(dateStr){
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function dlToYmd(dt){
  const p = n => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
}

function dlTodayKey(){ return dlToYmd(new Date()); }

function dlDiffDays(dateStr){
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((dlParseDate(dateStr) - today) / 86400000);
}

function dlLevel(diff){
  if(diff < 0)  return 'overdue';
  if(diff <= 1) return 'urgent';
  if(diff <= 3) return 'soon';
  if(diff <= 7) return 'week';
  return 'later';
}

function dlFormatDate(dateStr){
  const dt = dlParseDate(dateStr);
  const days = dayNames();
  const yearPart = dt.getFullYear() !== new Date().getFullYear() ? dt.getFullYear() + '/' : '';
  return `${yearPart}${dt.getMonth() + 1}/${dt.getDate()} (${days[dt.getDay()]})`;
}

function dlCountdownLabel(diff){
  if(diff === 0) return t('dl_today');
  if(diff === 1) return t('dl_tomorrow');
  if(diff > 1) return t('dl_days_left').replace('{n}', () => diff);
  if(diff === -1) return t('dl_overdue_1');
  return t('dl_overdue').replace('{n}', () => Math.abs(diff));
}

// 「今日 / 明日 / 3日後…」ボタン：日付入力をスマホで開かなくても設定できる
function dlQuick(days){
  const n = Number(days);
  if(!Number.isInteger(n) || n < 0 || n > 365) return;
  const dt = new Date();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + n);
  const input = document.getElementById('dl-date-input');
  if(input) input.value = dlToYmd(dt);
  document.querySelectorAll('#dl-quick-row .dl-quick-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.days === String(n));
  });
}

function dlAdd(){
  const titleInput = document.getElementById('dl-title-input');
  const dateInput = document.getElementById('dl-date-input');
  const errEl = document.getElementById('dl-add-error');
  errEl.textContent = '';

  const title = titleInput.value.trim();
  const dateStr = dateInput.value;

  if(!title){ errEl.textContent = t('dl_err_title'); return; }
  if(!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){ errEl.textContent = t('dl_err_date'); return; }
  if(deadlines.length >= DL_MAX){ errEl.textContent = t('dl_err_max'); return; }

  deadlines.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    title,
    date: dateStr,
    done: false,
  });
  dlSave();

  titleInput.value = '';
  dateInput.value = '';
  document.querySelectorAll('#dl-quick-row .dl-quick-btn').forEach(btn => btn.classList.remove('selected'));
  dlRender();
}

function dlToggleDone(id){
  const item = deadlines.find(d => d.id === id);
  if(!item) return;
  item.done = !item.done;
  dlSave();
  dlRender();
}

function dlDelete(id){
  const idx = deadlines.findIndex(d => d.id === id);
  if(idx < 0) return;
  const [removed] = deadlines.splice(idx, 1);
  dlSave();
  dlRender();
  // 誤タップでも安心：確認ダイアログではなく「元に戻す」で救済
  showToast(t('toast_deleted'), t('toast_undo'), () => {
    deadlines.splice(Math.min(idx, deadlines.length), 0, removed);
    dlSave();
    dlRender();
  });
}

function dlClearExpired(){
  if(!deadlines.some(d => dlDiffDays(d.date) < 0)){ alert(t('dl_clear_expired_none')); return; }
  if(!confirm(t('dl_clear_expired_confirm'))) return;
  deadlines = deadlines.filter(d => dlDiffDays(d.date) >= 0);
  dlSave();
  dlRender();
}

function dlClearDone(){
  if(!deadlines.some(d => d.done)){ alert(t('dl_clear_done_none')); return; }
  if(!confirm(t('dl_clear_done_confirm'))) return;
  deadlines = deadlines.filter(d => !d.done);
  dlSave();
  dlRender();
}

function dlRenderSummary(){
  const box = document.getElementById('dl-summary');
  if(!box) return;
  const c = { overdue: 0, soon: 0, week: 0 };
  deadlines.forEach(d => {
    if(d.done) return;
    const diff = dlDiffDays(d.date);
    if(diff < 0) c.overdue++;
    else if(diff <= 3) c.soon++;
    else if(diff <= 7) c.week++;
  });
  box.hidden = !deadlines.length;
  box.innerHTML = [
    ['overdue', 'dl_sum_overdue'],
    ['soon',    'dl_sum_soon'],
    ['week',    'dl_sum_week'],
  ].map(([lv, key]) => `
    <div class="dl-sum dl-lv-${lv}${c[lv] ? ' has' : ''}">
      <span class="dl-sum-num">${c[lv]}</span>
      <span class="dl-sum-label">${escapeHtml(t(key))}</span>
    </div>`).join('');
}

function dlRender(){
  const list = document.getElementById('dl-list');
  if(!list) return;

  dlRenderSummary();

  if(!deadlines.length){
    list.innerHTML = `<div class="dl-empty">${t('dl_empty')}</div>`;
    return;
  }

  // 未完了を締め切りが近い順に、完了済みは下にまとめる
  const sorted = [...deadlines].sort((a, b) =>
    (a.done - b.done) || (dlParseDate(a.date) - dlParseDate(b.date)));

  list.innerHTML = sorted.map(item => {
    const diff = dlDiffDays(item.date);
    const lv = item.done ? 'done' : dlLevel(diff);
    const badge = item.done ? t('dl_done') : dlCountdownLabel(diff);
    const toggleLabel = item.done ? t('dl_mark_undone') : t('dl_mark_done');
    return `
      <div class="dl-item dl-lv-${lv}">
        <button type="button" class="dl-check" data-act="dl-done" data-id="${escapeHtml(item.id)}" aria-pressed="${item.done}" aria-label="${escapeHtml(toggleLabel)}" title="${escapeHtml(toggleLabel)}">
          <span class="material-icons">${item.done ? 'check_circle' : 'radio_button_unchecked'}</span>
        </button>
        <div class="dl-item-main">
          <span class="dl-item-title">${escapeHtml(item.title)}</span>
          <span class="dl-item-date">${escapeHtml(dlFormatDate(item.date))}</span>
        </div>
        <span class="dl-badge">${escapeHtml(badge)}</span>
        <button type="button" class="dl-delete-btn" data-act="dl-del" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('dl_remove'))}" title="${escapeHtml(t('dl_remove'))}">
          <span class="material-icons">delete_outline</span>
        </button>
      </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const dlTitleInput = document.getElementById('dl-title-input');
  if(dlTitleInput) dlTitleInput.addEventListener('keydown', e => { if(e.key === 'Enter') dlAdd(); });
  // 日付をカレンダーで変えたらクイックボタンの選択を解除
  const dlDateInput = document.getElementById('dl-date-input');
  if(dlDateInput) dlDateInput.addEventListener('change', () => {
    document.querySelectorAll('#dl-quick-row .dl-quick-btn').forEach(btn => btn.classList.remove('selected'));
  });
});

deadlines = dlLoad();
dlRender();

// 日付が変わったら（0時またぎ・スリープ復帰・iOSのタブ復元でも）残り日数を更新
let dlLastDay = dlTodayKey();
function dlRefreshIfDayChanged(force){
  const k = dlTodayKey();
  if(force || k !== dlLastDay){ dlLastDay = k; dlRender(); }
}
setInterval(() => dlRefreshIfDayChanged(false), 60 * 1000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) dlRefreshIfDayChanged(true); });
window.addEventListener('pageshow', () => dlRefreshIfDayChanged(true));

// ===== トースト（元に戻す） =====
let toastTimer = null, toastAction = null;
function showToast(msg, actionLabel, action){
  const el = document.getElementById('toast');
  if(!el) return;
  document.getElementById('toast-msg').textContent = msg;
  const btn = document.getElementById('toast-btn');
  btn.textContent = actionLabel || '';
  btn.hidden = !actionLabel;
  toastAction = action || null;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}
function hideToast(){
  const el = document.getElementById('toast');
  if(el) el.classList.remove('show');
  toastAction = null;
}

// ===== Liquid Glass：押したときのモーション =====
(function(){
  // iOS Safari で :active を有効にする
  document.addEventListener('touchstart', () => {}, { passive: true });

  const PRESS = '.search-btn,.dl-quick-btn,.dl-clear-expired-btn,.settings-btn,.set-nav-btn,.clock-move-btn,.dl-check,.dl-delete-btn,.tt-card,.toast-btn,.tab-btn,.set-row,.clock-remove-btn';
  const MIN_PRESS_MS = 160;   // 一瞬のタップでも沈み込みが見えるように最短時間を確保
  const active = new Map();

  document.addEventListener('pointerdown', e => {
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest(PRESS);
    if(!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', (e.clientX - r.left) + 'px');   // 光が指の位置に広がる
    el.style.setProperty('--py', (e.clientY - r.top) + 'px');
    el.classList.add('is-pressed');
    active.set(e.pointerId, { el, t: performance.now() });
  }, { passive: true });

  function release(e){
    const p = active.get(e.pointerId);
    if(!p) return;
    active.delete(e.pointerId);
    const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - p.t));
    setTimeout(() => p.el.classList.remove('is-pressed'), wait);
  }
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  // 指が外へスクロールしていった場合は即解除
  document.addEventListener('scroll', () => {
    active.forEach(p => p.el.classList.remove('is-pressed'));
    active.clear();
  }, { passive: true, capture: true });
})();

// ===== タブバー：選択中のガラスを押すと持ち上がり、指でなぞって隣へ移動 =====
(function(){
  const nav = document.querySelector('.sidebar nav');
  if(!nav) return;
  let dragging = false, moved = false, target = null, startX = 0;

  const tabs = () => Array.from(nav.querySelectorAll('.tab-btn'));
  function tabAt(x){
    const list = tabs();
    let best = list[0], bestD = Infinity;
    list.forEach(b => {
      const r = b.getBoundingClientRect();
      const d = x < r.left ? r.left - x : (x > r.right ? x - r.right : 0);
      if(d < bestD){ bestD = d; best = b; }
    });
    return best;
  }

  nav.addEventListener('pointerdown', e => {
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    const b = e.target.closest('.tab-btn');
    if(!b || b.dataset.tab !== currentTab) return;   // 選択中のタブを押したときだけ「持ち上がる」
    dragging = true; moved = false; target = b; startX = e.clientX;
    nav.classList.add('is-pressing');
  });
  document.addEventListener('pointermove', e => {
    if(!dragging) return;
    if(Math.abs(e.clientX - startX) > 6) moved = true;
    if(!moved) return;
    const b = tabAt(e.clientX);
    if(b && b !== target){ target = b; movePill(b.dataset.tab, false); }
  }, { passive: true });
  function end(){
    if(!dragging) return;
    dragging = false;
    nav.classList.remove('is-pressing');
    if(moved && target && target.dataset.tab !== currentTab){
      switchTab(target.dataset.tab, target);
      // 直後に発火する click が元のタブへ戻してしまうのを防ぐ
      const stop = ev => { ev.stopImmediatePropagation(); ev.preventDefault(); };
      document.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', stop, true), 80);
    } else {
      movePill(currentTab, false);
    }
  }
  document.addEventListener('pointerup', end, { passive: true });
  document.addEventListener('pointercancel', end, { passive: true });
})();

// Esc：サブページなら戻る、メインなら閉じる
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  const ov = document.getElementById('settings-modal-overlay');
  if(!ov || !ov.classList.contains('open')) return;
  if(document.querySelector('.settings-modal').classList.contains('pushed')) settingsShowPage('main');
  else closeSettingsModal();
});

// ===== クリック処理（インラインonclickの代わりにdata-actで一括処理） =====
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const d = el.dataset;
  switch(d.act){
    case 'tab': switchTab(d.tab, el); if(d.tab === 'deadline') dlRender(); break;
    case 'open-settings': openSettingsModal(); break;
    case 'close-settings': closeSettingsModal(); break;
    case 'overlay': if(e.target === el) closeSettingsModal(); break;
    case 'set-lang': setLang(d.lang); setTimeout(() => settingsShowPage('main'), 320); break;
    case 'settings-push': settingsShowPage(d.page); break;
    case 'settings-back': settingsShowPage('main'); break;
    case 'toggle-motion': toggleReduceMotion(); break;
    case 'toast-action': if(toastAction){ const f = toastAction; hideToast(); f(); } break;
    case 'search-weather': searchWeatherCity(); break;
    case 'search-clock': searchClockCity(); break;
    case 'tt-add': ttAddCustomSubject(); break;
    case 'tt-pick': ttHandlePaletteClick(d.ttId); break;
    case 'tt-del': ttRemoveCustomSubject(d.ttId); break;
    case 'tt-cell': ttHandleCellClick(d.day, +d.period); break;
    case 'tt-clear': ttClearCell(d.day, +d.period); break;
    case 'dl-quick': dlQuick(d.days); break;
    case 'dl-done': dlToggleDone(d.id); break;
    case 'dl-clear-done': dlClearDone(); break;
    case 'dl-add': dlAdd(); break;
    case 'dl-clear': dlClearExpired(); break;
    case 'clock-move': moveClock(d.clockId, d.dir === '-1' ? -1 : 1); break;
    case 'dl-del': dlDelete(d.id); break;
  }
});

// 初回表示
applyLang();
