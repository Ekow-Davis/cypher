# Cypher

A local-first Windows desktop app: a private, encrypted journal written in a
custom script, plus a public writing studio (a Word-style Document editor and a
Reedsy-style Book writer). Built with Electron + Vue 3 + TypeScript.

See `CYPHER_Documentation.md` for the full specification.

## Status — Phase 1: Scaffold

This is the runnable skeleton: a dark, multi-domain shell you can navigate
(Diary / Document / Book), the secure main-renderer bridge, hash routing, Pinia
state, and the theme. The database, the swappable font system, and the actual
features land in later phases.

## Requirements

- Node.js 20+ (22 recommended)
- Windows is the primary target; development also works on macOS/Linux.

## Getting started

    npm install
    npm run dev

You should see a dark window titled "Cypher" with a left rail that switches
between the three domains.

## Scripts

- `npm run dev` — start in development with hot reload
- `npm run typecheck` — type-check main, preload, and renderer
- `npm run build` — type-check and build for production
- `npm run build:win` — build the Windows installer **and** the portable .exe
  (output in `dist/`)
- `npm run build:unpack` — build an unpacked app for quick local testing

## Structure

    src/
      main/        Electron main process (windows, IPC; later: db, crypto, fonts)
      preload/     Secure contextBridge API exposed as window.cypher
      renderer/    Vue 3 app
        src/
          domains/      diary · document · book
          components/   shared UI (SidebarRail, ...)
          router/       hash-based routing
          stores/       Pinia state
          styles/       Tailwind v4 + theme tokens

## Notes

- The "Cypher script" is a swappable font. It points at Segoe UI today; when
  `Cypher.ttf` is ready it is registered and the script goes live with no code
  changes (`--font-script` in `styles/main.css`).
- Installer code-signing is intentionally deferred. Unsigned builds show a
  Windows SmartScreen warning on first run; we add signing before wider
  distribution.
