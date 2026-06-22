/** Build a renderer URL for a stored asset ref (e.g. "covers/uuid.png"). */
export function assetUrl(ref: string | null | undefined): string | null {
  if (!ref) return null
  return `cypher-asset://local/${ref}`
}
