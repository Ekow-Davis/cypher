import type { CypherApi } from './index'

declare global {
  interface Window {
    cypher: CypherApi
  }
}

export {}
