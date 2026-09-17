import type { Document } from '../types'

/**
 * REDUCED content — fully replaced in task 4 (spec 2026-09-18). Single section so the
 * parity/anchor/link guards exercise this document from this task onward, without final content.
 */
const bureau: Document = {
  titre: 'Committee guide (coming soon)',
  intro: 'This guide will be completed soon.',
  sections: [
    {
      id: 'placeholder',
      titre: 'Placeholder section',
      blocs: [
        {
          type: 'paragraphe',
          texte: 'The detailed content of this guide is coming in a future update.',
        },
      ],
    },
  ],
}

export default bureau
