import type { ShareSnapshot } from './types'
import { faviconDataUri } from './brandMark.js'

/**
 * Local copy so this module stays dependency-free: it is imported by the
 * desktop app *and* by the web server, and pulling in the export pipeline
 * would drag Node-only code into the server bundle.
 */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

/**
 * Renders a snapshot into a single self-contained HTML file.
 *
 * Everything — styles, script, cover image — is inlined, so the result works
 * from a USB stick, an email attachment, or a static host with no server
 * behind it. The same markup and controls become the web reader later, so the
 * reading experience can't diverge between the two ways of sharing.
 */
export function renderReaderHtml(snapshot: ShareSnapshot, options?: { token?: string }): string {
  const payload = JSON.stringify(snapshot)
    // Prevent the embedded JSON from terminating the script block early.
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

  return `<!DOCTYPE html>
<html lang="${escapeHtml(snapshot.language)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(snapshot.title)}</title>
<link rel="icon" href="${faviconDataUri()}"/>
<style>
:root {
  --bg: #f6f3ec; --fg: #1e1b16; --dim: #6b6459; --line: #ddd6c8; --panel: #fffdf8;
  --reading: 20px; --leading: 1.7; --family: Georgia, 'Times New Roman', serif;
}
[data-theme="paper"] { --bg:#f6f3ec; --fg:#1e1b16; --dim:#6b6459; --line:#ddd6c8; --panel:#fffdf8; }
/* A true white, for readers who find even paper's warmth too yellow. */
[data-theme="light"] { --bg:#ffffff; --fg:#16161a; --dim:#6e6e78; --line:#e6e6ea; --panel:#ffffff; }
[data-theme="sepia"] { --bg:#f4ecd8; --fg:#3b3222; --dim:#7a6a50; --line:#ddd0b0; --panel:#fbf5e6; }
[data-theme="dark"]  { --bg:#15131a; --fg:#e7e3ee; --dim:#9a93a8; --line:#2e2a38; --panel:#1d1a24; }
[data-theme="black"] { --bg:#000000; --fg:#d8d8d8; --dim:#8a8a8a; --line:#222;    --panel:#0b0b0b; }
* { box-sizing: border-box; }
body {
  margin:0; background:var(--bg); color:var(--fg);
  font-family:var(--family); font-size:var(--reading); line-height:var(--leading);
  transition: background .25s ease, color .25s ease;
}
.wrap { max-width: 40em; margin: 0 auto; padding: 5rem 1.5rem 8rem; }
.cover { display:block; max-width:min(280px,60%); margin:0 auto 2.5rem; border-radius:4px; box-shadow:0 8px 32px rgb(0 0 0 / 25%); }
h1.book { font-size:1.9em; text-align:center; margin:0 0 .3rem; }
.byline { text-align:center; color:var(--dim); margin:0 0 3rem; font-size:.85em; }
.chapter { margin: 0 0 4.5rem; scroll-margin-top: 4rem; }
.chapter > h2 { font-size:1.35em; margin:0 0 .35rem; }
.vol { color:var(--dim); font-size:.72em; letter-spacing:.14em; text-transform:uppercase; margin-bottom:.4rem; }
.syn { color:var(--dim); font-style:italic; margin:0 0 1.4rem; padding-left:.9rem; border-left:2px solid var(--line); font-size:.9em; }
.body p { margin:0 0 1em; }
.body h1,.body h2,.body h3 { line-height:1.3; }
.body blockquote { border-left:3px solid var(--line); margin:1em 0; padding-left:1em; color:var(--dim); }
.body img { max-width:100%; height:auto; }
.body hr { border:none; border-top:1px solid var(--line); margin:2em 0; }
.body table { border-collapse:collapse; width:100%; }
.body th,.body td { border:1px solid var(--line); padding:6px 8px; }
.footnotes { margin-top:2.5em; padding-top:1em; border-top:1px solid var(--line); font-size:.82em; color:var(--dim); }
.footnote-ref { font-size:.72em; vertical-align:super; line-height:0; font-weight:700; }

/* Controls hide while reading and return on any deliberate interaction. */
.bar {
  position:fixed; left:0; right:0; z-index:20; background:var(--panel);
  border-color:var(--line); display:flex; align-items:center; gap:.6rem;
  padding:.55rem .9rem; font-family:system-ui,sans-serif; font-size:13px;
  transition:opacity .3s ease, transform .3s ease;
}
.bar.top { top:0; border-bottom:1px solid var(--line); }
.bar.bottom { bottom:0; border-top:1px solid var(--line); justify-content:center; }
body.immersive .bar { opacity:0; pointer-events:none; }
body.immersive .bar.top { transform:translateY(-100%); }
body.immersive .bar.bottom { transform:translateY(100%); }
.bar button, .bar select {
  background:transparent; border:1px solid var(--line); color:var(--fg);
  border-radius:7px; padding:.3rem .55rem; cursor:pointer; font:inherit;
}
.bar button:hover { border-color:var(--fg); }
.spacer { flex:1; }
.title { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#toc {
  position:fixed; top:0; bottom:0; left:0; width:min(310px,82vw); z-index:30;
  background:var(--panel); border-right:1px solid var(--line); overflow:auto;
  padding:1rem .5rem; transform:translateX(-100%); transition:transform .25s ease;
  font-family:system-ui,sans-serif; font-size:13px;
}
#toc.open { transform:none; }
#toc a { display:block; padding:.5rem .7rem; color:var(--dim); text-decoration:none; border-radius:7px; }
#toc a:hover { background:var(--bg); color:var(--fg); }
#scrim { position:fixed; inset:0; background:rgb(0 0 0 / 45%); z-index:25; opacity:0; pointer-events:none; transition:opacity .25s; }
#scrim.on { opacity:1; pointer-events:auto; }
#progress { position:fixed; top:0; left:0; height:2px; background:var(--fg); z-index:40; width:0; opacity:.55; }
@media print { .bar,#toc,#scrim,#progress { display:none !important; } }
</style>
</head>
<body>
<div id="progress"></div>

<div class="bar top">
  <button id="tocBtn" title="Contents">☰</button>
  <span class="title" id="bookTitle"></span>
  <span class="spacer"></span>
  <select id="theme" title="Background">
    <option value="paper">Paper</option><option value="light">White</option>
    <option value="sepia">Sepia</option><option value="dark">Dark</option>
    <option value="black">Black</option>
  </select>
</div>

<div class="bar bottom">
  <select id="family" title="Typeface">
    <option value="Georgia, 'Times New Roman', serif">Serif</option>
    <option value="system-ui, -apple-system, sans-serif">Sans</option>
    <option value="'Iowan Old Style', Palatino, serif">Palatino</option>
    <option value="'Courier New', monospace">Mono</option>
  </select>
  <button data-size="-1" title="Smaller text">A−</button>
  <button data-size="1" title="Larger text">A+</button>
  <button data-lead="-1" title="Tighter lines">↕−</button>
  <button data-lead="1" title="Looser lines">↕+</button>
</div>

<div id="scrim"></div>
<nav id="toc"></nav>
<div class="wrap" id="content"></div>

<script>
(function () {
  var data = ${payload};
  var TOKEN = ${JSON.stringify(options?.token ?? null)};

  var content = document.getElementById('content');
  var toc = document.getElementById('toc');
  document.getElementById('bookTitle').textContent = data.title;

  var html = '';
  if (data.coverDataUri) html += '<img class="cover" src="' + data.coverDataUri + '" alt=""/>';
  html += '<h1 class="book">' + esc(data.title) + '</h1>';
  var by = [data.subtitle, data.author].filter(Boolean).join(' · ');
  if (by) html += '<p class="byline">' + esc(by) + '</p>';

  var lastVol = null;
  data.chapters.forEach(function (ch, i) {
    html += '<section class="chapter" id="ch' + i + '">';
    if (ch.volume && ch.volume !== lastVol) { html += '<div class="vol">' + esc(ch.volume) + '</div>'; lastVol = ch.volume; }
    html += '<h2>' + esc(ch.title) + '</h2>';
    if (ch.synopsis) html += '<p class="syn">' + esc(ch.synopsis) + '</p>';
    html += '<div class="body">' + ch.html + '</div></section>';
    toc.insertAdjacentHTML('beforeend', '<a href="#ch' + i + '">' + esc(ch.title) + '</a>');
  });
  content.innerHTML = html;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- preferences, remembered per reader ----
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('cypher-reader') || '{}'); } catch (e) { prefs = {}; }
  var size = prefs.size || 20, lead = prefs.lead || 1.7;
  var family = prefs.family || "Georgia, 'Times New Roman', serif";
  var theme = prefs.theme || 'paper';

  function apply() {
    var r = document.documentElement;
    r.style.setProperty('--reading', size + 'px');
    r.style.setProperty('--leading', String(lead));
    r.style.setProperty('--family', family);
    r.setAttribute('data-theme', theme);
    document.getElementById('theme').value = theme;
    document.getElementById('family').value = family;
    try {
      localStorage.setItem('cypher-reader', JSON.stringify({ size: size, lead: lead, family: family, theme: theme }));
    } catch (e) { /* private browsing */ }
  }
  apply();

  document.getElementById('theme').onchange = function (e) { theme = e.target.value; apply(); };
  document.getElementById('family').onchange = function (e) { family = e.target.value; apply(); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-size]'), function (b) {
    b.onclick = function () { size = Math.min(30, Math.max(13, size + Number(b.dataset.size))); apply(); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-lead]'), function (b) {
    b.onclick = function () { lead = Math.min(2.4, Math.max(1.2, Math.round((lead + Number(b.dataset.lead) * 0.1) * 10) / 10)); apply(); };
  });

  // ---- contents drawer ----
  var scrim = document.getElementById('scrim');
  function closeToc() { toc.classList.remove('open'); scrim.classList.remove('on'); }
  document.getElementById('tocBtn').onclick = function () {
    toc.classList.toggle('open'); scrim.classList.toggle('on');
  };
  scrim.onclick = closeToc;
  toc.onclick = function (e) { if (e.target.tagName === 'A') closeToc(); };

  // ---- immersive mode: chrome recedes while actually reading ----
  var lastY = window.scrollY, idle;
  function show() {
    document.body.classList.remove('immersive');
    clearTimeout(idle);
    idle = setTimeout(function () {
      if (!toc.classList.contains('open')) document.body.classList.add('immersive');
    }, 2600);
  }
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    // Scrolling down is reading; scrolling up usually means looking for controls.
    if (y > lastY + 4 && y > 120) { document.body.classList.add('immersive'); clearTimeout(idle); }
    else if (y < lastY - 24) show();
    lastY = y;

    var max = document.body.scrollHeight - window.innerHeight;
    document.getElementById('progress').style.width = max > 0 ? (y / max) * 100 + '%' : '0';
  }, { passive: true });
  ['mousemove', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, show, { passive: true });
  });
  show();

  // ---- reading time, reported only when a server is behind this ----
  if (TOKEN) {
    var seconds = 0;
    setInterval(function () { if (!document.hidden) seconds++; }, 1000);
    window.addEventListener('beforeunload', function () {
      if (seconds < 5 || !navigator.sendBeacon) return;
      try {
        navigator.sendBeacon('/api/read/' + TOKEN, new Blob([JSON.stringify({ seconds: seconds })], { type: 'application/json' }));
      } catch (e) { /* ignore */ }
    });
  }
})();
</script>
</body>
</html>`
}
