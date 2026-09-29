/**
 * Release notes shown once after an update.
 *
 * Newest first. Add an entry here with each release that has something worth
 * telling people about; a version with no entry simply shows nothing. The
 * version must match package.json exactly, or the popup will not find it.
 */
export interface ReleaseNote {
  version: string
  highlights: { title: string; body: string }[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.6.0',
    highlights: [
      {
        title: 'Writing stats',
        body: 'Turn them on in Settings → Stats, then open them from the Stats button on your bookshelf: words written and deleted, writing time, typing speed, streaks, when you write best, and which book you spend the most time in. Only numbers are kept — never your words.'
      },
      {
        title: 'Timeline',
        body: 'A new Timeline tab in every book. Date chapters, lore and characters on your own calendar, add events, and see it all in lanes. It flags continuity slips — a character appearing before they are born or after they die.'
      },
      {
        title: 'Lore library',
        body: 'Share lore between books. Add an entry (or a whole category) to the library, then copy it into any other story from the library button in the codex. Copies stay independent until you choose to send or pull changes.'
      },
      {
        title: 'Links that know more',
        body: 'Hover an @ reference to preview it. Lore entries and character sheets now list everywhere they are referenced. Renaming a character or entry updates every link to it.'
      },
      {
        title: 'Command palette',
        body: 'Press Ctrl+K anywhere to jump to a chapter, entry, character, book or document — or run a command — by typing its name.'
      },
      {
        title: 'Scene breaks, expansions and autocorrect',
        body: 'The ⁂ button inserts a proper scene break (typed asterisks are left alone). Settings → Writing lets you add shortcuts that expand as you type, and your own autocorrections.'
      }
    ]
  },
  {
    version: '0.5.0',
    highlights: [
      {
        title: 'Lore entries can reference each other',
        body: 'Type @ in a lore entry (or a chapter) and the list now includes your codex as well as your cast. Click a reference to jump to that entry.'
      },
      {
        title: 'Import lore from Word or Markdown',
        body: 'Codex → the import button. One entry per file, and references written as @TheCrimsonChapel or @The_Crimson_Chapel link themselves to matching entries. “Link @names” in an entry’s toolbar does the same for pasted text.'
      },
      {
        title: 'Bigger text, your choice of font',
        body: 'Settings → Appearance → Text & readability scales the whole interface and sets its font. Ctrl + and Ctrl − work anywhere. The chapter and lore toolbars have their own writing font and size controls.'
      },
      {
        title: 'Wrap a selection',
        body: 'Select text, press Ctrl+J, then type a character: % wraps it in % %, ( in ( ), and you can set your own pairs such as ⟨⟨ ⟩⟩. Press Enter instead for a one-off pair. Change the shortcut and pairs in Settings → Writing.'
      },
      {
        title: 'Mouse side buttons',
        body: 'The back and forward buttons on your mouse can now do something useful — press Enter, undo, redo and more. Settings → Writing → Mouse buttons.'
      },
      {
        title: 'One-character search',
        body: 'Manuscript, codex, character and reader searches now work from a single character, so you can find every “&” or “—”.'
      }
    ]
  }
]

/** -1, 0 or 1, comparing dotted numeric versions ("0.10.0" > "0.9.2"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

/** Notes for versions after `lastSeen`, up to and including `current`. */
export function notesSince(lastSeen: string | null, current: string): ReleaseNote[] {
  return RELEASE_NOTES.filter(
    (n) =>
      compareVersions(n.version, current) <= 0 &&
      (lastSeen === null || compareVersions(n.version, lastSeen) > 0)
  )
}

export const LAST_SEEN_KEY = 'whatsNewSeen'
