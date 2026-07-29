import type { CharacterSheet, CharacterField, FieldType } from './types'

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function f(label: string, type: FieldType = 'text'): CharacterField {
  return { id: slug(label), label, value: '', type }
}

/**
 * The base character sheet (from the user's template). Seeded into every new
 * character; each character owns an editable copy stored in fields_json, so
 * fields/sections can later be customised per character without touching this.
 * The character's Name lives in the `name` column and is edited from the sheet
 * header, so it is intentionally not a field here.
 */
export function defaultCharacterSheet(): CharacterSheet {
  return {
    sections: [
      {
        id: 'info',
        title: 'Info',
        fields: [
          f('Birthday'),
          f('Reason for Name'),
          f('Nickname(s)'),
          f('Reason for Nickname(s)'),
          f('Nationality'),
          f('Gender')
        ]
      },
      {
        id: 'physical',
        title: 'Physical Appearance',
        fields: [
          f('Hair Colour'),
          f('Hair Type/Length'),
          f('Eye Colour'),
          f('Skin Tone'),
          f('Race'),
          f('Face Shape'),
          f('Birthmarks or Scars'),
          f('Predominant Feature'),
          f('Height'),
          f('Weight'),
          f('Body Type'),
          f('General Health')
        ]
      },
      {
        id: 'family',
        title: 'Family',
        fields: [
          f("Mother's Name"),
          f("Father's Name"),
          f('Step Parents'),
          f('Lives With'),
          f('Sibling(s)'),
          f('In-Laws'),
          f('Nieces/Nephews'),
          f('Grandparents Status'),
          f('Other Relatives')
        ]
      },
      {
        id: 'religion',
        title: 'Religion',
        fields: [
          f("Family's Religion"),
          f("Character's Religion"),
          f('Philosophy', 'multiline'),
          f('Other Beliefs', 'multiline')
        ]
      },
      {
        id: 'likes',
        title: 'Likes & Dislikes',
        fields: [
          f('Favourite Colour'),
          f('Least Favourite Colour'),
          f('Favourite Food'),
          f('Best Friend'),
          f('Enemy'),
          f('Significant Other'),
          f('Favourite Activity'),
          f('Special Place')
        ]
      },
      {
        id: 'childhood',
        title: 'Childhood',
        fields: [
          f('Occupation'),
          f('Residency'),
          f("Parent's Job(s)"),
          f('Economic Status'),
          f('Job Status'),
          f('House Mood'),
          f('Education'),
          f('Hometown'),
          f('Current Town'),
          f('First Memory', 'multiline'),
          f('Most Important Memory', 'multiline')
        ]
      },
      {
        id: 'traits',
        title: 'Defining Traits',
        fields: [
          f('Group or Alone'),
          f('As Seen By Self', 'multiline'),
          f('As Seen By Others', 'multiline'),
          f('Insecurity(s)'),
          f('Eating Habit(s)'),
          f('Pet Peeve(s)'),
          f('Planned or Spontaneous'),
          f('Daredevil or Cautious'),
          f('Hobbies'),
          f('Talents'),
          f('Prized Possession(s)'),
          f('Socials'),
          f('What Excites Them', 'multiline')
        ]
      },
      {
        id: 'flaws',
        title: 'Flaws',
        fields: [
          f('Substance Use'),
          f('Minor Flaw'),
          f('Major Flaw', 'multiline'),
          f('Fatal Flaw', 'multiline')
        ]
      },
      {
        id: 'misc',
        title: 'Miscellaneous',
        fields: [
          f('Disposition'),
          f('Biggest Regret', 'multiline'),
          f('Darkest Secret', 'multiline'),
          f('Main Confidant'),
          f('Easy To Give Trust'),
          f('Ambitions', 'multiline'),
          f('Plan For The Future', 'multiline'),
          f('Want Marriage?'),
          f('Want Kids?')
        ]
      },
      {
        id: 'trauma',
        title: 'Trauma',
        fields: [{ id: 'body', label: '', value: '', type: 'multiline' }]
      },
      {
        id: 'backstory',
        title: 'Backstory',
        fields: [{ id: 'body', label: '', value: '', type: 'multiline' }]
      }
    ]
  }
}
