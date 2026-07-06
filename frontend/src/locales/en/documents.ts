/** Chaînes EN de la section « Documents » (composant partagé). */
export default {
  documents: {
    titre: 'Documents',
    aucun: 'No document attached.',
    ajouter: 'Add a document',
    contraintes: 'PDF, JPEG, PNG or DOCX · 10 MB maximum.',
    televerser: 'Upload',
    annuler: 'Cancel',
    nomRequis: 'Name is required.',
    champ: {
      nom: 'Name',
      description: 'Description',
      descriptionHint: 'Optional.',
      descriptionPlaceholder: 'Brief description…',
    },
    aria: {
      telecharger: 'Download',
      supprimer: 'Delete document',
      retirer: 'Remove file',
    },
    taille: { o: 'B', ko: 'KB', mo: 'MB' },
    toast: {
      typeNonAutoriseTitre: 'File type not allowed',
      typeNonAutoriseDetail: 'PDF, JPEG, PNG or DOCX only.',
      tropVolumineuxTitre: 'File too large',
      tropVolumineuxDetail: '10 MB maximum.',
      ajouteTitre: 'Document added',
      televersementImpossible: 'Upload failed',
      telechargementImpossible: 'Download failed',
      suppressionImpossible: 'Deletion failed',
      supprimeTitre: 'Document deleted',
    },
  },
}
