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
 * behind it. The same markup and controls are the web reader, so the reading
 * experience can't diverge between the two ways of sharing.
 *
 * Note for editing: the page script lives inside a template literal, so it
 * uses no backticks or `${…}`, and every backslash in a regex is doubled.
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
  --reading: 20px; --leading: 1.7; --width: 40em; --family: Georgia, 'Times New Roman', serif;
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
.wrap { max-width: var(--width); margin: 0 auto; padding: 5rem 1.5rem 8rem; }
.cover { display:block; max-width:min(280px,60%); margin:0 auto 2.5rem; border-radius:4px; box-shadow:0 8px 32px rgb(0 0 0 / 25%); }
h1.book { font-size:1.9em; text-align:center; margin:0 0 .3rem; }
.byline { text-align:center; color:var(--dim); margin:0 0 .6rem; font-size:.85em; }
.booklen { text-align:center; color:var(--dim); margin:0 0 3rem; font-size:.72em; font-family:system-ui,sans-serif; }
.chapter { margin: 0 0 4.5rem; scroll-margin-top: 4rem; }
.chapter > h2 { font-size:1.35em; margin:0 0 .35rem; }
.vol { color:var(--dim); font-size:.72em; letter-spacing:.14em; text-transform:uppercase; margin-bottom:.4rem; }
.syn { color:var(--dim); font-style:italic; margin:0 0 1.4rem; padding-left:.9rem; border-left:2px solid var(--line); font-size:.9em; }
.body p { margin:0 0 1em; }
.body h1,.body h2,.body h3 { line-height:1.3; }
.body blockquote { border-left:3px solid var(--line); margin:1em 0; padding-left:1em; color:var(--dim); }
.body img { max-width:100%; height:auto; }
.body hr { border:none; border-top:1px solid var(--line); margin:2em 0; }
.body .scene-break { text-align:center; text-indent:0; margin:2em 0; letter-spacing:.3em; color:var(--dim, inherit); }
.body table { border-collapse:collapse; width:100%; }
.body th,.body td { border:1px solid var(--line); padding:6px 8px; }
.footnotes { margin-top:2.5em; padding-top:1em; border-top:1px solid var(--line); font-size:.82em; color:var(--dim); }
.footnote-ref { font-size:.72em; vertical-align:super; line-height:0; font-weight:700; }

/* Previous / next at the foot of every chapter. */
.chnav { display:flex; gap:1rem; justify-content:space-between; margin-top:2.5rem; padding-top:1.2rem; border-top:1px solid var(--line); font-family:system-ui,sans-serif; font-size:14px; }
.chnav a { color:var(--fg); text-decoration:none; padding:.55rem .8rem; border:1px solid var(--line); border-radius:9px; max-width:48%; }
.chnav a:hover { border-color:var(--fg); }
.chnav a small { display:block; color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }
.chnav .next { margin-left:auto; text-align:right; }
.chnav .done { margin-left:auto; color:var(--dim); padding:.55rem 0; font-style:italic; }

/* The paragraph being read aloud. */
.speaking { background:rgb(127 127 127 / 16%); border-radius:4px; box-shadow:0 0 0 .35em rgb(127 127 127 / 16%); transition:background .2s; }
body.listening .body p, body.listening .chapter > h2 { cursor:pointer; }

/* Controls hide while reading and return on any deliberate interaction. */
.bar {
  position:fixed; left:0; right:0; z-index:20; background:var(--panel);
  border-color:var(--line); display:flex; align-items:center; gap:.6rem;
  padding:.55rem .9rem; font-family:system-ui,sans-serif; font-size:13px;
  transition:opacity .3s ease, transform .3s ease;
}
.bar.top { top:0; border-bottom:1px solid var(--line); }
.bar.bottom { bottom:0; border-top:1px solid var(--line); justify-content:center; flex-wrap:wrap; gap:.4rem; }
body.immersive .bar { opacity:0; pointer-events:none; }
body.immersive .bar.top { transform:translateY(-100%); }
body.immersive .bar.bottom { transform:translateY(100%); }
.bar button, .bar select, #speech button, #speech select, #resume button {
  background:transparent; border:1px solid var(--line); color:var(--fg);
  border-radius:7px; padding:.3rem .55rem; cursor:pointer; font:inherit;
}
.bar button:hover, #speech button:hover, #resume button:hover { border-color:var(--fg); }
.bar button:disabled { opacity:.35; cursor:default; border-color:var(--line); }
.bar select option, #speech select option { background:var(--panel); color:var(--fg); }
.group { display:flex; gap:.25rem; }
.spacer { flex:1; }
.title { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.title .where { font-weight:400; color:var(--dim); }
#left { color:var(--dim); white-space:nowrap; font-variant-numeric:tabular-nums; }
#listenBtn.on { border-color:var(--fg); }

#toc {
  position:fixed; top:0; bottom:0; left:0; width:min(310px,82vw); z-index:30;
  background:var(--panel); border-right:1px solid var(--line); overflow:auto;
  padding:1rem .5rem; transform:translateX(-100%); transition:transform .25s ease;
  font-family:system-ui,sans-serif; font-size:13px;
}
#toc.open { transform:none; }
#toc a { display:block; padding:.5rem .7rem; color:var(--dim); text-decoration:none; border-radius:7px; }
#toc a:hover { background:var(--bg); color:var(--fg); }
/* The chapter you're in: bold, full-strength, with a marker down the left. */
#toc a.active { background:var(--bg); color:var(--fg); font-weight:600; box-shadow:inset 3px 0 0 var(--fg); }
#toc .keys { margin:1rem .7rem .3rem; padding-top:.8rem; border-top:1px solid var(--line); color:var(--dim); font-size:11px; line-height:1.9; }
#toc kbd { border:1px solid var(--line); border-radius:4px; padding:0 .3rem; font:inherit; }
#scrim { position:fixed; inset:0; background:rgb(0 0 0 / 45%); z-index:25; opacity:0; pointer-events:none; transition:opacity .25s; }
#scrim.on { opacity:1; pointer-events:auto; }
#progress { position:fixed; top:0; left:0; height:2px; background:var(--fg); z-index:40; width:0; opacity:.55; }

/* Floating pills: the speech controls stay put even when the bars recede. */
#speech, #resume {
  position:fixed; left:50%; transform:translateX(-50%); z-index:22;
  display:flex; align-items:center; gap:.35rem; padding:.4rem .5rem;
  background:var(--panel); border:1px solid var(--line); border-radius:999px;
  box-shadow:0 6px 24px rgb(0 0 0 / 18%); font-family:system-ui,sans-serif; font-size:13px;
  max-width:calc(100vw - 1.5rem); transition:bottom .3s ease;
}
#speech { bottom:4.2rem; }
body.immersive #speech { bottom:1rem; }
#speech select { max-width:11rem; }
#resume { top:4rem; padding:.4rem .5rem .4rem 1rem; }
#resume span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[hidden] { display:none !important; }

@media (max-width: 640px) {
  .wide-only { display:none !important; }
  .bar { gap:.35rem; padding:.5rem .6rem; }
  .bar.bottom { flex-wrap:nowrap; gap:.3rem; }
  .bar button, .bar select { padding:.3rem .45rem; }
  #family { max-width:5.6rem; }
  #listenBtn .lbl { display:none; }
  #speech select { max-width:6.5rem; }
}
@media print { .bar,#toc,#scrim,#progress,#speech,#resume,.chnav { display:none !important; } .speaking { background:none; box-shadow:none; } }
</style>
</head>
<body>
<div id="progress"></div>

<div class="bar top">
  <button id="tocBtn" title="Contents (T)" aria-label="Contents">☰</button>
  <span class="title" id="bookTitle"></span>
  <span class="spacer"></span>
  <span id="left" class="wide-only"></span>
  <select id="theme" title="Background">
    <option value="paper">Paper</option><option value="light">White</option>
    <option value="sepia">Sepia</option><option value="dark">Dark</option>
    <option value="black">Black</option>
  </select>
</div>

<div class="bar bottom">
  <button id="prevBtn" title="Previous chapter (←)" aria-label="Previous chapter">‹</button>
  <select id="family" title="Typeface">
    <option value="Georgia, 'Times New Roman', serif">Serif</option>
    <option value="system-ui, -apple-system, sans-serif">Sans</option>
    <option value="'Iowan Old Style', Palatino, serif">Palatino</option>
    <option value="'Courier New', monospace">Mono</option>
  </select>
  <span class="group">
    <button data-size="-1" title="Smaller text">A−</button>
    <button data-size="1" title="Larger text">A+</button>
  </span>
  <span class="group">
    <button data-lead="-1" title="Tighter lines">↕−</button>
    <button data-lead="1" title="Looser lines">↕+</button>
  </span>
  <span class="group wide-only">
    <button data-width="-1" title="Narrower text">⟷−</button>
    <button data-width="1" title="Wider text">⟷+</button>
  </span>
  <button id="listenBtn" title="Read aloud (P)" aria-label="Read aloud" hidden><span class="ico">▶</span><span class="lbl"> Listen</span></button>
  <button id="nextBtn" title="Next chapter (→)" aria-label="Next chapter">›</button>
</div>

<div id="speech" hidden role="group" aria-label="Read aloud">
  <button id="spPrev" title="Previous paragraph" aria-label="Previous paragraph">⏮</button>
  <button id="spPlay" title="Pause (P)" aria-label="Pause">❚❚</button>
  <button id="spNext" title="Next paragraph" aria-label="Next paragraph">⏭</button>
  <select id="spRate" title="Speed">
    <option value="0.8">0.8×</option><option value="0.9">0.9×</option><option value="1">1×</option>
    <option value="1.1">1.1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option>
    <option value="1.75">1.75×</option><option value="2">2×</option>
  </select>
  <select id="spVoice" title="Voice"></select>
  <button id="spStop" title="Stop reading aloud" aria-label="Stop">✕</button>
</div>

<div id="resume" hidden role="status">
  <span id="resumeText"></span>
  <button id="resumeGo">Continue</button>
  <button id="resumeNo" title="Start from here" aria-label="Dismiss">✕</button>
</div>

<div id="scrim"></div>
<nav id="toc"></nav>
<div class="wrap" id="content"></div>

<script>
(function () {
  var data = ${payload};
  var TOKEN = ${JSON.stringify(options?.token ?? null)};
  var WPM = 230;
  var n = data.chapters.length;

  var content = document.getElementById('content');
  var toc = document.getElementById('toc');
  var titleEl = document.getElementById('bookTitle');
  titleEl.textContent = data.title;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function minutes(words) { return Math.max(1, Math.round(words / WPM)); }
  function duration(words) {
    var m = minutes(words);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  }

  // ---- build the page ----
  var html = '';
  if (data.coverDataUri) html += '<img class="cover" src="' + data.coverDataUri + '" alt=""/>';
  html += '<h1 class="book">' + esc(data.title) + '</h1>';
  var by = [data.subtitle, data.author].filter(Boolean).join(' · ');
  if (by) html += '<p class="byline">' + esc(by) + '</p>';
  var totalWords = data.chapters.reduce(function (sum, ch) { return sum + (ch.words || 0); }, 0);
  if (n && totalWords) html += '<p class="booklen">' + n + (n === 1 ? ' chapter' : ' chapters') + ' · about ' + duration(totalWords) + ' to read</p>';

  var lastVol = null;
  data.chapters.forEach(function (ch, i) {
    html += '<section class="chapter" id="ch' + i + '">';
    if (ch.volume && ch.volume !== lastVol) { html += '<div class="vol">' + esc(ch.volume) + '</div>'; lastVol = ch.volume; }
    html += '<h2>' + esc(ch.title) + '</h2>';
    if (ch.synopsis) html += '<p class="syn">' + esc(ch.synopsis) + '</p>';
    html += '<div class="body">' + ch.html + '</div>';
    html += '<nav class="chnav">';
    if (i > 0) html += '<a class="prev" href="#ch' + (i - 1) + '"><small>Previous</small>' + esc(data.chapters[i - 1].title) + '</a>';
    if (i < n - 1) html += '<a class="next" href="#ch' + (i + 1) + '"><small>Next</small>' + esc(data.chapters[i + 1].title) + '</a>';
    else html += '<span class="done">You’re all caught up.</span>';
    html += '</nav></section>';
    toc.insertAdjacentHTML('beforeend', '<a href="#ch' + i + '">' + esc(ch.title) + '</a>');
  });
  content.innerHTML = html;
  toc.insertAdjacentHTML('beforeend',
    '<div class="keys"><kbd>←</kbd> <kbd>→</kbd> previous / next chapter<br/>' +
    '<kbd>T</kbd> contents · <kbd>P</kbd> read aloud / pause</div>');

  var sections = Array.prototype.slice.call(content.querySelectorAll('section.chapter'));
  var links = Array.prototype.slice.call(toc.querySelectorAll('a'));

  // ---- preferences, remembered per reader ----
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem('cypher-reader') || '{}'); } catch (e) { prefs = {}; }
  var size = prefs.size || 20, lead = prefs.lead || 1.7, width = prefs.width || 40;
  var family = prefs.family || "Georgia, 'Times New Roman', serif";
  var theme = prefs.theme || 'paper';
  var rate = prefs.rate || 1, voiceURI = prefs.voice || null;

  function savePrefs() {
    try {
      localStorage.setItem('cypher-reader', JSON.stringify({
        size: size, lead: lead, width: width, family: family, theme: theme, rate: rate, voice: voiceURI
      }));
    } catch (e) { /* private browsing */ }
  }
  function apply() {
    var r = document.documentElement;
    r.style.setProperty('--reading', size + 'px');
    r.style.setProperty('--leading', String(lead));
    r.style.setProperty('--width', width + 'em');
    r.style.setProperty('--family', family);
    r.setAttribute('data-theme', theme);
    document.getElementById('theme').value = theme;
    document.getElementById('family').value = family;
    savePrefs();
    queueCurrent();
  }

  document.getElementById('theme').onchange = function (e) { theme = e.target.value; apply(); };
  document.getElementById('family').onchange = function (e) { family = e.target.value; apply(); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-size]'), function (b) {
    b.onclick = function () { size = Math.min(30, Math.max(13, size + Number(b.dataset.size))); apply(); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-lead]'), function (b) {
    b.onclick = function () { lead = Math.min(2.4, Math.max(1.2, Math.round((lead + Number(b.dataset.lead) * 0.1) * 10) / 10)); apply(); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-width]'), function (b) {
    b.onclick = function () { width = Math.min(64, Math.max(24, width + Number(b.dataset.width) * 4)); apply(); };
  });

  // ---- contents drawer ----
  var scrim = document.getElementById('scrim');
  function closeToc() { toc.classList.remove('open'); scrim.classList.remove('on'); }
  function toggleToc() {
    toc.classList.toggle('open'); scrim.classList.toggle('on');
    // Open the drawer at the chapter you're reading, not at the top of a long list.
    var cur = toc.querySelector('a.active');
    if (cur && toc.classList.contains('open')) cur.scrollIntoView({ block: 'center' });
  }
  document.getElementById('tocBtn').onclick = toggleToc;
  scrim.onclick = closeToc;
  toc.onclick = function (e) { if (e.target.tagName === 'A') closeToc(); };

  // ---- chapter navigation ----
  var prevBtn = document.getElementById('prevBtn'), nextBtn = document.getElementById('nextBtn');
  function goTo(i) {
    if (i < 0 || i >= n) return;
    sections[i].scrollIntoView();
  }
  prevBtn.onclick = function () { goTo(current - 1); };
  nextBtn.onclick = function () { goTo(current + 1); };

  // ---- where you are: current chapter, time left, saved position ----
  var leftEl = document.getElementById('left');
  // -2 so the first pass always runs and sets the buttons, even on the title page (-1).
  var current = -2, fraction = 0, pending = false;
  var posKey = 'cypher-pos:' + (TOKEN || ('file:' + data.title));

  function updateCurrent() {
    pending = false;
    // The chapter whose heading has passed the upper third of the screen.
    var line = window.innerHeight * 0.33, idx = -1, rect = null;
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].getBoundingClientRect();
      if (r.top <= line) { idx = i; rect = r; } else break;
    }
    fraction = rect ? Math.min(1, Math.max(0, (line - rect.top) / rect.height)) : 0;

    if (idx !== current) {
      if (current >= 0 && links[current]) links[current].classList.remove('active');
      current = idx;
      if (idx >= 0) {
        links[idx].classList.add('active');
        titleEl.innerHTML = esc(data.title) + ' <span class="where">· ' + esc(data.chapters[idx].title) + '</span>';
        if (toc.classList.contains('open')) links[idx].scrollIntoView({ block: 'nearest' });
      } else {
        titleEl.textContent = data.title;
      }
      prevBtn.disabled = idx <= 0;
      nextBtn.disabled = idx >= n - 1;
    }

    if (idx >= 0) {
      var wordsLeft = (data.chapters[idx].words || 0) * (1 - fraction);
      leftEl.textContent = wordsLeft < WPM * 0.75 ? 'Under a minute left in chapter' : '~' + minutes(wordsLeft) + ' min left in chapter';
    } else {
      leftEl.textContent = '';
    }
  }
  function queueCurrent() { if (!pending) { pending = true; requestAnimationFrame(updateCurrent); } }
  window.addEventListener('resize', queueCurrent, { passive: true });

  var saveTimer;
  function savePosition() {
    try {
      localStorage.setItem(posKey, JSON.stringify(current >= 0
        ? { id: data.chapters[current].id, i: current, f: Math.round(fraction * 1000) / 1000, t: Date.now() }
        : { id: null, t: Date.now() }));
    } catch (e) { /* private browsing */ }
  }
  function scrollToPosition(i, f) {
    var r = sections[i].getBoundingClientRect();
    window.scrollTo(0, window.scrollY + r.top + r.height * f - window.innerHeight * 0.33);
  }

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
    queueCurrent();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { updateCurrent(); savePosition(); }, 500);

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

  apply();
  updateCurrent();
  show();

  // ---- "Continue from Chapter 14" ----
  var resumeBox = document.getElementById('resume');
  function hideResume() { resumeBox.hidden = true; }
  setTimeout(function () {
    // A chapter link, or the browser restoring the scroll on reload, already put you somewhere.
    if (location.hash || window.scrollY > 100 || !n) return;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(posKey) || 'null'); } catch (e) { saved = null; }
    if (!saved || saved.id == null) return;
    var idx = -1;
    for (var i = 0; i < n; i++) if (data.chapters[i].id === saved.id) { idx = i; break; }
    if (idx < 0 && saved.i < n) idx = saved.i;
    if (idx < 0 || (idx === 0 && saved.f < 0.05)) return;
    var f = saved.f || 0;
    document.getElementById('resumeText').textContent = 'Continue from ' + data.chapters[idx].title + '?';
    resumeBox.hidden = false;
    document.getElementById('resumeGo').onclick = function () { hideResume(); scrollToPosition(idx, f); };
    document.getElementById('resumeNo').onclick = hideResume;
    setTimeout(hideResume, 15000);
  }, 60);

  // ---- read aloud, using the browser's own voices ----
  var synth = window.speechSynthesis;
  var listenBtn = document.getElementById('listenBtn');
  var speechBox = document.getElementById('speech');
  var spPlay = document.getElementById('spPlay');
  var spVoice = document.getElementById('spVoice');
  var spRate = document.getElementById('spRate');
  var voices = [], voice = null, units = null;
  var tts = { state: 'idle', unit: 0, chunk: 0, gen: 0, errors: 0 };
  var speakingEl = null, userScrolledAt = 0, keepAlive = null;
  var isAndroid = /Android/i.test(navigator.userAgent);
  var lang = (data.language || 'en').toLowerCase().split('-')[0];

  function scoreVoice(v) {
    var s = 0;
    if (v.lang && v.lang.toLowerCase().split(/[-_]/)[0] === lang) s += 10;
    if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 5;
    if (/google/i.test(v.name)) s += 3;
    if (v.default) s += 1;
    return s;
  }
  function loadVoices() {
    if (!synth) return;
    var list = synth.getVoices() || [];
    if (!list.length) return;
    voices = list.slice().sort(function (a, b) { return scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name); });
    voice = null;
    for (var i = 0; i < voices.length; i++) if (voices[i].voiceURI === voiceURI) { voice = voices[i]; break; }
    if (!voice) voice = voices[0];
    spVoice.innerHTML = voices.map(function (v, i) {
      return '<option value="' + i + '"' + (v === voice ? ' selected' : '') + '>' + esc(v.name.replace(/^(Microsoft|Google) /, '')) + ' (' + esc(v.lang) + ')</option>';
    }).join('');
    listenBtn.hidden = false;
  }
  if (synth) {
    loadVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
    setTimeout(loadVoices, 1000);
  }

  // Every paragraph-sized block that can be spoken, in reading order.
  var BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,pre';
  function textOf(el) {
    var copy = el.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll('.footnote-ref,sup'), function (x) { x.remove(); });
    return (copy.textContent || '').replace(/\\s+/g, ' ').trim();
  }
  function buildUnits() {
    var out = [];
    sections.forEach(function (sec) {
      var els = [sec.querySelector('h2')];
      Array.prototype.forEach.call(sec.querySelectorAll('.body p,.body li,.body h1,.body h2,.body h3,.body h4,.body h5,.body h6,.body blockquote,.body pre'), function (el) {
        if (el.closest('.footnotes') || el.classList.contains('scene-break')) return;
        if (el.querySelector(BLOCK)) return; // its children are spoken instead
        els.push(el);
      });
      els.forEach(function (el) {
        if (!el) return;
        var t = textOf(el);
        if (t && /[\\p{L}\\p{N}]/u.test(t)) out.push({ el: el, text: t, chunks: null });
      });
    });
    return out;
  }
  // Short pieces, split at sentence ends: some browsers (Chrome) stop a long utterance part-way.
  function splitText(text) {
    var MAX = 220, sentences = [], start = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if ((c === '.' || c === '!' || c === '?' || c === '…') && (i + 1 === text.length || text[i + 1] === ' ')) {
        sentences.push(text.slice(start, i + 1)); start = i + 1;
      }
    }
    if (start < text.length) sentences.push(text.slice(start));
    var out = [], buf = '';
    sentences.forEach(function (s) {
      while (s.length > MAX) {
        var cut = s.lastIndexOf(', ', MAX);
        if (cut < MAX / 2) cut = s.lastIndexOf(' ', MAX);
        if (cut < 1) cut = MAX;
        if (buf) { out.push(buf); buf = ''; }
        out.push(s.slice(0, cut + 1)); s = s.slice(cut + 1);
      }
      if (buf && buf.length + s.length > MAX) { out.push(buf); buf = ''; }
      buf += s;
    });
    if (buf) out.push(buf);
    return out.filter(function (x) { return x.trim(); });
  }

  function markSpeaking(el) {
    if (speakingEl === el) return;
    if (speakingEl) speakingEl.classList.remove('speaking');
    speakingEl = el;
    if (!el) return;
    el.classList.add('speaking');
    // Follow along, unless the reader has just scrolled somewhere on purpose.
    if (Date.now() - userScrolledAt < 6000) return;
    var r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight * 0.75) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function speakCurrent() {
    var gen = tts.gen;
    var u = units[tts.unit];
    if (!u) return stopSpeech();
    if (!u.chunks) u.chunks = splitText(u.text);
    if (tts.chunk >= u.chunks.length) { tts.unit++; tts.chunk = 0; return speakCurrent(); }
    markSpeaking(u.el);
    var ut = new SpeechSynthesisUtterance(u.chunks[tts.chunk]);
    if (voice) { ut.voice = voice; ut.lang = voice.lang; } else ut.lang = data.language || 'en';
    ut.rate = rate;
    ut.onend = function () {
      if (gen !== tts.gen || tts.state !== 'playing') return;
      tts.errors = 0; tts.chunk++; speakCurrent();
    };
    ut.onerror = function (e) {
      if (gen !== tts.gen || tts.state !== 'playing') return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      // Skip a piece the engine can't say, but give up if nothing works.
      if (++tts.errors > 3) return stopSpeech();
      tts.chunk++; speakCurrent();
    };
    synth.speak(ut);
  }

  function firstVisibleUnit() {
    for (var i = 0; i < units.length; i++) {
      if (units[i].el.getBoundingClientRect().bottom > 70) return i;
    }
    return 0;
  }
  function setState(s) {
    tts.state = s;
    var on = s !== 'idle';
    speechBox.hidden = !on;
    document.body.classList.toggle('listening', on);
    listenBtn.classList.toggle('on', on);
    listenBtn.firstChild.textContent = s === 'playing' ? '❚❚' : '▶';
    listenBtn.lastChild.textContent = s === 'playing' ? ' Pause' : s === 'paused' ? ' Resume' : ' Listen';
    spPlay.textContent = s === 'playing' ? '❚❚' : '▶';
    spPlay.title = s === 'playing' ? 'Pause (P)' : 'Play (P)';
    clearInterval(keepAlive);
    // Chrome's online voices fall silent after ~15s of continuous speech without this nudge.
    if (s === 'playing' && !isAndroid) {
      keepAlive = setInterval(function () { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } }, 10000);
    }
  }
  // Pausing cancels and remembers the place: pause()/resume() are unreliable on several browsers.
  function playFrom(unit, chunk) {
    if (!units) units = buildUnits();
    if (!units.length) return;
    tts.unit = Math.max(0, Math.min(units.length - 1, unit));
    tts.chunk = chunk || 0;
    tts.gen++;
    tts.errors = 0;
    synth.cancel();
    setState('playing');
    var gen = tts.gen;
    setTimeout(function () { if (gen === tts.gen) speakCurrent(); }, 60);
  }
  function pauseSpeech() {
    tts.gen++;
    synth.cancel();
    setState('paused');
  }
  function stopSpeech() {
    tts.gen++;
    if (synth) synth.cancel();
    markSpeaking(null);
    setState('idle');
  }
  function toggleSpeech() {
    if (!synth || listenBtn.hidden) return;
    if (tts.state === 'playing') pauseSpeech();
    else if (tts.state === 'paused') playFrom(tts.unit, tts.chunk);
    else { if (!units) units = buildUnits(); userScrolledAt = 0; playFrom(firstVisibleUnit(), 0); }
  }

  listenBtn.onclick = toggleSpeech;
  spPlay.onclick = toggleSpeech;
  document.getElementById('spStop').onclick = stopSpeech;
  document.getElementById('spPrev').onclick = function () { userScrolledAt = 0; playFrom(tts.unit - 1, 0); };
  document.getElementById('spNext').onclick = function () { userScrolledAt = 0; playFrom(tts.unit + 1, 0); };
  spRate.value = String(rate);
  spRate.onchange = function () {
    rate = Number(spRate.value) || 1; savePrefs();
    if (tts.state === 'playing') playFrom(tts.unit, tts.chunk);
  };
  spVoice.onchange = function () {
    voice = voices[Number(spVoice.value)] || voice;
    voiceURI = voice ? voice.voiceURI : null; savePrefs();
    if (tts.state === 'playing') playFrom(tts.unit, tts.chunk);
  };
  // While listening, tapping a paragraph jumps the voice there.
  content.addEventListener('click', function (e) {
    if (tts.state === 'idle' || e.target.closest('a')) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && String(sel).length) return;
    for (var i = 0; i < units.length; i++) {
      if (units[i].el.contains(e.target)) { userScrolledAt = 0; playFrom(i, 0); return; }
    }
  });
  ['wheel', 'touchmove'].forEach(function (ev) {
    window.addEventListener(ev, function () { userScrolledAt = Date.now(); }, { passive: true });
  });
  window.addEventListener('pagehide', function () { if (synth) synth.cancel(); });

  // ---- keyboard ----
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) return;
    var k = e.key;
    if (k === 'ArrowLeft') { goTo(current - 1); e.preventDefault(); }
    else if (k === 'ArrowRight') { goTo(current + 1); e.preventDefault(); }
    else if (k === 't' || k === 'T') toggleToc();
    else if (k === 'p' || k === 'P') toggleSpeech();
    else if (k === 'Escape') { if (toc.classList.contains('open')) closeToc(); else hideResume(); }
    else if (k === 'PageDown' || k === 'PageUp' || k === 'ArrowDown' || k === 'ArrowUp' || k === ' ') userScrolledAt = Date.now();
  });

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
