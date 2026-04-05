// background.js — KidGuard v3.1
// FIXED: Website blocking now uses webNavigation (reliable) instead of
// declarativeNetRequest (which had broken urlFilter syntax).

// ── Init ─────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['keywords','enabled','siteRules','blockedGenres'], (r) => {
    if (!r.keywords)              chrome.storage.sync.set({ keywords: [] });
    if (r.enabled === undefined)  chrome.storage.sync.set({ enabled: true });
    if (!r.siteRules)             chrome.storage.sync.set({ siteRules: [] });
    if (!r.blockedGenres)         chrome.storage.sync.set({ blockedGenres: [] });
  });
});

// ── Helpers ───────────────────────────────────────────────────────
const titleCache = new Map();

async function fetchVideoTitle(videoId) {
  if (titleCache.has(videoId)) return titleCache.get(videoId);
  try {
    const res  = await fetch('https://noembed.com/embed?url=https://www.youtube.com/watch?v=' + videoId, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const title = data.title || '';
    titleCache.set(videoId, title);
    return title;
  } catch { return ''; }
}

function containsBlocked(text, keywords) {
  if (!text || !keywords || !keywords.length) return null;
  const lower = text.toLowerCase();
  return keywords.find(k => lower.includes(k)) || null;
}

// Normalise a stored site URL to plain hostname (strip protocol, www, path)
function toHostname(siteUrl) {
  return siteUrl.toLowerCase()
    .replace(/^https?:\/\//,'')
    .replace(/^www\./,'')
    .split('/')[0]
    .trim();
}

// Check if a full URL's hostname matches a stored site rule
function urlMatchesSite(fullUrl, siteUrl) {
  try {
    const host    = new URL(fullUrl).hostname.toLowerCase().replace(/^www\./,'');
    const pattern = toHostname(siteUrl);
    // Exact match OR subdomain match (e.g. sub.z-library.sk)
    return host === pattern || host.endsWith('.' + pattern);
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
// WEBSITE BLOCKING — via webNavigation (reliable, fires before page loads)
// ═══════════════════════════════════════════════════════════════

function handleNavigation(details) {
  if (details.frameId !== 0) return; // main frame only

  const url = details.url;

  // Skip extension pages, chrome:// pages, etc.
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  // Skip our own blocked.html to prevent redirect loop
  if (url.startsWith(chrome.runtime.getURL(''))) return;

  chrome.storage.sync.get(['siteRules', 'enabled'], (data) => {
    if (!data.enabled) return;
    const rules = data.siteRules || [];

    // ── ALLOW-ONLY MODE ──────────────────────────────────────────
    // If any rule is 'allow', we are in allowlist mode
    const hasAllowRules = rules.some(s => s.mode === 'allow');

    if (hasAllowRules) {
      // Check if this URL is in the allow list
      const isAllowed = rules.some(s => s.mode === 'allow' && urlMatchesSite(url, s.url));
      // Always allow youtube.com when keywords are configured (it's filtered differently)
      const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');

      if (!isAllowed && !isYoutube) {
        const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();
        chrome.tabs.update(details.tabId, {
          url: chrome.runtime.getURL('blocked.html') +
               '?site=' + encodeURIComponent(hostname) +
               '&reason=notallowed'
        });
        return;
      }
      return; // URL is allowed — do nothing
    }

    // ── BLOCK MODE ───────────────────────────────────────────────
    const blockedSite = rules.find(s => s.mode === 'block' && urlMatchesSite(url, s.url));
    if (blockedSite) {
      chrome.tabs.update(details.tabId, {
        url: chrome.runtime.getURL('blocked.html') +
             '?site=' + encodeURIComponent(blockedSite.url) +
             '&reason=blocked'
      });
    }
  });
}

// Fire on both fresh navigations AND in-page navigations (SPA, back/forward)
chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(handleNavigation);

// ═══════════════════════════════════════════════════════════════
// YOUTUBE VIDEO BLOCKING — via webNavigation + oEmbed title fetch
// ═══════════════════════════════════════════════════════════════

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!details.url.includes('youtube.com/watch')) return;

  const { keywords, enabled } = await chrome.storage.sync.get(['keywords','enabled']);
  if (!enabled || !keywords?.length) return;

  const params  = new URL(details.url).searchParams;
  const videoId = params.get('v');
  if (!videoId) return;

  // Check search query in URL
  const sq = params.get('search_query') || '';
  const bsq = containsBlocked(sq, keywords);
  if (bsq) {
    chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL('blocked.html') + '?keyword=' + encodeURIComponent(bsq) + '&context=search' });
    return;
  }

  // Fetch video title and check
  const title = await fetchVideoTitle(videoId);
  const bt = containsBlocked(title, keywords);
  if (bt) {
    chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL('blocked.html') + '?keyword=' + encodeURIComponent(bt) + '&context=video&title=' + encodeURIComponent(title.slice(0,60)) });
  }
}, { url: [{ hostContains: 'youtube.com' }] });

// SPA navigation within YouTube
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!details.url.includes('youtube.com/watch')) return;

  const { keywords, enabled } = await chrome.storage.sync.get(['keywords','enabled']);
  if (!enabled || !keywords?.length) return;

  const videoId = new URL(details.url).searchParams.get('v');
  if (!videoId) return;

  const title   = await fetchVideoTitle(videoId);
  const blocked = containsBlocked(title, keywords);
  if (blocked) {
    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: (kw, vt) => {
        window.__kgBlockNow = { keyword: kw, title: vt };
        window.dispatchEvent(new CustomEvent('__kgBlock', { detail: { keyword: kw, title: vt } }));
      },
      args: [blocked, title]
    }).catch(() => {});
  }
}, { url: [{ hostContains: 'youtube.com' }] });

// ── Re-inject YouTube content script ──────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com')) {
    chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
  }
});

// ── Storage changes ────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.keywords) titleCache.clear();
  // No need to call applyNetRules anymore — webNavigation reads live from storage
});

// ── Message listener ───────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'APPLY_RULES') {
    // No-op now — rules apply automatically via webNavigation reading storage
    sendResponse({ ok: true });
  }
  if (msg.type === 'CHECK_VIDEO') {
    (async () => {
      const { keywords, enabled } = await chrome.storage.sync.get(['keywords','enabled']);
      if (!enabled || !keywords?.length) { sendResponse({ blocked: false }); return; }
      const title   = await fetchVideoTitle(msg.videoId);
      const blocked = containsBlocked(title, keywords);
      sendResponse({ blocked: !!blocked, keyword: blocked, title });
    })();
    return true;
  }
  return true;
});
