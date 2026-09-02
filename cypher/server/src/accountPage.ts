import { faviconDataUri, brandSvg } from './shared/brandMark.js'
import type { User } from './auth.js'

/**
 * Sign-up, sign-in and the account page.
 *
 * Served from the same origin as everything else, and deliberately plain: this
 * is a page people visit two or three times, so it uses forms and full page
 * loads rather than shipping a framework for it.
 */

const ACCENT = '#a78bfa'

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} — Cypher</title>
<link rel="icon" href="${faviconDataUri()}"/>
<style>
:root { --bg:#0f0d14; --panel:#17141f; --line:#272134; --ink:#ece9f3; --dim:#9d95ad; --accent:${ACCENT}; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif; line-height:1.6; }
header { padding:1.2rem 1.5rem; border-bottom:1px solid var(--line); }
.brand { display:flex; align-items:center; gap:.7rem; font-weight:700; font-size:1.15rem;
  max-width:60rem; margin:0 auto; text-decoration:none; color:var(--ink); }
main { max-width:30rem; margin:0 auto; padding:3rem 1.5rem 5rem; }
main.wide { max-width:42rem; }
h1 { font-size:1.6rem; margin:0 0 .4rem; }
p.sub { color:var(--dim); margin:0 0 2rem; }
label { display:block; font-size:.78rem; text-transform:uppercase; letter-spacing:.05em;
  color:var(--dim); margin:0 0 .35rem; }
input { width:100%; background:var(--bg); border:1px solid var(--line); color:var(--ink);
  border-radius:.7rem; padding:.7rem .9rem; font:inherit; outline:none; margin:0 0 1.1rem; }
input:focus { border-color:var(--accent); }
button { width:100%; background:var(--accent); color:#1a1030; border:none; border-radius:.7rem;
  padding:.8rem; font:inherit; font-weight:600; cursor:pointer; }
button:hover { opacity:.92; }
button.ghost { background:transparent; border:1px solid var(--line); color:var(--ink); }
.alt { text-align:center; margin-top:1.4rem; color:var(--dim); font-size:.9rem; }
.alt a { color:var(--accent); }
.error { background:rgb(248 113 113 / 12%); color:#fca5a5; border-radius:.6rem;
  padding:.7rem .9rem; margin:0 0 1.2rem; font-size:.88rem; }
.ok { background:rgb(167 139 250 / 14%); color:var(--accent); border-radius:.6rem;
  padding:.7rem .9rem; margin:0 0 1.2rem; font-size:.88rem; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:1rem;
  padding:1.3rem; margin:0 0 1rem; }
.card h2 { font-size:1rem; margin:0 0 .3rem; }
.card p { color:var(--dim); font-size:.88rem; margin:0 0 1rem; }
.value { display:flex; align-items:center; gap:.6rem; background:var(--bg);
  border:1px solid var(--line); border-radius:.6rem; padding:.6rem .8rem;
  font-family:ui-monospace,Menlo,Consolas,monospace; font-size:.9rem; word-break:break-all; }
.value button { width:auto; padding:.35rem .7rem; font-size:.78rem; }
.row { display:flex; gap:.6rem; }
.row form { flex:1; }
.muted { color:var(--dim); font-size:.8rem; margin-top:.5rem; }
</style>
</head>
<body>
<header><a class="brand" href="/">${brandSvg(32)} Cypher</a></header>
${body}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

export function signUpPage(error?: string, email = ''): string {
  return shell(
    'Create an account',
    `<main>
      <h1>Create an account</h1>
      <p class="sub">An account is only needed to write a book together with someone. Cypher works
      fully offline without one.</p>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/account/signup">
        <label for="name">Display name</label>
        <input id="name" name="displayName" placeholder="What your co-writer will see"/>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required value="${escapeHtml(email)}"/>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required minlength="8"
               placeholder="At least 8 characters"/>
        <button type="submit">Create account</button>
      </form>
      <p class="alt">Already have one? <a href="/account/login">Sign in</a></p>
    </main>`
  )
}

export function logInPage(error?: string, email = ''): string {
  return shell(
    'Sign in',
    `<main>
      <h1>Sign in</h1>
      <p class="sub">To manage your account and collaboration details.</p>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/account/login">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required value="${escapeHtml(email)}"/>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required/>
        <button type="submit">Sign in</button>
      </form>
      <p class="alt">No account yet? <a href="/account/signup">Create one</a></p>
    </main>`
  )
}

export function accountPage(user: User, notice?: string): string {
  return shell(
    'Your account',
    `<main class="wide">
      <h1>Your account</h1>
      <p class="sub">${escapeHtml(user.email)}</p>
      ${notice ? `<p class="ok">${escapeHtml(notice)}</p>` : ''}

      <div class="card">
        <h2>Your writer ID</h2>
        <p>Give this to someone who wants to add you to a book. It never changes.</p>
        <div class="value">
          <span id="uuid">${escapeHtml(user.id)}</span>
          <button class="ghost" onclick="copy('uuid', this)">Copy</button>
        </div>
      </div>

      <div class="card">
        <h2>Your join code</h2>
        <p>Needed alongside your writer ID before anyone can add you to a book. Share it only with
        someone you actually want to write with — and change it if you'd rather no one used it again.</p>
        <div class="value">
          <span id="code">${escapeHtml(user.join_code)}</span>
          <button class="ghost" onclick="copy('code', this)">Copy</button>
        </div>
        <form method="post" action="/account/rotate" style="margin-top:1rem">
          <button class="ghost" type="submit">Change my join code</button>
        </form>
        <p class="muted">Changing it means any invitation that hasn't been accepted stops working.</p>
      </div>

      <div class="card">
        <h2>Display name</h2>
        <p>Shown to people you write with.</p>
        <form method="post" action="/account/name">
          <input name="displayName" value="${escapeHtml(user.display_name)}" required/>
          <button type="submit">Save name</button>
        </form>
      </div>

      <div class="card">
        <h2>Change password</h2>
        <p>You'll be signed out everywhere else.</p>
        <form method="post" action="/account/password">
          <label for="current">Current password</label>
          <input id="current" name="currentPassword" type="password" required/>
          <label for="next">New password</label>
          <input id="next" name="newPassword" type="password" required minlength="8"/>
          <button type="submit">Change password</button>
        </form>
      </div>

      <form method="post" action="/account/logout">
        <button class="ghost" type="submit">Sign out</button>
      </form>
    </main>
    <script>
      function copy(id, button) {
        navigator.clipboard.writeText(document.getElementById(id).textContent.trim());
        var original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = original; }, 1500);
      }
    </script>`
  )
}
