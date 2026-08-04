/** Build a renderer URL for a stored asset ref (e.g. "covers/uuid.png"). */
export function assetUrl(ref: string | null | undefined): string | undefined {
  // undefined rather than null: Vue drops an undefined :src attribute, whereas
  // null renders src="null" and fires a failed request.
  if (!ref) return undefined
  return `cypher-asset://local/${ref}`
}
