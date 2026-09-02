import { brandSvg } from './shared/brandMark.js'

/**
 * Transactional email through Resend.
 *
 * Called over Resend's REST API rather than through their SDK: this sends two
 * kinds of message, and a direct fetch keeps the server's dependency list —
 * and its update surface — smaller.
 *
 * Sending never throws into a request handler. An account should still be
 * created if the welcome email fails; a password reset should still say
 * "check your inbox" rather than leaking whether the address exists.
 */

const ACCENT = '#a78bfa'

function config(): { key: string; from: string } | null {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return null
  const from = process.env.EMAIL_FROM?.trim() || 'Cypher <no-reply@forgottenguardian.com>'
  return { key, from }
}

export function emailConfigured(): boolean {
  return config() !== null
}

async function send(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const settings = config()
  if (!settings) {
    console.warn('[email] RESEND_API_KEY is not set — skipping:', subject)
    return false
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: settings.from, to, subject, html, text })
    })
    if (!response.ok) {
      console.error('[email] send failed', response.status, await response.text().catch(() => ''))
      return false
    }
    return true
  } catch (error) {
    console.error('[email] send threw:', error)
    return false
  }
}

function layout(heading: string, body: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;background:#0f0d14;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:34rem;margin:0 auto;padding:2.5rem 1.5rem;color:#ece9f3">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:2rem">
      ${brandSvg(28)}
      <span style="font-weight:700;font-size:1.1rem">Cypher</span>
    </div>
    <h1 style="font-size:1.35rem;margin:0 0 1rem">${heading}</h1>
    ${body}
    <p style="color:#9d95ad;font-size:.8rem;margin-top:2.5rem;border-top:1px solid #272134;padding-top:1.2rem">
      Cypher — a local-first writing app. You're getting this because someone used this address to
      sign up. If that wasn't you, ignore this message and nothing will happen.
    </p>
  </div>
</body></html>`
}

function button(href: string, label: string): string {
  return `<p style="margin:1.6rem 0">
    <a href="${href}" style="background:${ACCENT};color:#1a1030;text-decoration:none;font-weight:600;
       padding:.75rem 1.4rem;border-radius:.7rem;display:inline-block">${label}</a>
  </p>`
}

export async function sendWelcome(
  to: string,
  displayName: string,
  writerId: string,
  joinCode: string,
  baseUrl: string
): Promise<boolean> {
  const html = layout(
    `Welcome, ${escapeHtml(displayName)}`,
    `<p style="color:#c9c4d6;line-height:1.6">Your Cypher account is ready. You only need it to
     write a book together with someone — everything else in Cypher works offline as it always did.</p>
     <p style="color:#c9c4d6;line-height:1.6">Two things identify you to a co-writer:</p>
     <table style="width:100%;border-collapse:collapse;margin:1.2rem 0">
       <tr><td style="padding:.6rem 0;color:#9d95ad;font-size:.85rem">Writer ID</td></tr>
       <tr><td style="padding:0 0 1rem;font-family:ui-monospace,Menlo,Consolas,monospace;
           font-size:.85rem;word-break:break-all">${escapeHtml(writerId)}</td></tr>
       <tr><td style="padding:.6rem 0;color:#9d95ad;font-size:.85rem">Join code</td></tr>
       <tr><td style="padding:0;font-family:ui-monospace,Menlo,Consolas,monospace;
           font-size:.85rem">${escapeHtml(joinCode)}</td></tr>
     </table>
     <p style="color:#c9c4d6;line-height:1.6">Someone needs <strong>both</strong> before they can add
     you to a book — and you can change the join code any time to cancel invitations you haven't
     accepted.</p>
     ${button(`${baseUrl}/account`, 'Open your account')}`
  )
  const text = `Welcome to Cypher, ${displayName}.

Your writer ID: ${writerId}
Your join code: ${joinCode}

Someone needs both before they can add you to a book. You can change the join code at any time.

Manage your account: ${baseUrl}/account`
  return send(to, 'Your Cypher account', html, text)
}

export async function sendPasswordReset(
  to: string,
  resetUrl: string,
  minutes: number
): Promise<boolean> {
  const html = layout(
    'Reset your password',
    `<p style="color:#c9c4d6;line-height:1.6">Use the button below to choose a new password. The
     link works once and expires in ${minutes} minutes.</p>
     ${button(resetUrl, 'Choose a new password')}
     <p style="color:#9d95ad;font-size:.85rem;line-height:1.6">If the button doesn't work, paste
     this into your browser:<br/><span style="word-break:break-all">${escapeHtml(resetUrl)}</span></p>
     <p style="color:#c9c4d6;line-height:1.6">Didn't ask for this? You can ignore it — your password
     stays as it is.</p>`
  )
  const text = `Reset your Cypher password.

Open this link to choose a new one (works once, expires in ${minutes} minutes):
${resetUrl}

Didn't ask for this? Ignore this email; your password stays as it is.`
  return send(to, 'Reset your Cypher password', html, text)
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}
