import { getDb } from '../index'
import type { Character, CreateCharacterOptions } from '@shared/types'
import { defaultCharacterSheet } from '../../../shared/characterTemplate'

/** Characters repository — book-scoped, grouped by freeform folder. */

export function listCharacters(bookId: number): Character[] {
  return getDb()
    .prepare(
      'SELECT * FROM characters WHERE book_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE ASC, id ASC'
    )
    .all(bookId) as Character[]
}

export function getCharacter(id: number): Character | null {
  return (getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id) as Character) ?? null
}

export function createCharacter(bookId: number, opts?: CreateCharacterOptions): Character {
  const name = opts?.name?.trim() || 'New character'
  const folder = opts?.folder?.trim() || null
  const fields = JSON.stringify(defaultCharacterSheet())
  const info = getDb()
    .prepare('INSERT INTO characters (book_id, folder, name, fields_json) VALUES (?, ?, ?, ?)')
    .run(bookId, folder, name, fields)
  return getCharacter(Number(info.lastInsertRowid)) as Character
}

export function renameCharacter(id: number, name: string): Character | null {
  getDb()
    .prepare('UPDATE characters SET name = ? WHERE id = ?')
    .run(name.trim() || 'Unnamed', id)
  return getCharacter(id)
}

export function setCharacterFolder(id: number, folder: string | null): Character | null {
  const value = folder?.trim() || null
  getDb().prepare('UPDATE characters SET folder = ? WHERE id = ?').run(value, id)
  return getCharacter(id)
}

export function saveCharacterFields(id: number, fieldsJson: string): Character | null {
  getDb().prepare('UPDATE characters SET fields_json = ? WHERE id = ?').run(fieldsJson, id)
  return getCharacter(id)
}

export function setCharacterImage(id: number, imagePath: string | null): Character | null {
  getDb().prepare('UPDATE characters SET image_path = ? WHERE id = ?').run(imagePath, id)
  return getCharacter(id)
}

/** Soft delete — the character moves to the trash and can be restored. */
export function deleteCharacter(id: number): void {
  getDb().prepare("UPDATE characters SET deleted_at = datetime('now') WHERE id = ?").run(id)
}
