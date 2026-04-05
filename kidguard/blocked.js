// blocked.js — KidGuard block page logic
// External file required because Chrome extension CSP blocks inline <script> tags

(function () {
  var params  = new URLSearchParams(window.location.search);
  var site    = params.get('site');
  var reason  = params.get('reason');
  var keyword = params.get('keyword');
  var context = params.get('context') || 'page';
  var vtitle  = params.get('title');

  var titleEl  = document.getElementById('main-title');
  var tagEl    = document.getElementById('site-tag');
  var reasonEl = document.getElementById('reason-text');
  var btnBack  = document.getElementById('btn-back');
  var btnHome  = document.getElementById('btn-home');

  // ── Set page content based on block reason ────────────────────

  if (keyword) {
    // Blocked by keyword — YouTube video or search
    if (context === 'video') {
      titleEl.textContent  = 'Video Blocked';
      tagEl.textContent    = 'Keyword: "' + keyword + '"';
      reasonEl.textContent = vtitle
        ? 'This video contains a blocked keyword.\n\nVideo: ' + vtitle
        : 'This video contains a blocked keyword. Ask a parent or guardian for help.';
    } else if (context === 'search') {
      titleEl.textContent  = 'Search Blocked';
      tagEl.textContent    = 'Keyword: "' + keyword + '"';
      reasonEl.textContent = 'This search contains a blocked keyword. Please search for something appropriate.';
    } else {
      titleEl.textContent  = 'Content Blocked';
      tagEl.textContent    = 'Keyword: "' + keyword + '"';
      reasonEl.textContent = 'This page contains a blocked keyword.';
    }
    // Home button goes to YouTube for video/search blocks
    btnHome.textContent = '\uD83C\uDFE0 YouTube Home';

  } else if (reason === 'notallowed') {
    // Not in allowlist
    titleEl.textContent  = 'Website Not Allowed';
    tagEl.textContent    = site || 'This website';
    reasonEl.textContent = 'This website is not on your approved list.\nOnly allowed websites can be visited.\nAsk a parent or guardian for access.';

  } else if (site) {
    // Blocked by site rule
    titleEl.textContent  = 'Website Blocked';
    tagEl.textContent    = site;
    reasonEl.textContent = 'This website has been blocked by your parent or guardian.\nIf you think this is a mistake, please ask for help.';

  } else {
    // Fallback
    titleEl.textContent  = 'Blocked';
    tagEl.textContent    = window.location.hostname || 'This page';
    reasonEl.textContent = 'This page has been blocked by KidGuard Parental Control.';
  }

  // ── Button handlers ────────────────────────────────────────────

  btnBack.addEventListener('click', function () {
    // Go back in history, or go to a safe default if no history
    if (window.history.length > 1) {
      window.history.back();
    } else if (keyword && (context === 'video' || context === 'search')) {
      window.location.href = 'https://www.youtube.com';
    } else {
      window.location.href = 'https://www.google.com';
    }
  });

  btnHome.addEventListener('click', function () {
    if (keyword && (context === 'video' || context === 'search')) {
      window.location.href = 'https://www.youtube.com';
    } else {
      window.location.href = 'https://www.google.com';
    }
  });

})();
