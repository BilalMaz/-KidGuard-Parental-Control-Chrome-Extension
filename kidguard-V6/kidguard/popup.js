// popup.js — KidGuard v2: Keywords + Website Allow/Block

// ── SHA-256 ─────────────────────────────────────────────────────
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Storage ──────────────────────────────────────────────────────
function load(keys) { return new Promise(r => chrome.storage.sync.get(keys, r)); }
function save(obj)  { return new Promise(r => chrome.storage.sync.set(obj, r)); }

// ── State ────────────────────────────────────────────────────────
let keywords        = [];
let siteRules       = [];   // [{ url, mode: 'block'|'allow' }]
let blockedGenres   = [];   // ['Gaming', 'Horror', ...]
let timeLimits      = [];   // [{ url, limitMins, usedMins }]
let allowedChannels = [];   // [{ name, handle, id }]
let channelsEnabled = false;
let siteMode        = 'block';
let enabled         = true;

const PRESETS = ['sex','porn','nude','naked','adult','xxx','violence','gore','drugs','gambling'];

const GENRE_PRESETS = [
  'Gaming','Horror','Thriller','Action','Violence',
  'Adult Content','News','Politics','Gambling','Drugs',
  'Anime','Music','Comedy','Sports','Entertainment'
];

// ── Toast ────────────────────────────────────────────────────────
let _tt;
function toast(msg, type='ok') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show ' + type;
  clearTimeout(_tt); _tt = setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Screen ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ── Eye toggle ───────────────────────────────────────────────────
document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = document.getElementById(btn.dataset.t);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  });
});

// ── Password strength ────────────────────────────────────────────
function pwStrength(pw) {
  let s=0;
  if(pw.length>=6)s++;if(pw.length>=10)s++;
  if(/[A-Z]/.test(pw))s++;if(/[0-9]/.test(pw))s++;if(/[^A-Za-z0-9]/.test(pw))s++;
  return s;
}
function updateStrength(pw, fillId, textId) {
  const s = pwStrength(pw);
  const conf=[{w:0,c:'transparent',t:''},{w:20,c:'#ef4444',t:'Very Weak'},{w:40,c:'#f97316',t:'Weak'},{w:60,c:'#eab308',t:'Fair'},{w:80,c:'#84cc16',t:'Strong'},{w:100,c:'#22c55e',t:'Very Strong'}];
  const c = conf[s]||conf[0];
  const fill=document.getElementById(fillId); if(fill){fill.style.width=c.w+'%';fill.style.background=c.c;}
  const txt=document.getElementById(textId);  if(txt){txt.textContent=c.t;txt.style.color=c.c;}
}
document.getElementById('setup-pw').addEventListener('input', e => updateStrength(e.target.value,'setup-sf','setup-st'));

// ── Inline confirm (browser confirm() blocked in extension popups) ─
function showConfirm(message, onConfirm) {
  document.getElementById('kg-confirm')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'kg-confirm';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(7,9,15,.92);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:"Outfit",sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'background:#0d1117;border:1px solid #1e2a3a;border-radius:12px;padding:22px 20px;width:310px;text-align:center';
  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'font-size:13px;color:#94a3b8;line-height:1.6;margin-bottom:16px';
  msgEl.textContent = message;
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;justify-content:center';
  const btnNo = document.createElement('button');
  btnNo.textContent = 'Cancel'; btnNo.style.cssText = 'flex:1;padding:9px;border-radius:8px;background:none;border:1px solid #1e2a3a;color:#64748b;cursor:pointer;font-size:13px;font-family:inherit;font-weight:600';
  btnNo.addEventListener('click', () => overlay.remove());
  const btnYes = document.createElement('button');
  btnYes.textContent = 'Yes, Reset'; btnYes.style.cssText = 'flex:1;padding:9px;border-radius:8px;background:#ef4444;border:none;color:#fff;cursor:pointer;font-size:13px;font-family:inherit;font-weight:700';
  btnYes.addEventListener('click', () => { overlay.remove(); onConfirm(); });
  row.appendChild(btnNo); row.appendChild(btnYes);
  box.appendChild(msgEl); box.appendChild(row);
  overlay.appendChild(box); document.body.appendChild(overlay);
}

// ── Setup ────────────────────────────────────────────────────────
document.getElementById('setup-btn').addEventListener('click', async () => {
  const pw = document.getElementById('setup-pw').value;
  const cf = document.getElementById('setup-confirm').value;
  const errEl = document.getElementById('setup-err');
  if (pw.length < 6) { errEl.textContent='Min 6 characters.'; errEl.style.display='block'; return; }
  if (pw !== cf)      { errEl.textContent='Passwords do not match.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  await save({ passwordHash: await sha256(pw) });
  enterMain();
});
document.getElementById('setup-pw').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('setup-confirm').focus(); });
document.getElementById('setup-confirm').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('setup-btn').click(); });

// ── Login ────────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const pw = document.getElementById('login-pw').value;
  const errEl = document.getElementById('login-err');
  if (!pw) { errEl.style.display='block'; return; }
  const { passwordHash } = await load(['passwordHash']);
  if (await sha256(pw) === passwordHash) {
    errEl.style.display='none'; enterMain();
  } else {
    errEl.style.display='block';
    const inp = document.getElementById('login-pw');
    inp.classList.add('shake'); setTimeout(()=>inp.classList.remove('shake'),400);
    inp.value=''; inp.focus();
  }
});
document.getElementById('login-pw').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('login-btn').click(); });

// ── Forgot password ──────────────────────────────────────────────
// Forgot password feature removed;

// ── Lock ─────────────────────────────────────────────────────────
document.getElementById('lock-btn').addEventListener('click', () => {
  showScreen('login');
  document.getElementById('login-pw').value='';
  document.getElementById('login-err').style.display='none';
  setTimeout(()=>document.getElementById('login-pw').focus(),100);
});

// ── Global toggle ────────────────────────────────────────────────
document.getElementById('toggle-btn').addEventListener('click', async () => {
  enabled = !enabled;
  await save({ enabled });
  updateStatusUI();
  chrome.runtime.sendMessage({ type:'APPLY_RULES' });
  notifyYoutubeTabs();
  toast(enabled ? '✓ Protection ON' : 'Protection paused', enabled ? 'ok' : 'warn');
});

function updateStatusUI() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const btn  = document.getElementById('toggle-btn');
  if (enabled) {
    dot.className  = 'status-dot on';
    text.innerHTML = '<strong>Protection Active</strong> — All controls are ON';
    btn.textContent='Pause'; btn.className='toggle-btn on';
  } else {
    dot.className  = 'status-dot off';
    text.innerHTML = '<strong>Protection Paused</strong> — Controls are OFF';
    btn.textContent='Enable'; btn.className='toggle-btn off';
  }
}

// ── Tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-body').forEach(b=>b.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-'+tab.dataset.tab).classList.add('active');
  });
});

// ── Notify YouTube tabs ──────────────────────────────────────────
function notifyYoutubeTabs() {
  chrome.tabs.query({ url:['*://www.youtube.com/*','*://youtube.com/*'] }, tabs => {
    tabs.forEach(tab => chrome.scripting.executeScript({ target:{tabId:tab.id}, files:['content.js'] }).catch(()=>{}));
  });
}

// ══════════════════════════════════════════════════════════════════
// KEYWORDS TAB
// ══════════════════════════════════════════════════════════════════

function updateStatBadges() {
  // Use safe helper to avoid crashes if an element doesn't exist
  function set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  set('stat-kw',            keywords.length);
  set('stat-genres',        blockedGenres.length);
  set('stat-blocked-sites', siteRules.filter(s=>s.mode==='block').length);
  set('kw-count',           keywords.length);
  set('genre-count',        blockedGenres.length);
  set('site-count',         siteRules.length);
}

function renderKeywords() {
  updateStatBadges();
  const list = document.getElementById('kw-list');
  if (!keywords.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div>No keywords blocked yet.<br/>Add keywords above to start filtering.</div>';
    return;
  }
  list.innerHTML = '';
  keywords.forEach((kw, idx) => {
    const card = document.createElement('div'); card.className = 'item-card';
    const badge = document.createElement('span'); badge.className='item-badge block'; badge.textContent='BLOCKED';
    const kwText = document.createElement('span'); kwText.className='item-text'; kwText.textContent=kw;
    const del = document.createElement('button'); del.className='item-del'; del.textContent='✕'; del.title='Remove';
    del.addEventListener('click', async () => {
      const removed = keywords[idx];
      keywords.splice(idx,1);
      await save({ keywords });
      renderKeywords(); renderPresets(); notifyYoutubeTabs();
      toast('"'+removed+'" removed','warn');
    });
    card.appendChild(badge); card.appendChild(kwText); card.appendChild(del);
    list.appendChild(card);
  });
}

function renderPresets() {
  const row = document.getElementById('presets-row');
  row.innerHTML = '';
  PRESETS.forEach(p => {
    const chip = document.createElement('div');
    const added = keywords.includes(p);
    chip.className = 'preset-chip' + (added?' added':'');
    chip.textContent = added ? '✓ '+p : '+ '+p;
    if (!added) chip.addEventListener('click', () => addKeyword(p));
    row.appendChild(chip);
  });
}

async function addKeyword(raw) {
  const kw = (raw||'').trim().toLowerCase();
  if (!kw)              { toast('Enter a keyword','err'); return; }
  if (kw.length < 2)    { toast('Keyword too short','err'); return; }
  if (keywords.includes(kw)) { toast('"'+kw+'" already blocked','warn'); return; }
  keywords.push(kw);
  await save({ keywords });
  renderKeywords(); renderPresets(); notifyYoutubeTabs();
  toast('✓ "'+kw+'" blocked');
}

document.getElementById('add-kw-btn').addEventListener('click', () => {
  const inp = document.getElementById('kw-input');
  addKeyword(inp.value); inp.value=''; inp.focus();
});
document.getElementById('kw-input').addEventListener('keydown', e => {
  if (e.key==='Enter') { const inp=document.getElementById('kw-input'); addKeyword(inp.value); inp.value=''; }
});

// ══════════════════════════════════════════════════════════════════
// WEBSITES TAB
// ══════════════════════════════════════════════════════════════════

// Normalise URL input → hostname only
function normaliseUrl(raw) {
  let u = (raw||'').trim().toLowerCase();
  if (!u) return null;
  // strip protocol and path, keep hostname
  u = u.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (!u || !u.includes('.')) return null;
  return u;
}

// ── Mode buttons ─────────────────────────────────────────────────
document.getElementById('mode-block-btn').addEventListener('click', () => setSiteMode('block'));
document.getElementById('mode-allow-btn').addEventListener('click', () => setSiteMode('allow'));

function setSiteMode(mode) {
  siteMode = mode;
  const blockBtn = document.getElementById('mode-block-btn');
  const allowBtn = document.getElementById('mode-allow-btn');
  blockBtn.className = 'mode-btn' + (mode==='block' ? ' active-block' : '');
  allowBtn.className = 'mode-btn' + (mode==='allow' ? ' active-allow' : '');
  // Update add button colour
  document.getElementById('add-site-btn').className = 'add-btn' + (mode==='allow' ? ' green' : '');
  document.getElementById('add-site-btn').textContent = mode==='allow' ? '+ Allow' : '+ Block';
}

// ── Render site list ─────────────────────────────────────────────
function renderSiteRules() {
  updateStatBadges();
  const list = document.getElementById('site-list');
  if (!siteRules.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🌐</div>No websites added yet.<br/>Add a site above and choose Block or Allow mode.</div>';
    return;
  }
  list.innerHTML = '';
  siteRules.forEach((site, idx) => {
    const card = document.createElement('div'); card.className = 'item-card';

    const badge = document.createElement('span');
    badge.className = 'item-badge ' + site.mode;
    badge.textContent = site.mode === 'block' ? '🚫 BLOCKED' : '✅ ALLOWED';

    const siteText = document.createElement('span'); siteText.className='item-text'; siteText.textContent=site.url;

    // Toggle button to flip block↔allow
    const flipBtn = document.createElement('button');
    flipBtn.style.cssText = 'width:54px;height:22px;border-radius:5px;background:none;border:1px solid var(--border);color:var(--muted);cursor:pointer;font-size:10px;font-weight:700;font-family:inherit;flex-shrink:0;transition:all .18s;margin-right:4px';
    flipBtn.textContent = site.mode === 'block' ? '→ Allow' : '→ Block';
    flipBtn.title = 'Switch to ' + (site.mode==='block' ? 'allow' : 'block');
    flipBtn.addEventListener('mouseover', () => { flipBtn.style.borderColor = site.mode==='block' ? 'var(--green)' : 'var(--red)'; flipBtn.style.color = site.mode==='block' ? 'var(--green)' : 'var(--red)'; });
    flipBtn.addEventListener('mouseout',  () => { flipBtn.style.borderColor='var(--border)'; flipBtn.style.color='var(--muted)'; });
    flipBtn.addEventListener('click', async () => {
      siteRules[idx].mode = siteRules[idx].mode === 'block' ? 'allow' : 'block';
      await save({ siteRules });
      chrome.runtime.sendMessage({ type:'APPLY_RULES' });
      renderSiteRules();
      toast(site.url+' → '+siteRules[idx].mode+'ed','ok');
    });

    const del = document.createElement('button'); del.className='item-del'; del.textContent='✕'; del.title='Remove';
    del.addEventListener('click', async () => {
      const removed = siteRules[idx].url;
      siteRules.splice(idx,1);
      await save({ siteRules });
      chrome.runtime.sendMessage({ type:'APPLY_RULES' });
      renderSiteRules();
      toast(removed+' removed','warn');
    });

    card.appendChild(badge); card.appendChild(siteText); card.appendChild(flipBtn); card.appendChild(del);
    list.appendChild(card);
  });
}

// ── Add site ─────────────────────────────────────────────────────
document.getElementById('add-site-btn').addEventListener('click', () => addSite());
document.getElementById('site-input').addEventListener('keydown', e => { if(e.key==='Enter') addSite(); });

async function addSite() {
  const inp = document.getElementById('site-input');
  const url = normaliseUrl(inp.value);
  if (!url) { toast('Invalid URL — enter like tiktok.com','err'); return; }
  if (siteRules.find(s => s.url===url)) { toast(url+' already in list','warn'); return; }

  siteRules.push({ url, mode: siteMode });
  await save({ siteRules });
  chrome.runtime.sendMessage({ type:'APPLY_RULES' });
  renderSiteRules();
  inp.value=''; inp.focus();
  toast('✓ '+url+' '+(siteMode==='block'?'blocked':'allowed'));
}

// ══════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════

async function enterMain() {
  const data      = await load(['keywords','enabled','siteRules','blockedGenres','timeLimits','allowedChannels','channelsEnabled']);
  keywords        = data.keywords        || [];
  enabled         = data.enabled        !== false;
  siteRules       = data.siteRules       || [];
  blockedGenres   = data.blockedGenres   || [];
  timeLimits      = data.timeLimits      || [];
  allowedChannels = data.allowedChannels || [];
  channelsEnabled = data.channelsEnabled || false;

  renderKeywords();
  renderPresets();
  renderSiteRules();
  renderGenres();
  renderGenrePresets();
  renderTimeLimits();
  renderChannels();
  updateStatusUI();
  setSiteMode('block');
  showScreen('main');
  setTimeout(() => document.getElementById('kw-input')?.focus(), 150);
}


// ══════════════════════════════════════════════════════════════════
// GENRES TAB
// ══════════════════════════════════════════════════════════════════

function renderGenrePresets() {
  const row = document.getElementById('genre-presets');
  if (!row) return;
  row.innerHTML = '';
  GENRE_PRESETS.forEach(g => {
    const chip    = document.createElement('div');
    const added   = blockedGenres.map(x=>x.toLowerCase()).includes(g.toLowerCase());
    chip.className = 'preset-chip' + (added ? ' added' : '');
    chip.textContent = added ? '✓ ' + g : '+ ' + g;
    if (!added) chip.addEventListener('click', () => addGenre(g));
    row.appendChild(chip);
  });
}

function renderGenres() {
  const list    = document.getElementById('genre-list');
  const countEl = document.getElementById('genre-count');
  if (!list) return;
  if (countEl) countEl.textContent = blockedGenres.length;

  // Update stats badge
  const statEl = document.getElementById('stat-genres');
  if (statEl) statEl.textContent = blockedGenres.length;

  if (!blockedGenres.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🎬</div>No genres blocked yet.<br/>Select from the quick list or type a genre above.</div>';
    return;
  }
  list.innerHTML = '';
  blockedGenres.forEach((genre, idx) => {
    const card  = document.createElement('div'); card.className = 'item-card';
    const badge = document.createElement('span'); badge.className = 'item-badge block'; badge.textContent = 'BLOCKED';
    const text  = document.createElement('span'); text.className = 'item-text'; text.textContent = genre;
    const del   = document.createElement('button'); del.className = 'item-del'; del.textContent = '✕'; del.title = 'Remove';
    del.addEventListener('click', async () => {
      const removed = blockedGenres[idx];
      blockedGenres.splice(idx, 1);
      await save({ blockedGenres });
      notifyYoutubeTabs();
      renderGenres();
      renderGenrePresets();
      toast('"' + removed + '" genre unblocked', 'warn');
    });
    card.appendChild(badge); card.appendChild(text); card.appendChild(del);
    list.appendChild(card);
  });
}

async function addGenre(raw) {
  const genre = (raw || '').trim();
  if (!genre) { toast('Enter a genre name', 'err'); return; }
  if (blockedGenres.map(g=>g.toLowerCase()).includes(genre.toLowerCase())) {
    toast('"' + genre + '" already blocked', 'warn'); return;
  }
  blockedGenres.push(genre);
  await save({ blockedGenres });
  notifyYoutubeTabs();
  renderGenres();
  renderGenrePresets();
  const inp = document.getElementById('genre-input');
  if (inp) inp.value = '';
  toast('✓ "' + genre + '" genre blocked');
}

document.getElementById('add-genre-btn').addEventListener('click', () => {
  const inp = document.getElementById('genre-input');
  if (inp) { addGenre(inp.value); inp.value = ''; inp.focus(); }
});
document.getElementById('genre-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const inp = document.getElementById('genre-input');
    if (inp) { addGenre(inp.value); inp.value = ''; }
  }
});



// ══════════════════════════════════════════════════════════════════
// SCREEN TIME TAB
// ══════════════════════════════════════════════════════════════════

const ST_PRESETS = ['youtube.com','tiktok.com','instagram.com','facebook.com','twitter.com','roblox.com','minecraft.net'];

// Format minutes → "1h 30m" or "45m"
function fmtMins(mins) {
  if (!mins && mins !== 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? h + 'h ' + m + 'm' : h + 'h') : m + 'm';
}

// Get today's date string YYYY-MM-DD
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Get or reset daily usage for a site
async function getUsage(url) {
  const key = 'usage_' + url;
  const data = await load([key]);
  const rec  = data[key];
  // If no record or it's from a previous day, return 0
  if (!rec || rec.date !== todayStr()) return 0;
  return rec.mins || 0;
}

async function setUsage(url, mins) {
  const key = 'usage_' + url;
  const obj = {};
  obj[key] = { date: todayStr(), mins };
  await save(obj);
}

// Render the screen time tab — uses DOM API only (no template literals)
async function renderTimeLimits() {
  const list    = document.getElementById('st-list');
  const countEl = document.getElementById('st-count');
  if (!list) return;
  if (countEl) countEl.textContent = timeLimits.length;
  renderStPresets();

  if (!timeLimits.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">&#x23F1;</div>No time limits set yet.<br/>Add a website above to set a daily limit.</div>';
    return;
  }

  list.innerHTML = '';

  for (var idx = 0; idx < timeLimits.length; idx++) {
    var tl        = timeLimits[idx];
    var usedMins  = await getUsage(tl.url);
    var limitMins = tl.limitMins || 60;
    var pct       = Math.min(100, Math.round((usedMins / limitMins) * 100));
    var isOver    = usedMins >= limitMins;
    var isWarn    = pct >= 80 && !isOver;
    var barColor  = isOver ? 'var(--red)' : isWarn ? 'var(--amber)' : 'var(--green)';
    var statusTxt = isOver ? 'Limit reached' : isWarn ? 'Almost up' : 'Active';

    // Card
    var card = document.createElement('div');
    card.className = 'st-card';

    // ── Top row ──────────────────────────────────────────────────
    var top = document.createElement('div');
    top.className = 'st-card-top';

    var favDiv = document.createElement('div');
    favDiv.className = 'st-site-icon';
    var favImg = document.createElement('img');
    favImg.src = 'https://www.google.com/s2/favicons?domain=' + tl.url + '&sz=32';
    favImg.addEventListener('error', function() { this.parentElement.textContent = '🌐'; });
    favDiv.appendChild(favImg);

    var nameSpan = document.createElement('span');
    nameSpan.className = 'st-site-name';
    nameSpan.textContent = tl.url;

    var statusSpan = document.createElement('span');
    statusSpan.style.cssText = 'font-size:10px;font-weight:600;flex-shrink:0;color:' + barColor;
    statusSpan.textContent = statusTxt;

    var delBtn = document.createElement('button');
    delBtn.className = 'st-del';
    delBtn.dataset.idx = String(idx);
    delBtn.title = 'Remove';
    delBtn.textContent = 'x';

    top.appendChild(favDiv);
    top.appendChild(nameSpan);
    top.appendChild(statusSpan);
    top.appendChild(delBtn);

    // ── Progress bar ──────────────────────────────────────────────
    var progWrap = document.createElement('div');
    progWrap.className = 'st-progress-wrap';

    var progBar = document.createElement('div');
    progBar.className = 'st-progress-bar';

    var progFill = document.createElement('div');
    progFill.className = 'st-progress-fill';
    progFill.style.width = pct + '%';
    progFill.style.background = barColor;
    progBar.appendChild(progFill);

    var progLabels = document.createElement('div');
    progLabels.className = 'st-progress-labels';

    var usedLabel = document.createElement('span');
    usedLabel.className = 'st-progress-used';
    usedLabel.style.color = barColor;
    usedLabel.textContent = fmtMins(usedMins) + ' used';

    var limitLabel = document.createElement('span');
    limitLabel.className = 'st-progress-limit';
    limitLabel.textContent = 'limit: ' + fmtMins(limitMins);

    progLabels.appendChild(usedLabel);
    progLabels.appendChild(limitLabel);
    progWrap.appendChild(progBar);
    progWrap.appendChild(progLabels);

    // ── Limit edit row ────────────────────────────────────────────
    var limitRow = document.createElement('div');
    limitRow.className = 'st-limit-row';

    var lbl = document.createElement('span');
    lbl.className = 'st-limit-label';
    lbl.textContent = 'Daily limit:';

    var hInput = document.createElement('input');
    hInput.type = 'number'; hInput.className = 'st-limit-input';
    hInput.dataset.idx = String(idx);
    hInput.value = String(Math.floor(limitMins / 60) || 0);
    hInput.min = '0'; hInput.max = '23'; hInput.title = 'Hours';

    var hUnit = document.createElement('span');
    hUnit.className = 'st-limit-unit'; hUnit.textContent = 'h';

    var mInput = document.createElement('input');
    mInput.type = 'number'; mInput.className = 'st-limit-input';
    mInput.dataset.idx = String(idx);
    mInput.value = String(limitMins % 60);
    mInput.min = '0'; mInput.max = '59'; mInput.title = 'Minutes';

    var mUnit = document.createElement('span');
    mUnit.className = 'st-limit-unit'; mUnit.textContent = 'm';

    var saveBtn = document.createElement('button');
    saveBtn.className = 'st-save-btn';
    saveBtn.dataset.idx = String(idx);
    saveBtn.textContent = 'Save';

    var resetBtn = document.createElement('button');
    resetBtn.className = 'st-reset-btn';
    resetBtn.dataset.idx = String(idx);
    resetBtn.style.marginLeft = '6px';
    resetBtn.textContent = 'Reset today';

    limitRow.appendChild(lbl);
    limitRow.appendChild(hInput);
    limitRow.appendChild(hUnit);
    limitRow.appendChild(mInput);
    limitRow.appendChild(mUnit);
    limitRow.appendChild(saveBtn);
    limitRow.appendChild(resetBtn);

    // Assemble card
    card.appendChild(top);
    card.appendChild(progWrap);
    card.appendChild(limitRow);
    list.appendChild(card);
  }

  // Wire delete buttons
  list.querySelectorAll('.st-del').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var i   = parseInt(btn.dataset.idx);
      var url = timeLimits[i].url;
      timeLimits.splice(i, 1);
      await save({ timeLimits });
      chrome.runtime.sendMessage({ type: 'APPLY_TIME_LIMITS' });
      renderTimeLimits();
      toast(url + ' time limit removed', 'warn');
    });
  });

  // Wire save buttons
  list.querySelectorAll('.st-save-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var i      = parseInt(btn.dataset.idx);
      var inputs = btn.closest('.st-card').querySelectorAll('.st-limit-input');
      var hours  = parseInt(inputs[0].value) || 0;
      var mins   = parseInt(inputs[1].value) || 0;
      var total  = (hours * 60) + mins;
      if (total < 1) { toast('Set at least 1 minute', 'err'); return; }
      timeLimits[i].limitMins = total;
      await save({ timeLimits });
      chrome.runtime.sendMessage({ type: 'APPLY_TIME_LIMITS' });
      renderTimeLimits();
      toast('Saved: ' + timeLimits[i].url + ' = ' + fmtMins(total) + ' per day');
    });
  });

  // Wire reset buttons
  list.querySelectorAll('.st-reset-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var i   = parseInt(btn.dataset.idx);
      var url = timeLimits[i].url;
      await setUsage(url, 0);
      chrome.runtime.sendMessage({ type: 'RESET_USAGE', url: url });
      renderTimeLimits();
      toast(url + ' usage reset', 'ok');
    });
  });
}



// Render quick-add preset chips
function renderStPresets() {
  const row = document.getElementById('st-presets-row');
  if (!row) return;
  row.innerHTML = '';
  ST_PRESETS.forEach(site => {
    const added = timeLimits.some(t => t.url === site);
    const chip  = document.createElement('div');
    chip.className = 'st-chip' + (added ? ' added' : '');
    chip.style.cssText = added ? 'border-color:rgba(245,158,11,.3);color:var(--amber);background:rgba(245,158,11,.06);cursor:default' : '';
    chip.textContent = added ? '✓ ' + site : '+ ' + site;
    if (!added) chip.addEventListener('click', () => addTimeLimit(site));
    row.appendChild(chip);
  });
}

// Add a new time limit entry
async function addTimeLimit(rawUrl) {
  let url = (rawUrl || document.getElementById('st-site-input')?.value || '').trim().toLowerCase();
  url = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!url || !url.includes('.')) { toast('Enter a valid domain like youtube.com', 'err'); return; }
  if (timeLimits.some(t => t.url === url)) { toast(url + ' already has a limit', 'warn'); return; }

  timeLimits.push({ url, limitMins: 60 }); // default 60 min
  await save({ timeLimits });
  chrome.runtime.sendMessage({ type: 'APPLY_TIME_LIMITS' });
  const inp = document.getElementById('st-site-input');
  if (inp) inp.value = '';
  renderTimeLimits();
  toast('✓ ' + url + ' — 1 hour daily limit set (adjust below)');
}

document.getElementById('st-add-btn').addEventListener('click', () => addTimeLimit());
document.getElementById('st-site-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTimeLimit();
});



// ══════════════════════════════════════════════════════════════════
// CHANNELS TAB — Allowed Channels Only
// ══════════════════════════════════════════════════════════════════

// Educational channel presets
const CHANNEL_PRESETS = [
  { name: 'Khan Academy',        handle: '@khanacademy',        id: 'UC4a-Gbdw7vOaccHmFo40b9g' },
  { name: 'National Geographic', handle: '@NatGeo',             id: 'UCpVm7bg6pXKo1Pr6k5kxG9A' },
  { name: 'CrashCourse',         handle: '@crashcourse',        id: 'UCX6b17PVsYBQ0ip5gyeme-Q' },
  { name: 'TED-Ed',              handle: '@TED-Ed',             id: 'UCsooa4yRKGN_zEE8iknghZA' },
  { name: 'SciShow',             handle: '@SciShow',            id: 'UCZYTClx2T1of7BRZ86-8fow' },
  { name: 'PBS Space Time',      handle: '@pbsspacetime',       id: 'UC7_gcs09iThXybpVgjHZ_7g' },
  { name: 'Kurzgesagt',          handle: '@kurzgesagt',         id: 'UCsXVk37bltHxD1rDPwtNM8Q' },
  { name: 'BBC Earth',           handle: '@BBCEarth',           id: 'UCwmZiChSryoWQCZMIQezgTg' },
];

// Parse a raw input into a channel object
function parseChannelInput(raw) {
  raw = raw.trim();
  if (!raw) return null;

  // YouTube URL patterns
  // https://www.youtube.com/@handle
  // https://www.youtube.com/channel/UCxxxx
  // https://www.youtube.com/c/name
  // https://www.youtube.com/user/name
  const handleMatch  = raw.match(/youtube\.com\/@([\w.-]+)/i) || raw.match(/^@([\w.-]+)$/);
  const channelMatch = raw.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  const cMatch       = raw.match(/youtube\.com\/(?:c|user)\/([\w.-]+)/i);

  if (handleMatch)  return { name: '@' + handleMatch[1],  handle: '@' + handleMatch[1].toLowerCase(),  id: '' };
  if (channelMatch) return { name: channelMatch[1],        handle: '',                                  id: channelMatch[1] };
  if (cMatch)       return { name: cMatch[1],              handle: '@' + cMatch[1].toLowerCase(),       id: '' };

  // Plain text — treat as channel name / handle
  const clean = raw.replace(/^@/, '');
  return { name: raw.startsWith('@') ? raw : clean, handle: '@' + clean.toLowerCase(), id: '' };
}

// Check if a channel matches any in the allowed list
function channelIsAllowed(channelName, channelHandle, channelId) {
  if (!allowedChannels.length) return true; // empty list = allow all
  return allowedChannels.some(ch => {
    if (ch.id && channelId && ch.id === channelId) return true;
    if (ch.handle && channelHandle && ch.handle.toLowerCase() === channelHandle.toLowerCase()) return true;
    if (ch.name && channelName && ch.name.toLowerCase() === channelName.toLowerCase()) return true;
    return false;
  });
}

// Render the channels toggle + list
function renderChannels() {
  // Master toggle
  const toggle   = document.getElementById('ch-enabled-toggle');
  const toggleSub = document.getElementById('ch-toggle-sub');
  if (toggle) {
    toggle.checked = channelsEnabled;
    if (toggleSub) {
      toggleSub.textContent = channelsEnabled
        ? 'Enabled — only approved channels allowed'
        : 'Disabled — all channels accessible';
    }
  }

  // Count
  const countEl = document.getElementById('ch-count');
  if (countEl) countEl.textContent = allowedChannels.length;

  // Presets
  renderChannelPresets();

  // List
  const list = document.getElementById('ch-list');
  if (!list) return;

  if (!allowedChannels.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">&#x1F4FA;</div>No channels added yet.<br/>Add channels below or use the educational presets.</div>';
    return;
  }

  list.innerHTML = '';
  allowedChannels.forEach(function(ch, idx) {
    var card = document.createElement('div');
    card.className = 'ch-card';

    var avatar = document.createElement('div');
    avatar.className = 'ch-avatar';
    // Try to load channel favicon from YouTube
    if (ch.handle) {
      var img = document.createElement('img');
      img.src = 'https://www.google.com/s2/favicons?domain=youtube.com&sz=32';
      img.addEventListener('error', function() { avatar.textContent = 'YT'; });
      avatar.appendChild(img);
    } else {
      avatar.textContent = (ch.name || '?')[0].toUpperCase();
    }

    var info = document.createElement('div');
    info.className = 'ch-info';

    var name = document.createElement('div');
    name.className = 'ch-name';
    name.textContent = ch.name || ch.handle || ch.id;

    var handle = document.createElement('div');
    handle.className = 'ch-handle';
    handle.textContent = ch.handle || (ch.id ? 'ID: ' + ch.id : '');

    info.appendChild(name);
    if (handle.textContent) info.appendChild(handle);

    var del = document.createElement('button');
    del.className = 'ch-del';
    del.textContent = 'x';
    del.title = 'Remove';
    del.dataset.idx = String(idx);
    del.addEventListener('click', async function() {
      var i = parseInt(del.dataset.idx);
      var removed = allowedChannels[i].name;
      allowedChannels.splice(i, 1);
      await save({ allowedChannels });
      notifyYoutubeTabs();
      renderChannels();
      toast('"' + removed + '" removed from allowed list', 'warn');
    });

    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(del);
    list.appendChild(card);
  });
}

function renderChannelPresets() {
  var row = document.getElementById('ch-presets-row');
  if (!row) return;
  row.innerHTML = '';
  CHANNEL_PRESETS.forEach(function(preset) {
    var added = allowedChannels.some(function(ch) {
      return ch.handle === preset.handle || ch.id === preset.id || ch.name === preset.name;
    });
    var chip = document.createElement('div');
    chip.className = 'ch-chip' + (added ? ' added' : '');
    chip.textContent = added ? '✓ ' + preset.name : '+ ' + preset.name;
    if (!added) {
      chip.addEventListener('click', function() { addChannel(null, preset); });
    }
    row.appendChild(chip);
  });
}

async function addChannel(raw, preset) {
  var ch = preset || parseChannelInput(raw || document.getElementById('ch-input').value);
  if (!ch) { toast('Enter a channel name or URL', 'err'); return; }

  // Check duplicate
  var dup = allowedChannels.some(function(existing) {
    return (ch.handle && existing.handle === ch.handle) ||
           (ch.id     && existing.id     === ch.id)     ||
           (ch.name   && existing.name   === ch.name);
  });
  if (dup) { toast('"' + (ch.name || ch.handle) + '" already in list', 'warn'); return; }

  allowedChannels.push(ch);
  await save({ allowedChannels });
  notifyYoutubeTabs();
  var inp = document.getElementById('ch-input');
  if (inp) inp.value = '';
  renderChannels();
  toast('✓ "' + (ch.name || ch.handle) + '" added to allowed channels');
}

// Master toggle listener
document.getElementById('ch-enabled-toggle').addEventListener('change', async function() {
  channelsEnabled = this.checked;
  await save({ channelsEnabled });
  notifyYoutubeTabs();
  renderChannels();
  toast(channelsEnabled ? '✓ Channel filter ON — only allowed channels accessible' : 'Channel filter OFF', channelsEnabled ? 'ok' : 'warn');
});

// Add button
document.getElementById('ch-add-btn').addEventListener('click', function() {
  addChannel(document.getElementById('ch-input').value);
});
document.getElementById('ch-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') addChannel(document.getElementById('ch-input').value);
});


(async function init() {
  const { passwordHash } = await load(['passwordHash']);
  if (!passwordHash) {
    showScreen('setup');
    setTimeout(() => document.getElementById('setup-pw')?.focus(), 100);
  } else {
    showScreen('login');
    setTimeout(() => document.getElementById('login-pw')?.focus(), 100);
  }
})();
