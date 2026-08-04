import { assetUrl } from './assets'

const STYLE_ID = 'cypher-script-font-face'

/**
 * Installs the custom @font-face and repoints --font-script at it. Called once
 * at boot and again whenever the font changes, so importing a new font takes
 * effect immediately with no restart.
 */
export async function applyScriptFont(): Promise<void> {
  let font: { path: string; format: string } | null = null
  try {
    font = await window.cypher.fonts.get()
  } catch {
    font = null
  }

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }

  if (!font) {
    style.textContent = ''
    document.documentElement.style.removeProperty('--font-script')
    return
  }

  const url = assetUrl(font.path)
  style.textContent = `@font-face {
    font-family: 'CypherScript';
    src: url('${url}') format('${font.format}');
    font-display: swap;
  }`
  // Keep the fallback chain: if the file ever fails to load, text degrades to
  // a readable typeface rather than rendering as blank boxes.
  document.documentElement.style.setProperty(
    '--font-script',
    "'CypherScript', 'Segoe UI', system-ui, sans-serif"
  )
}
