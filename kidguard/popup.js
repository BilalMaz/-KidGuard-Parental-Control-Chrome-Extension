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
let keywords      = [];
let siteRules     = [];   // [{ url, mode: 'block'|'allow' }]
let blockedGenres = [];   // ['Gaming', 'Horror', ...]
let siteMode      = 'block';
let enabled       = true;

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
  const data    = await load(['keywords','enabled','siteRules','blockedGenres']);
  keywords      = data.keywords      || [];
  enabled       = data.enabled      !== false;
  siteRules     = data.siteRules     || [];
  blockedGenres = data.blockedGenres || [];

  renderKeywords();
  renderPresets();
  renderSiteRules();
  renderGenres();
  renderGenrePresets();
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
