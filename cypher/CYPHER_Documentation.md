# Cypher — Project Documentation & Technical Specification

**Version:** 1.0 (pre-build blueprint)
**Platform:** Windows desktop (Electron)
**Status:** Specification locked, ready for Phase 1
**Last updated:** 18 June 2026

---

## 1. Overview

Cypher is a local-first Windows desktop application that combines a private encrypted journal written in a custom personal script with a full-featured public writing environment. The long-term ambition is for the public side to be capable enough to replace Microsoft Word for everyday writing, and for the book side to match the planning-and-drafting workflow of Reedsy Studio.

The application has two top-level domains:

- **Private** — the Diary. A secured journaling space that renders in the Cypher script font, gated behind a password to open and a separate password to translate (decipher) content.
- **Public** — split into two workspaces:
  - **Document** — a Word-style rich text editor for standalone documents.
  - **Book** — a Reedsy-style long-form writing environment with chapters, volumes, characters, lore, goals, and export.

Everything runs and stores data locally. The only feature that touches the internet is the optional Reader/Share system, which publishes read-only snapshots of selected public content to a small hosted backend.

### Guiding principles

- **Local-first.** All core functionality (writing, journaling, formatting, backup, translation) works fully offline. No login is required to use the app.
- **Privacy by design.** The diary is encrypted at rest. Even someone who opens the diary section cannot read entries without the translate password, because the content is rendered in an undecipherable script.
- **Build incrementally without blocking.** The custom font is treated as a swappable asset. Development uses Segoe UI as a stand-in so the entire app, including the diary and translation features, can be built and tested before the real glyph font exists.
- **No half-finished work goes live.** Anything that leaves the machine (share links) requires a deliberate manual publish action.

---

## 2. Architecture

### 2.1 Stack

- **Shell:** Electron (packaged as a Windows `.exe` installer; final size budget of a few hundred MB to ~1 GB is acceptable).
- **Frontend:** Vue 3 (Composition API) with Pinia for state and Tailwind CSS for styling.
- **Rich text editor:** Tiptap (ProseMirror-based). Chosen because it is extensible enough to support custom marks/nodes for character links, the Cypher font mark, drop caps, footnotes, and the chapter-split mechanic, while giving a clean Vue integration.
- **Local database:** SQLite via `better-sqlite3`, stored in the app's user-data directory.
- **Encryption:** Node `crypto` with AES-256-GCM. Keys are derived from the user's passwords using a slow KDF (scrypt or PBKDF2 with a high iteration count) plus a per-install salt.
- **Document interop:** `mammoth` for reading/importing `.docx` into editor HTML; a docx generation library for export; `pdf.js` for the in-app PDF reader; an EPUB library for EPUB export and parsing.
- **Share backend (optional, online):** A small FastAPI service with a PostgreSQL database hosted on Railway. FastAPI is chosen for stack familiarity; Railway supports hosted Postgres on usage-based pricing, which suits the low, intermittent traffic of a read-only reader.

### 2.2 Multi-window model

Cypher is a multi-window application, mirroring Reedsy's behaviour. Each book opens in its own Electron `BrowserWindow` instance with independent editor state and scroll position. The Book, Lore, and Characters views of a single book can each be opened as separate windows so the writer can draft in one and reference another side by side without constantly switching screens.

- Right-click on a book, character, or lore item exposes an **"Open in new window"** action.
- All windows read from and write to the same local SQLite database, so a save in one window is reflected the next time another window reads that record. This keeps word counts, character sheets, and chapter content consistent across windows.

### 2.3 Process responsibilities

- **Main process:** window management, file system access, database access, encryption/decryption, backup scheduling, font installation to the system, share-publish requests to the backend.
- **Renderer (Vue):** all UI, editor, and view logic. Talks to the main process over IPC for anything touching disk, crypto, or the network.

---

## 3. The Font / Glyph System (central, swappable)

This is the backbone of the diary and the single most important thing to get right architecturally, because it must be buildable and testable **before** the real glyph font is finished.

### 3.1 The abstraction

Cypher treats the personal script as a **named, swappable font asset** — referred to internally as the *Cypher script font*. The application never hard-codes glyph shapes. Instead:

- A font is registered under a logical name (e.g. `cypher-script`).
- Until a real `Cypher.ttf` is provided, `cypher-script` **points to Segoe UI** as its placeholder.
- When the real font is ready, the user drops the `.ttf` into the app (Settings → Fonts → "Set Cypher script font") and the logical `cypher-script` name is repointed at the new file. No code changes, no rebuild — just an asset swap and a config update.

Because the font is loaded via CSS `@font-face` from a file in the app-data directory, swapping it is a runtime operation. This means the diary, the translation toggle, and the in-story Cypher-font usage can all be built and verified today using Segoe UI, and "go live" with the true script the moment the `.ttf` exists.

### 3.2 "Translation" is font swapping

The diary's translate function is, mechanically, a font swap rather than a true character-level translation. The underlying text is always standard characters (a, b, c…); what changes is the font used to render them:

- **Encoded view (default):** text rendered in `cypher-script` (Segoe UI now, real glyphs later) — unreadable to anyone who doesn't know the script.
- **Translated view:** the same text rendered in a plain reading font (the "both ways" the user described — encode ⇄ decode is just toggling which font renders the run).

Using Segoe UI as the base lets us test this round-trip immediately: toggling "translate" should visibly switch the rendering font of the selected scope and back. With the real glyph font in place, the encoded view becomes the actual personal script.

### 3.3 Font management features

- **Bundled fonts:** a small curated set of fonts ships inside the app (keeps the installer lean).
- **Downloadable fonts:** additional fonts are fetched on demand rather than bundled, so the `.exe` does not carry a huge font library. (This is the one place outside the share feature that may use the network, and it is optional.)
- **Custom font upload:** users can add their own `.ttf`/`.otf` — including `Cypher.ttf`.
- **System install:** a button installs the Cypher font into the Windows fonts folder so it can be used in other applications (Word, etc.), supporting the "use my script anywhere" goal.

---

## 4. Private Side — Diary

### 4.1 Security model

Two **distinct, independently changeable** passwords:

1. **Entry password** — required to open/enter the Diary section at all.
2. **Translate password** — required to decipher (font-swap to readable) any diary content.

The two are deliberately separate. The rationale: if someone gains access to the unlocked laptop and opens the diary, they still cannot read it — the content renders in the script. To read it they must either learn the script by hand or supply the translate password. Making translate share the entry password would defeat this second layer, so they remain separate. (Device/OS password integration was considered and dropped for this reason.)

- **Lockout:** too many failed attempts on either password triggers a cooldown of ~5 minutes before further attempts are allowed. Applied independently to each password.
- **Translation session window:** once the translate password is supplied, a time-boxed window (default **20 minutes**, adjustable in Settings) allows translation. When it expires, re-authentication is required to translate again. The remaining time should be visible while active.
- **Encryption at rest:** all diary entries are stored AES-256 encrypted. Search and translation operate on decrypted content only after authentication.

### 4.2 Structure

The diary reuses the Book side's structural pattern, but the unit is an **entry** rather than a chapter, and grouping is by **month** rather than by volume:

- A sidebar lists entries, grouped into collapsible month sections.
- Entries can be dragged within the sidebar to reorder or regroup.
- Multiple diaries are supported (like having multiple books), for separating different *kinds* of entry.
- Each entry shows a visible **entry number** and a **date**.

### 4.3 Standalone entries

In addition to entries that belong to a diary, the user can create **standalone entries** — the equivalent of writing on a loose sheet rather than in the bound diary. A standalone entry can be left as-is, moved into a diary later, or deleted outright (the "vent and burn" page).

### 4.4 Writing & formatting

- Default font is the Cypher script font (placeholder/base set to Segoe UI; changeable for customization or future scripts).
- Light formatting only: font size, bold, strikethrough, and similar simple controls.

### 4.5 Translation function

- Translate a **selected portion** or the **whole** entry, at the user's discretion.
- The user can set the granularity the system reports against — between **part** and **whole/document** — so the app can confirm with messages like "translated part X" or "translated document X".
- Operates only within an active translation window (see 4.1).

### 4.6 Search

- Search across diary entries. Because content is encrypted, meaningful search runs against decrypted text after entry authentication.

---

## 5. Public Side — Document (Word replacement)

A rich text editor targeting roughly the most-used third of Microsoft Word's surface area. Modelled on Word's Home / Insert / References / View tabs.

### 5.1 Home (core editing)

Clipboard (cut/copy/paste, format painter), font family and size selection, bold/italic/underline/strikethrough/sub/superscript, text and highlight colour, alignment, line spacing, lists, indentation, a styles gallery (Normal, Heading 1–2, Title, Subtitle, Emphasis, etc.), and Find/Replace/Select.

### 5.2 Insert

Tables, pictures, shapes, icons, charts, header & footer, page number, text box, **drop cap**, and symbol insertion. Image insertion is shared with the Book side.

### 5.3 References

- **v1 scope:** Table of Contents, footnotes/endnotes, captions.
- **Stretch:** full citation & bibliography management, Table of Authorities, index. (These are niche even in real-world Word use and can follow later.)

### 5.4 View

Layout modes (print/web/read), ruler/gridlines/navigation-pane toggles, zoom controls, and split/side-by-side window viewing.

### 5.5 Fonts

Full font selection, including the user's custom and downloadable fonts and the Cypher script font (useful for embedding script passages in a document).

### 5.6 Import / Export

- **Open/import:** `.docx`.
- **Export:** `.docx`, PDF, and other common formats.
- Custom fonts (including Cypher) must render correctly in exported PDFs.

---

## 6. Public Side — Book (Reedsy-style)

### 6.1 Bookshelf (library landing)

- Books shown as cover cards in a grid; hovering a card reveals **Manage** (settings) and **Write** (enter editor) actions.
- A word-count badge appears on in-progress cards.
- "Create book" and "Import book" tiles sit at the front of the grid.
- An **archive** view is kept separate from the active shelf.
- A title search field is available.

### 6.2 Book structure

- Hierarchy: **Book → Volume/Part → Chapter**, with collapsible volumes in the sidebar.
- New chapters default to the title "Chapter N". When renamed (e.g. "Chapter 2 – Craze"), the new title replaces the default label in the sidebar.
- Chapters can be **dragged** within the sidebar to reorder/reposition quickly.
- Front matter (Copyright, Table of Contents) and back matter areas exist, as in Reedsy.

### 6.3 Per-book navigation rail

A left icon rail switches the book workspace between dedicated sections, each with its own view:

- **Book / Manuscript** — the chapters and writing surface.
- **Lore / Worldbuilding** — free-form lore content, written or uploaded.
- **Characters** — the character board (see 6.5).
- **Add (+)** — create a new board/section.

Any of these can be opened in a separate window (see 2.2) so the writer can, for example, keep a character sheet open beside the manuscript.

### 6.4 Chapter splitting

A chapter can be split into two using a cursor-driven cut-line mechanic: a dashed line with a "confirm split" affordance appears at the cursor position, guided by a prompt ("Use your cursor to split up this chapter"). Confirming creates a new chapter from the content after the cut.

### 6.5 Character system

- Characters are organised into folders (e.g. "Main Cast") in a board, displayed as cards in **Grid** or **List** mode, with multi-select, duplicate, and delete.
- Each character has a profile based on a **template with a default field set that is customizable/extendable**, including a **character image** (an improvement over Reedsy, which lacks the image).
- A board can also hold general **note** cards alongside character cards.

**Character linking**

- Typing a character's name and using **Insert character link** turns it into a clickable reference that navigates to that character's profile.
- **Autocomplete:** typing a partial name (e.g. "Ayar") raises a dropdown of matching existing characters; selecting one creates the link, while continuing to type leaves it as plain text.
- Minor/incidental characters who never need a profile (e.g. a sister mentioned once as a stillbirth) simply stay as plain text — linking is never forced. This also makes important vs. incidental characters easy to tell apart.

### 6.6 Lore section

Per-book lore/worldbuilding space where lore can be written directly or uploaded.

### 6.7 Writing tools

- **Word/character count:** detailed tracking, plus an **on-demand "generate report"** of most-used **words** and most-used **phrases**, each ranked by frequency. Common stopwords (articles, etc.) are filtered by default, with a toggle to include them. Presented as collapsible dropdowns within the Goals & Insights panel.
- **Thesaurus and spell check**, with **UK and US English** support for now.
- **Version history** per chapter.
- **Rich text:** quote/blockquote, bold, italic, font size and colour, headings.
- **Cypher font** usable inside chapters (e.g. for in-world documents or letters).
- **Focus mode** (distraction-free writing).
- **Reading time estimate.**
- **Pinned notes:** 3–4 quick-reference note boxes (~2,000 words each) available while writing.

### 6.8 Goals, check-ins & calendar

- **Manuscript goal:** a target word count with a deadline, shown as a radial progress indicator with current/target counts; overdue state shown in red.
- **Writing days:** the user selects which days of the week they write.
- **Words-per-day calculator:** converts the goal and deadline into a required daily word count based on the chosen writing days. It must handle edge cases — e.g. if the deadline falls on a non-writing day, recompute across the writing days that actually remain, so the figure stays achievable (the user's example: a 20,000-word week over 4 chosen writing days = 5,000/day, but if the deadline lands such that only 3 of those writing days fit, the requirement rises to ~6,670/day).
- **Calendar / insights:** a weekly strip and calendar view showing words written per day (added/removed counts).
- **Mood check-in:** a same-day session rating (e.g. frown/neutral/smile) with an optional note ("How was your work today?"). Kept as a real statistic and surfaced as a light overlay alongside the word-count calendar, not merely a vibe feature.

### 6.9 Book settings

Per book: title, subtitle (optional), **synopsis/description**, genre/status, and **cover/poster upload** (with guidance such as a 1:1.6 ratio, ≥2500px). Per-book notification settings (writing goals, check-in toggles) live here too. Reached via a Settings / Exports / Access top-nav, consistent with Reedsy.

### 6.10 Export & import

- **Export:** PDF, `.docx`, and **EPUB**.
- **Reverse import:** read an EPUB back into an editable document form.
- Custom/Cypher fonts must render in exports where applicable.

---

## 7. Universal Features (both Diary and Public)

- **Image insertion** in both Document and Book.
- **Word & character counter** in both, for **total** and **current selection**.
- **Writing reminders:** habit-building nudges for diary or book, including a configurable **daily reminder time** (e.g. "sent every day you write at 6:00 PM"), toggle-able per book.
- **Progress nudges:** e.g. "You're almost there! You have 323 words left to reach your 500-word goal in [Diary name] / [Book title]."
- **Autosave:** on by default, fast, saving on each pause or every few moments/minutes. Save files extend over a rolling window of recent saves (a few hours' worth) and prune older ones, giving lightweight built-in backup on top of the dedicated backup system.
- **Number formatting:** all numeric *displays* (word count, character count, etc.) use comma thousands separators (10,000 not 10000). This is display-only and never affects the text being written.

---

## 8. Backup System

- Configurable **interval** (every X minutes/hours, or on close).
- Configurable **location** — a user-defined local folder or an external drive.
- Backup formats: an **encrypted `.cypher` file** for the journal, and a readable archive (e.g. `.zip`) for public writing.
- **Manual backup** trigger at any time.
- **Backup history:** a list of recent backups with timestamps.
- **Restore from backup.**

---

## 9. Reader / Share System (the one online feature)

This is the only feature that requires the internet, and it covers only **public** content (never the diary).

### 9.1 Behaviour

- The user generates a read-only **share link** for a specific set of chapters, a part/volume, or the whole book.
- Links can be **password-protected**, given an **expiry** (never / X days), and **revoked** at any time.
- The link opens a clean, read-only web view — the same **Reader View** used for the in-app phone preview.

### 9.2 Publish model (safety)

- Publishing is **manual**, and **re-publishing after edits is also manual**. Editing a chapter does not auto-update the live link. This prevents an unfinished edit from silently going live and prevents a half-saved edit from wiping the original published snapshot.
- What gets published is a **snapshot** of the selected content, not a live sync.

### 9.3 Backend & data boundary

- Hosted on **Railway** (FastAPI + PostgreSQL).
- The server ever only holds: **published snapshots** + **share-link metadata** (password hash, expiry, scope/permissions).
- The server **never** receives: the diary, the full local library, or any unpublished content.
- Revoking a link deactivates/deletes its row; password checks compare against the stored hash.

### 9.4 Reader View

An in-app preview that shows how content will look on a phone-sized screen, doubling as the exact view a reader sees after opening a share link. Supports the password gate and revocation behaviour described above.

---

## 10. Extra Features

- **PDF reader** (in-app, via pdf.js).
- **EPUB reader** (in-app).

---

## 11. Settings

- **Security:** change entry password; change translate password; translation window duration (default 20 min); lockout cooldown.
- **Fonts:** set/replace the Cypher script font (`.ttf`), manage bundled/downloaded fonts, install Cypher font to the system.
- **Backup:** interval, location, history, restore.
- **Appearance:** theme — **dark (default)**, light, and a custom accent colour; default font size.
- **Editor:** autosave interval, default focus mode, language (UK/US English).
- **Share:** base URL / backend configuration for the reader feature.
- **Reminders:** daily reminder time, per-book toggles.

---

## 12. Data Model (initial sketch)

A SQLite schema sketch; refine during Phase 1. Encrypted fields are marked.

- **diaries**(id, name, created_at, sort_order)
- **diary_entries**(id, diary_id *nullable for standalone*, entry_number, title *enc*, content *enc*, created_at, updated_at, month_group, sort_order)
- **books**(id, title, subtitle, synopsis, genre, status, cover_path, created_at, archived)
- **volumes**(id, book_id, title, sort_order)
- **chapters**(id, book_id, volume_id, title, content, word_count, sort_order, updated_at)
- **chapter_versions**(id, chapter_id, content, saved_at) — version history
- **characters**(id, book_id, folder, name, image_path, fields_json) — customizable template fields in JSON
- **character_links**(id, chapter_id, character_id, position) — or stored inline as editor nodes
- **lore_entries**(id, book_id, title, content, sort_order)
- **documents**(id, title, content, created_at, updated_at) — Document workspace
- **notes**(id, owner_type, owner_id, slot, content) — pinned reference notes
- **goals**(id, owner_type, owner_id, target_words, deadline, writing_days)
- **checkins**(id, owner_type, owner_id, date, mood, note, words_written)
- **share_links**(id, book_id, scope_json, password_hash, expires_at, active, last_published_at) — local mirror of what's on the server
- **settings**(key, value)
- **backups**(id, path, created_at, type)

---

## 13. Build Roadmap

- **Phase 1 — Scaffold.** Electron + Vue 3 + Pinia + Tailwind project; SQLite wired up; multi-window shell; dark theme; the Tiptap editor base; the **font abstraction with Segoe UI as the `cypher-script` placeholder**. Goal: an app that opens, has the three domains stubbed, and can register/swap a font.
- **Phase 2 — Diary core.** Entry/standalone structure, month grouping, light formatting, encryption at rest, two-password security with lockout, the translation window, and the **font-swap translate** (verified end-to-end on Segoe UI, ready to "go live" on the real `.ttf`).
- **Phase 3 — Book core.** Bookshelf, book/volume/chapter hierarchy, sidebar with drag reorder and auto-titling, chapter split, per-book rail (Book/Lore/Characters), and the writing surface.
- **Phase 4 — Writing tools & characters.** Word counts, on-demand frequency report, goals/calculator/calendar, mood check-ins, pinned notes, focus mode, reading time, the full character system (template, image, linking, autocomplete), and lore.
- **Phase 5 — Document mode.** The Word-style editor (Home/Insert/References/View v1 scope), docx import/export, PDF export.
- **Phase 6 — Backup, export, readers.** Backup/restore system, EPUB export + reverse import, in-app PDF/EPUB readers.
- **Phase 7 — Share/Reader (online).** Reader View, FastAPI + Postgres backend on Railway, manual publish/republish, password/expiry/revoke.
- **Ongoing — Font handoff.** Drop in `Cypher.ttf` whenever ready; repoint `cypher-script`; add the system-install action. Independent of all phases, so it never blocks progress.

---

## 14. Open Items / To Confirm During Build

- Exact KDF parameters and key handling for diary encryption (where the derived key lives in memory and for how long during a session).
- Whether Document and Book share one editor configuration or two tuned Tiptap setups.
- Precise file format for the encrypted `.cypher` backup (single bundle vs. per-entry).
- Whether downloadable fonts come from a small self-hosted manifest or a third-party source.
- Final reader-view styling and the share-link URL scheme.
