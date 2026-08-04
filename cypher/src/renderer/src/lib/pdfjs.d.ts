/**
 * pdfjs-dist ships ESM builds without type declarations for these subpaths.
 * The API surface we use is small and dynamically shaped, so it is typed as
 * `any` deliberately rather than hand-maintaining a partial mirror that would
 * drift from the library.
 */
declare module 'pdfjs-dist/build/pdf.mjs' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export const GlobalWorkerOptions: { workerSrc: string }
  export function getDocument(src: any): { promise: Promise<any> }
  export const TextLayer: any
  export const version: string
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string
  export default src
}
