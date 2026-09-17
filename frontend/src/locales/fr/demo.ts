/** Espace de démonstration (spec 2026-09-15 §2) — FR source de vérité. */
export default {
  demo: {
    // Même formulation que le serveur (`commun.demoLectureSeule`) : refus local et refus serveur
    // doivent dire la même chose.
    lectureSeule: 'Espace de démonstration en lecture seule : créez votre espace pour enregistrer vos données.',
    entree: {
      voirExemple: "Voir un espace d'exemple",
      voirEspaceRempli: 'Voir à quoi ressemble un espace rempli',
    },
    page: {
      ouverture: "Ouverture de l'espace d'exemple…",
      indisponibleTitre: "Espace d'exemple indisponible",
      indisponible: "L'espace de démonstration est momentanément indisponible. Réessayez plus tard.",
      erreurTitre: "Impossible d'ouvrir l'espace d'exemple",
      occupeTitre: 'Espace d\'exemple très sollicité',
      occupe: 'Beaucoup de visiteurs ouvrent la démo en ce moment. Réessayez dans une minute.',
      erreur: 'Vérifiez votre connexion, puis réessayez.',
    },
    bandeau: {
      titre: 'Espace de démonstration',
      texte: 'données fictives, lecture seule.',
      quitter: 'Quitter la démo',
      retourEnCours: 'Sortie…',
    },
    compte: 'Compte de démonstration',
    partageWhatsappDesactive: 'Partage WhatsApp désactivé dans la démo',
    whatsappDesactive: 'Relance WhatsApp désactivée dans la démo',
    pushDesactive: 'Notifications push désactivées dans la démo',
  },
}
