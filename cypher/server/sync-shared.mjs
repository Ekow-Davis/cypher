// Refreshes the server's local copy of the shared files from the repo.
//
// The server duplicates src/shared/{readerHtml,types}.ts because Railway only
// uploads the service directory — it can't reach ../../src. Running this before
// a local build keeps the copies honest; on Railway the committed copies are
// used as-is (the repo root isn't present there).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoShared = join(here, '..', 'src', 'shared')
const localShared = join(here, 'src', 'shared')

// Only sync when the repo copy is reachable (i.e. a full local checkout).
if (existsSync(repoShared)) {
  mkdirSync(localShared, { recursive: true })
  for (const file of ['readerHtml.ts', 'types.ts']) {
    copyFileSync(join(repoShared, file), join(localShared, file))
  }
  console.log('[sync-shared] refreshed readerHtml.ts, types.ts')
} else {
  console.log('[sync-shared] repo src/shared not present — using committed copies')
}
