/**
 * The public face of Cypher: what the app is, where to get it, and a box for
 * opening a shared link.
 *
 * Served from the same Fastify process as the reader so a shared book lives at
 * the same origin as the site that explains it — one domain, one certificate,
 * and no cross-origin hop between the page and the API.
 */

import { faviconDataUri, brandSvg } from './shared/brandMark.js'

const ACCENT = '#a78bfa'

export interface LandingOptions {
  /** Where the installer lives — a GitHub release, usually. */
  downloadUrl?: string
  /** Where the portable exe lives, if offered. */
  portableUrl?: string
  version?: string
}

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Book',
    body: 'Chapters, volumes, lore and a cast that cross-reference each other. Track drafts by status, watch your word count build, and export to Word, PDF or EPUB when it is ready.'
  },
  {
    title: 'Document',
    body: 'A familiar page-based editor with real pagination, footnotes, a live table of contents, comments and cross-references — for everything that is not a novel.'
  },
  {
    title: 'Reader',
    body: 'Your EPUB and PDF library, with bookmarks, highlights and notes kept alongside whatever you are writing.'
  },
  {
    title: 'Diary',
    body: 'A private journal encrypted on your own machine, behind its own password. Nothing syncs, nothing uploads, and there is no recovery link — because there is no one to recover it from.'
  }
]

export function renderLandingPage(options: LandingOptions = {}): string {
  const download = options.downloadUrl ?? ''
  const portable = options.portableUrl ?? ''
  const version = options.version ?? ''

  const features = FEATURES.map(
    (f) => `<article class="card">
      <h3>${f.title}</h3>
      <p>${f.body}</p>
    </article>`
  ).join('')

  const downloadBlock = download
    ? `<div class="downloads">
         <a class="btn primary" href="${download}">Download Cypher${version ? ` · ${version}` : ''}</a>
         ${portable ? `<a class="btn ghost" href="${portable}">Portable version</a>` : ''}
       </div>
       <p class="fineprint">Unsigned build — Windows will ask you to confirm via <em>More info → Run anyway</em>.</p>
       <details class="which">
         <summary>Which one should I pick?</summary>
         <div class="which-body">
           <p><strong>Cypher (installer)</strong> — the normal choice. Adds a Start Menu shortcut
           and updates itself automatically from then on. Your books, documents and diary are
           stored separately from the program, so uninstalling later keeps everything safe —
           reinstalling brings it all back.</p>
           <p><strong>Portable</strong> — a single file with nothing to install, for a USB stick or
           a machine where you can't install software. Everything it saves lives in a folder next
           to the exe, so the two travel together: move that folder along with the exe to take
           your work with you, and deleting the exe's folder deletes your work too. It does not
           update itself — check back here for a newer version when you want one.</p>
         </div>
       </details>`
    : `<p class="fineprint">Downloads are not published yet.</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Cypher — write privately, share deliberately</title>
<link rel="icon" href="${faviconDataUri()}"/>
<meta name="description" content="A local-first desktop app for writing books, documents and a private encrypted diary."/>
<style>
:root { --bg:#0f0d14; --panel:#17141f; --line:#272134; --ink:#ece9f3; --dim:#9d95ad; --accent:${ACCENT}; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif; line-height:1.6; }
.wrap { max-width:60rem; margin:0 auto; padding:0 1.5rem; }
header { padding:1.2rem 0; border-bottom:1px solid var(--line); }
.brand { display:flex; align-items:center; gap:.7rem; font-weight:700; font-size:1.15rem; }
.hero { padding:5rem 0 4rem; text-align:center; }
.hero h1 { font-size:clamp(2.2rem,6vw,3.4rem); margin:0 0 1rem; letter-spacing:-.02em; }
.hero p.lead { font-size:1.15rem; color:var(--dim); max-width:34rem; margin:0 auto 2rem; }
.btn { display:inline-block; padding:.8rem 1.5rem; border-radius:.8rem; font-weight:600;
  text-decoration:none; border:1px solid var(--line); color:var(--ink); }
.btn.primary { background:var(--accent); color:#1a1030; border-color:transparent; }
.btn.primary:hover { opacity:.9; }
.fineprint { color:var(--dim); font-size:.82rem; margin:.9rem 0 0; }
.downloads { display:flex; gap:.6rem; justify-content:center; flex-wrap:wrap; }
.btn.ghost { background:transparent; }
.which { margin:1.1rem auto 0; max-width:30rem; text-align:left; }
.which summary { cursor:pointer; color:var(--accent); font-size:.85rem; text-align:center; }
.which-body { margin-top:.7rem; padding:1rem; background:var(--panel); border:1px solid var(--line);
  border-radius:.8rem; font-size:.85rem; color:var(--dim); }
.which-body p { margin:0 0 .8rem; }
.which-body p:last-child { margin-bottom:0; }
.which-body strong { color:var(--ink); }
h2.section { font-size:1.5rem; margin:0 0 1.5rem; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(15rem,1fr)); gap:1rem; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:1rem; padding:1.3rem; }
.card h3 { margin:0 0 .5rem; font-size:1.05rem; color:var(--accent); }
.card p { margin:0; color:var(--dim); font-size:.92rem; }
section { padding:3.5rem 0; border-top:1px solid var(--line); }
.readbox { background:var(--panel); border:1px solid var(--line); border-radius:1rem; padding:1.6rem; }
.readrow { display:flex; gap:.6rem; flex-wrap:wrap; margin-top:1rem; }
.readrow input { flex:1 1 18rem; min-width:0; background:var(--bg); border:1px solid var(--line);
  color:var(--ink); border-radius:.7rem; padding:.75rem .9rem; font:inherit; outline:none; }
.readrow input:focus { border-color:var(--accent); }
.readrow button { background:var(--accent); color:#1a1030; border:none; border-radius:.7rem;
  padding:.75rem 1.4rem; font:inherit; font-weight:600; cursor:pointer; }
#readErr { color:#fca5a5; font-size:.85rem; margin:.7rem 0 0; min-height:1.2em; }
footer { border-top:1px solid var(--line); padding:2rem 0 3rem; color:var(--dim); font-size:.85rem; }
</style>
</head>
<body>
<header><div class="wrap brand">${brandSvg(40)} Cypher</div></header>

<div class="wrap">
  <div class="hero">
    <h1>Write privately. Share deliberately.</h1>
    <p class="lead">
      A desktop writing studio that keeps everything on your own machine — your manuscripts,
      your library, and a diary nobody else can open. Share a draft only when you choose to.
    </p>
    ${downloadBlock}
  </div>

  <section>
    <h2 class="section">Four rooms, one app</h2>
    <div class="grid">${features}</div>
  </section>

  <section>
    <h2 class="section">Been sent a link?</h2>
    <div class="readbox">
      <p style="margin:0;color:var(--dim)">
        Paste a share link or its code below and it will open in a new tab. No account needed.
      </p>
      <div class="readrow">
        <input id="linkInput" placeholder="https://…/s/abc123  or just  abc123"
               autocomplete="off" spellcheck="false"/>
        <button id="readBtn">Read</button>
      </div>
      <p id="readErr"></p>
    </div>
  </section>

  <section>
    <h2 class="section">Your work stays yours</h2>
    <div class="grid">
      <article class="card">
        <h3>Local first</h3>
        <p>Everything is stored on your machine in a single database file. The app works with no internet connection at all.</p>
      </article>
      <article class="card">
        <h3>Encrypted diary</h3>
        <p>Diary entries are encrypted with AES-256 behind a password only you know. It never leaves your computer.</p>
      </article>
      <article class="card">
        <h3>Sharing is opt-in</h3>
        <p>Nothing is published unless you press publish. Links can be scoped to certain chapters, expire on a date, and be revoked at any time.</p>
      </article>
    </div>
  </section>
</div>

<footer><div class="wrap">Cypher — a local-first writing app.</div></footer>

<script>
(function () {
  var input = document.getElementById('linkInput');
  var err = document.getElementById('readErr');

  /**
   * Accepts a full URL or a bare token. Readers paste whatever they were sent,
   * so pulling the token out of a URL is friendlier than demanding one form.
   */
  function tokenFrom(value) {
    var raw = String(value || '').trim();
    if (!raw) return null;
    var match = raw.match(/\\/s\\/([A-Za-z0-9_-]+)/);
    if (match) return match[1];
    if (/^[A-Za-z0-9_-]{8,}$/.test(raw)) return raw;
    return null;
  }

  function go() {
    var token = tokenFrom(input.value);
    if (!token) {
      err.textContent = 'That does not look like a share link or code.';
      return;
    }
    err.textContent = '';
    window.open('/s/' + encodeURIComponent(token), '_blank', 'noopener');
  }

  document.getElementById('readBtn').addEventListener('click', go);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  input.addEventListener('input', function () { err.textContent = ''; });
})();
</script>
</body>
</html>`
}
