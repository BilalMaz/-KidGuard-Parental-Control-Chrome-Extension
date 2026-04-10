// content.js — KidGuard v3: YouTube content blocker
// Runs at document_start so we can intercept before anything renders

(function () {
  'use strict';
  if (window.__kidguardActive) return;
  window.__kidguardActive = true;

  let keywords        = [];
  let enabled         = true;
  let allowedChannels = [];
  let channelsEnabled = false;
  let feedObserver    = null;

  // ── CSS injected once ────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('kg-style')) return;
    const s = document.createElement('style');
    s.id = 'kg-style';
    s.textContent = [
      '#kg-overlay{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(160deg,#07090f,#0d1a2e);display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Arial,sans-serif}',
      '.kg-box{background:#111827;border:1px solid #1f2d45;border-radius:20px;padding:44px 44px 36px;text-align:center;max-width:480px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.8);animation:kgIn .3s cubic-bezier(.34,1.56,.64,1)}',
      '@keyframes kgIn{from{opacity:0;transform:scale(.88) translateY(18px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '.kg-icon{font-size:54px;margin-bottom:14px}',
      '.kg-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-bottom:14px}',
      '.kg-title{font-size:24px;font-weight:800;color:#f1f5f9;margin-bottom:10px;letter-spacing:-.3px}',
      '.kg-video-title{font-size:13px;color:#64748b;font-style:italic;margin-bottom:6px}',
      '.kg-msg{font-size:14px;color:#94a3b8;line-height:1.7;margin-bottom:6px}',
      '.kg-kw{display:inline-block;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);color:#f87171;border-radius:6px;padding:3px 12px;font-weight:700;font-size:13px;margin:6px 0 4px}',
      '.kg-sub{font-size:12px;color:#475569;line-height:1.6;margin:12px 0 26px}',
      '.kg-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
      '.kg-btn{padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid #334155;background:#1e293b;color:#94a3b8;font-family:inherit;transition:all .2s}',
      '.kg-btn:hover{background:#273449;color:#e2e8f0;transform:translateY(-1px)}',
      '.kg-btn-red{background:#ef4444!important;color:#fff!important;border-color:#ef4444!important}',
      '.kg-btn-red:hover{background:#dc2626!important;box-shadow:0 4px 14px rgba(239,68,68,.35)!important}',
      // Feed card hide rule
      '.kg-hidden-card{visibility:hidden!important;height:0!important;min-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:none!important;pointer-events:none!important}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Load settings ─────────────────────────────────────────────────
  function loadSettings(cb) {
    chrome.storage.sync.get(['keywords', 'enabled', 'allowedChannels', 'channelsEnabled'], (r) => {
      keywords        = (r.keywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
      enabled         = r.enabled !== false;
      allowedChannels = r.allowedChannels || [];
      channelsEnabled = r.channelsEnabled || false;
      if (cb) cb();
    });
  }

  // ── Check keyword match ────────────────────────────────────────────
  function containsBlocked(text) {
    if (!text || !keywords.length) return null;
    const lower = text.toLowerCase();
    return keywords.find(k => lower.includes(k)) || null;
  }

  // ── Show full-screen block overlay ────────────────────────────────
  function showBlockOverlay(keyword, context, videoTitle) {
    if (document.getElementById('kg-overlay')) return;
    injectStyles();

    const overlay = document.createElement('div');
    overlay.id = 'kg-overlay';

    const box = document.createElement('div'); box.className = 'kg-box';

    const icon = document.createElement('div'); icon.className = 'kg-icon'; icon.textContent = '🛡';

    const badge = document.createElement('div'); badge.className = 'kg-badge';
    badge.textContent = '🔒 KidGuard — Blocked';

    const title = document.createElement('div'); title.className = 'kg-title';
    title.textContent = context === 'video' ? 'Video Blocked' : context === 'genre' ? 'Genre Blocked' : context === 'search' ? 'Search Blocked' : 'Content Blocked';

    const msg = document.createElement('div'); msg.className = 'kg-msg';
    const contextLabel = context === 'genre' ? 'content belongs to a blocked genre:' : 'content contains a blocked keyword:';
    msg.appendChild(document.createTextNode('This ' + contextLabel));
    msg.appendChild(document.createElement('br'));
    const kwSpan = document.createElement('span'); kwSpan.className = 'kg-kw'; kwSpan.textContent = '"' + keyword + '"';
    msg.appendChild(kwSpan);

    const sub = document.createElement('div'); sub.className = 'kg-sub';
    sub.textContent = 'This content has been blocked by KidGuard Parental Control. Ask a parent or guardian for help.';

    if (videoTitle) {
      const vt = document.createElement('div'); vt.className = 'kg-video-title';
      vt.textContent = 'Video: ' + videoTitle.slice(0,70) + (videoTitle.length > 70 ? '…' : '');
      msg.after(vt);
    }

    const btns = document.createElement('div'); btns.className = 'kg-btns';

    const btnBack = document.createElement('button'); btnBack.className = 'kg-btn';
    btnBack.textContent = '← Go Back';
    btnBack.addEventListener('click', () => {
      if (window.history.length > 1) history.back();
      else window.location.href = 'https://www.youtube.com';
    });

    const btnHome = document.createElement('button'); btnHome.className = 'kg-btn kg-btn-red';
    btnHome.textContent = '🏠 YouTube Home';
    btnHome.addEventListener('click', () => { window.location.href = 'https://www.youtube.com'; });

    btns.appendChild(btnBack); btns.appendChild(btnHome);
    box.appendChild(icon); box.appendChild(badge); box.appendChild(title);
    box.appendChild(msg); box.appendChild(sub); box.appendChild(btns);
    overlay.appendChild(box);

    // Pause any playing video immediately
    document.querySelectorAll('video').forEach(v => { v.pause(); v.volume = 0; });

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  function removeBlockOverlay() {
    const el = document.getElementById('kg-overlay');
    if (el) { el.remove(); document.body.style.overflow = ''; }
  }

  // ── Listen for background worker block signal (SPA navigation) ────
  window.addEventListener('__kgBlock', (e) => {
    const { keyword, title } = e.detail || {};
    if (keyword) showBlockOverlay(keyword, 'video', title);
  });

  // Also check if background already signalled before content script ran
  if (window.__kgBlockNow) {
    const { keyword, title } = window.__kgBlockNow;
    if (keyword) setTimeout(() => showBlockOverlay(keyword, 'video', title), 0);
  }

  // ── Intercept ALL link clicks to YouTube videos ────────────────────
  // This catches recommended video clicks BEFORE navigation happens
  document.addEventListener('click', (e) => {
    if (!enabled || !keywords.length) return;
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href') || '';
    if (!href.includes('/watch?v=') && !href.includes('/watch?')) return;

    // Extract video title from the card that was clicked
    const card = link.closest([
      'ytd-video-renderer', 'ytd-compact-video-renderer',
      'ytd-grid-video-renderer', 'ytd-rich-item-renderer',
      'ytd-video-with-context-renderer', 'ytd-reel-item-renderer',
    ].join(','));

    const titleEl = card
      ? card.querySelector('#video-title, #video-title-link, .title, h3 a, ytd-video-meta-block #title')
      : null;
    const cardTitle = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';

    // 1. Check card title immediately (fast, no network)
    const blockedInCard = containsBlocked(cardTitle);
    if (blockedInCard) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showBlockOverlay(blockedInCard, 'video', cardTitle);
      return;
    }

    // 2. Also check via background (fetches oEmbed title) if card title was empty
    if (!cardTitle) {
      try {
        const params  = new URLSearchParams(new URL(href, location.origin).search);
        const videoId = params.get('v');
        if (videoId) {
          // Ask background to verify — if blocked, show overlay
          chrome.runtime.sendMessage({ type: 'CHECK_VIDEO', videoId }, (res) => {
            if (res?.blocked) {
              showBlockOverlay(res.keyword, 'video', res.title);
              history.replaceState(null, '', window.location.href); // stay on current page
            }
          });
        }
      } catch {}
    }
  }, true); // capture phase — fires before YouTube's own handlers

  // ── Check current page (on load / navigation) ──────────────────────
  function checkCurrentPage() {
    if (!enabled || !keywords.length) { removeBlockOverlay(); return; }

    const params = new URLSearchParams(window.location.search);

    // Search query in URL
    const q = params.get('search_query') || params.get('q') || '';
    const bq = containsBlocked(q);
    if (bq) { showBlockOverlay(bq, 'search'); return; }

    // Genre check on video page
    if (location.pathname.includes('/watch')) {
      setTimeout(checkVideoGenre, 1200);
      setTimeout(checkVideoGenre, 3000);
    }

    // Video page — check title in DOM
    if (location.pathname.includes('/watch')) {
      // Pause video immediately while we check
      document.querySelectorAll('video').forEach(v => { v.pause(); v.volume = 0; });

      const checkTitle = () => {
        const selectors = [
          'h1.ytd-video-primary-info-renderer yt-formatted-string',
          'ytd-video-primary-info-renderer h1',
          '#title h1',
          'h1.style-scope.ytd-video-primary-info-renderer',
        ];
        let titleText = '';
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) { titleText = el.textContent.trim(); break; }
        }
        // Fallback to document title (strip "- YouTube" suffix)
        if (!titleText) titleText = document.title.replace(/\s*[-–|]\s*YouTube\s*$/, '').trim();

        const bt = containsBlocked(titleText);
        if (bt) { showBlockOverlay(bt, 'video', titleText); return true; }
        return false;
      };

      // Check immediately, then retry a few times as DOM loads
      if (!checkTitle()) {
        let attempts = 0;
        const retry = setInterval(() => {
          if (checkTitle() || ++attempts > 12) clearInterval(retry);
        }, 400);
      }
      return;
    }

    // Other pages — check document title
    const bd = containsBlocked(document.title.replace('- YouTube',''));
    if (bd) { showBlockOverlay(bd, 'page'); return; }

    removeBlockOverlay();
  }

  // ── Block search submissions ───────────────────────────────────────
  function showSearchWarning(keyword, inputEl) {
    document.getElementById('kg-search-warn')?.remove();
    const warn = document.createElement('div');
    warn.id = 'kg-search-warn';
    warn.style.cssText = 'position:fixed;top:76px;left:50%;transform:translateX(-50%);background:#1a0a0a;border:1px solid rgba(239,68,68,.4);color:#fca5a5;padding:11px 18px;border-radius:10px;font-family:"Segoe UI",Arial,sans-serif;font-size:14px;z-index:2147483646;box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:400px;text-align:center;line-height:1.5';
    const b = document.createElement('strong'); b.textContent = ' Blocked: ';
    warn.appendChild(document.createTextNode('🛡'));
    warn.appendChild(b);
    warn.appendChild(document.createTextNode('"' + keyword + '" is not allowed.'));
    document.body.appendChild(warn);
    if (inputEl) { inputEl.value = ''; inputEl.focus(); }
    setTimeout(() => document.getElementById('kg-search-warn')?.remove(), 4000);
  }

  function wireSearchBar() {
    document.querySelectorAll('input#search, input[name="search_query"], ytd-searchbox input').forEach(inp => {
      if (inp.__kgWired) return; inp.__kgWired = true;
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && enabled) {
          const blocked = containsBlocked(inp.value);
          if (blocked) { e.preventDefault(); e.stopImmediatePropagation(); showSearchWarning(blocked, inp); }
        }
      }, true);
      const form = inp.closest('form');
      if (form && !form.__kgWired) {
        form.__kgWired = true;
        form.addEventListener('submit', (e) => {
          if (!enabled) return;
          const blocked = containsBlocked(inp.value);
          if (blocked) { e.preventDefault(); e.stopImmediatePropagation(); showSearchWarning(blocked, inp); }
        }, true);
      }
    });
  }

  // ── Hide blocked video cards from feed / search results ───────────
  // Uses a fresh Set so cards are only processed once per content change

  const processedCards = new WeakSet();

  function scanFeedCards() {
    if (!enabled || !keywords.length) return;

    const CARD_SELECTORS = [
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-video-with-context-renderer',
      'ytd-movie-renderer',
      'ytd-playlist-video-renderer',
      'ytd-reel-item-renderer',
      'ytd-shelf-renderer',
    ];

    const TITLE_SELECTORS = [
      '#video-title',
      '#video-title-link',
      'h3 a',
      '.title',
      '#title',
      'ytd-video-meta-block #title',
      'span#video-title',
      'a#video-title',
    ];

    document.querySelectorAll(CARD_SELECTORS.join(',')).forEach(card => {
      if (processedCards.has(card)) return;

      // Try all title selectors
      let title = '';
      for (const sel of TITLE_SELECTORS) {
        const el = card.querySelector(sel);
        const t  = el?.textContent?.trim() || el?.getAttribute('title') || el?.getAttribute('aria-label') || '';
        if (t) { title = t; break; }
      }

      if (!title) {
        // Title not loaded yet — don't mark as processed, retry on next mutation
        return;
      }

      processedCards.add(card); // mark as processed only when we got a title

      const blocked = containsBlocked(title);
      if (blocked) {
        card.classList.add('kg-hidden-card');
        card.setAttribute('data-kg-blocked', blocked);
        // Also prevent clicks on the card just in case CSS fails
        card.addEventListener('click', (e) => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
      }
    });
  }

  // ── Watch DOM mutations (new cards loaded by YouTube) ─────────────
  function startFeedObserver() {
    if (feedObserver) feedObserver.disconnect();
    feedObserver = new MutationObserver(() => {
      scanFeedCards();
      scanCardGenres();
      scanChannelCards();
      blockGenreChips();
      wireSearchBar();
    });
    if (document.body) feedObserver.observe(document.body, { childList: true, subtree: true });
  }


  // ── Genre blocking ─────────────────────────────────────────────

  // All the ways YouTube labels genres/categories
  const GENRE_SELECTORS = [
    // Category pill chips on homepage filter bar
    'yt-chip-cloud-chip-renderer',
    // Video page — genre shown in description metadata
    'ytd-metadata-row-renderer',
    // Channel page category
    'ytd-channel-about-metadata-renderer',
    // Video page info rows
    '#info-strings yt-formatted-string',
    // Shorts & cards category badge
    '.ytd-badge-supported-renderer',
    // Genre in structured data / microdata
    '[itemprop="genre"]',
  ];

  function containsBlockedGenre(text) {
    if (!text || !blockedGenres.length) return null;
    const lower = text.toLowerCase();
    return blockedGenres.find(g => lower.includes(g)) || null;
  }

  // Check genre shown on current video page (appears in About / metadata rows)
  function checkVideoGenre() {
    if (!enabled || !blockedGenres.length) return;

    // Method 1: check structured data JSON-LD
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        const genre = data.genre || data['@type'] || '';
        const bg = containsBlockedGenre(Array.isArray(genre) ? genre.join(' ') : genre);
        if (bg) { showBlockOverlay(bg, 'genre'); return; }
      } catch {}
    }

    // Method 2: check visible category/genre metadata rows on video page
    document.querySelectorAll('ytd-metadata-row-renderer').forEach(row => {
      const label = row.querySelector('.ytd-metadata-row-renderer:first-child, #title')?.textContent?.toLowerCase() || '';
      if (label.includes('genre') || label.includes('category') || label.includes('topic')) {
        const value = row.querySelector('#content yt-formatted-string, #content a')?.textContent || '';
        const bg = containsBlockedGenre(value);
        if (bg) { showBlockOverlay(bg, 'genre'); }
      }
    });

    // Method 3: check topic/genre badges on video page
    document.querySelectorAll('ytd-rich-metadata-renderer, ytd-horizontal-card-list-renderer').forEach(el => {
      const text = el.textContent || '';
      const bg = containsBlockedGenre(text);
      if (bg) { showBlockOverlay(bg, 'genre'); }
    });
  }

  // Check if a category chip/tab (homepage filter bar) is blocked
  function blockGenreChips() {
    if (!enabled || !blockedGenres.length) return;
    // Hide genre filter chips from the homepage bar
    document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(chip => {
      const label = chip.textContent?.trim() || chip.getAttribute('aria-label') || '';
      if (containsBlockedGenre(label)) {
        chip.style.cssText = 'display:none!important';
        // If this chip is currently selected/active, navigate away
        if (chip.getAttribute('aria-selected') === 'true' || chip.classList.contains('iron-selected')) {
          window.location.href = 'https://www.youtube.com';
        }
      }
    });
  }

  // Check genre/category links in the sidebar and feed
  function blockGenreLinks() {
    if (!enabled || !blockedGenres.length) return;
    // Hide sidebar category items
    document.querySelectorAll('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer').forEach(el => {
      const label = el.querySelector('.title, #endpoint')?.textContent || '';
      if (containsBlockedGenre(label)) {
        el.style.cssText = 'display:none!important';
      }
    });
  }

  // Check genre of video cards (some cards have genre badge / topic chip)
  function scanCardGenres() {
    if (!enabled || !blockedGenres.length) return;
    const CARD_TYPES = [
      'ytd-video-renderer','ytd-compact-video-renderer',
      'ytd-grid-video-renderer','ytd-rich-item-renderer',
      'ytd-video-with-context-renderer',
    ];
    document.querySelectorAll(CARD_TYPES.join(',')).forEach(card => {
      if (card.dataset.kgGenreChecked) return;
      // Check if the card has a genre/topic badge
      const badge = card.querySelector('ytd-badge-supported-renderer, .badge, [aria-label*="Music"], [aria-label*="Gaming"], [aria-label*="News"]');
      const badgeText = badge?.textContent || badge?.getAttribute('aria-label') || '';
      if (containsBlockedGenre(badgeText)) {
        card.dataset.kgGenreChecked = '1';
        card.classList.add('kg-hidden-card');
        return;
      }
      // Check overlay text and metadata
      const metaText = card.querySelector('#metadata-line, .metadata, ytd-video-meta-block')?.textContent || '';
      if (containsBlockedGenre(metaText)) {
        card.dataset.kgGenreChecked = '1';
        card.classList.add('kg-hidden-card');
        return;
      }
      card.dataset.kgGenreChecked = '1';
    });
  }

  // Intercept clicks on genre/category links before navigation
  function interceptGenreClicks() {
    if (!enabled || !blockedGenres.length) return;
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href], yt-chip-cloud-chip-renderer');
      if (!link) return;

      const href  = link.getAttribute('href') || '';
      const label = link.textContent?.trim() || link.getAttribute('aria-label') || '';

      // Check if it's a genre/topic page (YouTube uses /channel/ for topics)
      const blockedGenre = containsBlockedGenre(label);
      if (blockedGenre && (
        href.includes('/channel/') ||
        href.includes('?bp=') ||           // filter shelf
        href.includes('browse') ||
        link.tagName === 'YT-CHIP-CLOUD-CHIP-RENDERER'
      )) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showBlockOverlay(blockedGenre, 'genre');
      }
    }, true);
  }


  // ── Watch SPA URL changes (YouTube doesn't reload on navigation) ──
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      removeBlockOverlay();
      setTimeout(() => {
        checkCurrentPage();
        checkChannelAllowlist();
        scanFeedCards();
        scanChannelCards();
        wireSearchBar();
      }, 500);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── React to settings changes in real time ────────────────────────
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.keywords || changes.enabled || changes.allowedChannels || changes.channelsEnabled) {
      loadSettings(() => {
        // Re-scan all cards (unhide if keywords removed)
        document.querySelectorAll('.kg-hidden-card').forEach(el => {
          el.classList.remove('kg-hidden-card');
        });
        // Clear processed set so all cards get re-evaluated
        // (WeakSet has no clear() so we replace the observer instead)
        startFeedObserver();
        removeBlockOverlay();
        checkCurrentPage();
        scanFeedCards();
      });
    }
  });


  // ══════════════════════════════════════════════════════════════════
  // CHANNEL ALLOWLIST ENFORCEMENT
  // ══════════════════════════════════════════════════════════════════

  // Extract channel identity from current page or a card element
  function getChannelFromPage() {
    // Channel handle from URL: youtube.com/@handle
    const urlHandle = location.pathname.match(/^\/@([\w.-]+)/i);
    if (urlHandle) return { handle: '@' + urlHandle[1].toLowerCase(), name: urlHandle[1], id: '' };

    // Channel ID from URL: youtube.com/channel/UCxxxx
    const urlId = location.pathname.match(/^\/channel\/(UC[\w-]+)/i);
    if (urlId) return { id: urlId[1], handle: '', name: '' };

    // From page metadata
    const metaHandle = document.querySelector('meta[itemprop="channelId"]')?.content ||
                       document.querySelector('link[rel="canonical"]')?.href?.match(/\/@([\w.-]+)/)?.[1];
    if (metaHandle) return { handle: '@' + metaHandle.toLowerCase(), name: metaHandle, id: '' };

    // From video page — channel link in description area
    const channelLink = document.querySelector('ytd-video-owner-renderer a, #owner-name a, ytd-channel-name a');
    if (channelLink) {
      const href   = channelLink.getAttribute('href') || '';
      const hMatch = href.match(/\/@([\w.-]+)/i) || href.match(/\/channel\/(UC[\w-]+)/i);
      const name   = channelLink.textContent?.trim() || '';
      if (hMatch) {
        const isHandle = hMatch[0].startsWith('/@');
        return isHandle
          ? { handle: '@' + hMatch[1].toLowerCase(), name, id: '' }
          : { id: hMatch[1], name, handle: '' };
      }
    }
    return null;
  }

  // Check if a channel identity is in the allowed list
  function isChannelAllowed(ch) {
    if (!channelsEnabled || !allowedChannels.length) return true;
    if (!ch) return false;
    return allowedChannels.some(function(allowed) {
      if (allowed.id && ch.id && allowed.id === ch.id) return true;
      if (allowed.handle && ch.handle && allowed.handle.toLowerCase() === ch.handle.toLowerCase()) return true;
      if (allowed.name && ch.name && allowed.name.toLowerCase() === ch.name.toLowerCase()) return true;
      return false;
    });
  }

  // Show channel block overlay
  function showChannelBlockOverlay(channelName) {
    if (document.getElementById('kg-overlay')) return;
    injectStyles();

    const overlay = document.createElement('div'); overlay.id = 'kg-overlay';
    const box = document.createElement('div'); box.className = 'kg-box';

    const icon = document.createElement('div'); icon.className = 'kg-icon'; icon.textContent = '📺';
    const badge = document.createElement('div'); badge.className = 'kg-badge'; badge.textContent = '🔒 KidGuard — Channel Blocked';
    const title = document.createElement('div'); title.className = 'kg-title'; title.textContent = 'Channel Not Allowed';

    const msg = document.createElement('div'); msg.className = 'kg-msg';
    msg.textContent = 'This channel is not on the approved list.';
    const kwSpan = document.createElement('span'); kwSpan.className = 'kg-kw';
    kwSpan.textContent = channelName || 'This channel';
    msg.appendChild(document.createElement('br'));
    msg.appendChild(kwSpan);

    const sub = document.createElement('div'); sub.className = 'kg-sub';
    sub.textContent = 'Only approved channels can be watched. Ask a parent or guardian to add this channel.';

    const btns = document.createElement('div'); btns.className = 'kg-btns';
    const btnBack = document.createElement('button'); btnBack.className = 'kg-btn'; btnBack.textContent = '← Go Back';
    btnBack.addEventListener('click', function() {
      if (window.history.length > 1) history.back();
      else window.location.href = 'https://www.youtube.com';
    });
    const btnHome = document.createElement('button'); btnHome.className = 'kg-btn kg-btn-red'; btnHome.textContent = '🏠 YouTube Home';
    btnHome.addEventListener('click', function() { window.location.href = 'https://www.youtube.com'; });

    btns.appendChild(btnBack); btns.appendChild(btnHome);
    box.appendChild(icon); box.appendChild(badge); box.appendChild(title);
    box.appendChild(msg); box.appendChild(sub); box.appendChild(btns);
    overlay.appendChild(box);

    document.querySelectorAll('video').forEach(function(v) { v.pause(); v.volume = 0; });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  // Check if current page's channel is allowed
  function checkChannelAllowlist() {
    if (!enabled || !channelsEnabled || !allowedChannels.length) { return; }

    // Only enforce on watch pages and channel pages
    const isWatch   = location.pathname.includes('/watch');
    const isChannel = location.pathname.match(/^\/@|^\/channel\//i);
    if (!isWatch && !isChannel) return;

    // Try to get channel info from page — retry as DOM loads
    const tryCheck = function(attemptsLeft) {
      const ch = getChannelFromPage();
      if (!ch && attemptsLeft > 0) {
        setTimeout(function() { tryCheck(attemptsLeft - 1); }, 600);
        return;
      }
      if (!ch) return;
      if (!isChannelAllowed(ch)) {
        showChannelBlockOverlay(ch.name || ch.handle || 'Unknown channel');
        // Pause video immediately
        document.querySelectorAll('video').forEach(function(v) { v.pause(); v.volume = 0; });
      }
    };
    tryCheck(8);
  }

  // Hide cards from disallowed channels in feed
  function scanChannelCards() {
    if (!enabled || !channelsEnabled || !allowedChannels.length) return;

    const CARD_TYPES = [
      'ytd-video-renderer', 'ytd-compact-video-renderer',
      'ytd-grid-video-renderer', 'ytd-rich-item-renderer',
      'ytd-video-with-context-renderer',
    ];

    document.querySelectorAll(CARD_TYPES.join(',')).forEach(function(card) {
      if (card.dataset.kgChChecked) return;

      const channelLink = card.querySelector('ytd-channel-name a, #channel-name a, .ytd-channel-name a, a.yt-simple-endpoint[href*="/@"], a.yt-simple-endpoint[href*="/channel/"]');
      if (!channelLink) return; // not loaded yet

      card.dataset.kgChChecked = '1';
      const href   = channelLink.getAttribute('href') || '';
      const name   = channelLink.textContent?.trim() || '';
      const hMatch = href.match(/\/@([\w.-]+)/i) || href.match(/\/channel\/(UC[\w-]+)/i);
      if (!hMatch) return;

      const isHandle = hMatch[0].startsWith('/@');
      const ch = isHandle
        ? { handle: '@' + hMatch[1].toLowerCase(), name, id: '' }
        : { id: hMatch[1], name, handle: '' };

      if (!isChannelAllowed(ch)) {
        card.classList.add('kg-hidden-card');
      }
    });
  }


  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    loadSettings(() => {
      checkCurrentPage();
      checkChannelAllowlist();
      wireSearchBar();
      scanFeedCards();
      scanCardGenres();
      scanChannelCards();
      blockGenreChips();
      blockGenreLinks();
      interceptGenreClicks();
      startFeedObserver();
    });

    // Second pass after YouTube JS has had time to render cards
    setTimeout(() => {
      scanFeedCards();
      scanCardGenres();
      scanChannelCards();
      blockGenreChips();
      blockGenreLinks();
      wireSearchBar();
      checkCurrentPage();
      checkChannelAllowlist();
    }, 1200);

    // Third pass for slow connections / lazy loaded content
    setTimeout(() => { scanFeedCards(); scanCardGenres(); blockGenreChips(); }, 3000);
  }

  // Run immediately if DOM ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
