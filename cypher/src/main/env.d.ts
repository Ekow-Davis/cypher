/// <reference types="electron-vite/node" />

/**
 * electron-vite rewrites `?asset` imports to a packaged file path at build
 * time. Without this declaration TypeScript rejects the import even though the
 * bundler resolves it fine.
 */
declare module '*?asset' {
  const src: string
  export default src
}
