import type { Document } from '../types'

/**
 * Contenu RÉDUIT — remplacé intégralement à la tâche 4 (spec 2026-09-18). Section unique pour que
 * les gardes de parité/ancres/liens s'exercent dès cette tâche sans document définitif.
 */
const bureau: Document = {
  titre: 'Guide du bureau (à venir)',
  intro: 'Ce guide sera complété prochainement.',
  sections: [
    {
      id: 'placeholder',
      titre: 'Section provisoire',
      blocs: [
        {
          type: 'paragraphe',
          texte: 'Le contenu détaillé de ce guide arrive dans une prochaine mise à jour.',
        },
      ],
    },
  ],
}

export default bureau
