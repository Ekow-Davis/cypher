import type { RefKind } from './crossref'
import type { TocEntry } from './toc'

/**
 * Tiptap builds its command types by module augmentation. Extensions that add
 * commands must declare them here or `editor.chain()` won't expose them, even
 * though they work at runtime.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cypherPageBreak: {
      setPageBreak: () => ReturnType
    }
    cypherFootnote: {
      insertFootnote: (text: string) => ReturnType
      updateFootnote: (pos: number, text: string) => ReturnType
    }
    cypherToc: {
      insertTableOfContents: (entries: TocEntry[]) => ReturnType
      refreshTableOfContents: (entries: TocEntry[]) => ReturnType
    }
    cypherComment: {
      setComment: (commentId: string) => ReturnType
      unsetComment: (commentId: string) => ReturnType
      markCommentResolved: (commentId: string, resolved: boolean) => ReturnType
    }
    cypherCrossref: {
      insertCrossReference: (targetId: string, kind: RefKind, display: string) => ReturnType
      insertCaption: (kind: 'figure' | 'table', captionId: string) => ReturnType
    }
    cypherFontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

export {}
