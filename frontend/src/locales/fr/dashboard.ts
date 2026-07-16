/** Chaînes FR du domaine « dashboard » (§4 i18n). */
export default {
  dashboard: {
    header: {
      overline: 'Tableau de bord',
      titre: "Vue d'ensemble",
    },
    chargement: 'Chargement…',
    erreur: 'Erreur de chargement du tableau de bord.',
    vue: {
      COMPLET: 'Vue complète',
      FINANCIER: 'Vue financière',
      RESTREINT: 'Vue restreinte',
      PERSO: 'Ma situation',
    },
    statut: {
      A_JOUR: 'À jour',
      PARTIEL: 'Partiel',
      NON_A_JOUR: 'Non à jour',
    },
    alerteBareme: {
      avant: "Le barème de l'année",
      apres:
        "n'est pas encore configuré. Les statuts affichés ignorent cette année tant qu'aucun montant attendu n'est défini.",
    },
    onboarding: {
      titre: 'Bienvenue sur NKONI',
      descriptionGestion:
        'Aucune cotisation n’est encore suivie. Commencez par configurer le barème annuel : il fixe le montant attendu par membre et débloque l’ouverture des années.',
      descriptionLecture:
        'Aucune cotisation n’est encore suivie. Le barème annuel n’a pas encore été configuré par un administrateur.',
      action: 'Configurer le premier barème',
      tips: {
        bareme: 'Définir le barème annuel',
        membres: 'Ajouter les membres',
        versements: 'Enregistrer les versements',
      },
    },
    stat: {
      membresAJour: 'Membres à jour',
      membresActifs: 'Membres actifs',
      branches: 'Branches',
    },
    perso: {
      overline: 'Ma situation · {{annee}}',
      statutTitre: 'Statut de cotisation',
      totalAttendu: 'Total attendu (cumulé)',
      totalValorise: 'Total versé / valorisé (cumulé)',
    },
    hero: {
      indicateur: 'Indicateur clé',
      recouvre: 'recouvré',
      totalCollecte: 'Total collecté',
      totalAttendu: 'Total attendu',
      resteACollecter: 'Reste à collecter',
    },
    anniversaires: {
      titre: 'Anniversaires du mois',
      leJour: 'le {{jour}}',
    },
    consolide: {
      titre: 'Vue financière consolidée',
      soldeCaisse: 'Solde de caisse',
      cagnottes: 'Cagnottes',
      cagnottesOuvertes_one: '{{count}} en cours',
      cagnottesOuvertes_other: '{{count}} en cours',
      amendes: 'Amendes à recouvrer',
      amendesEncaisse: '{{montant}} encaissé',
    },
    repartition: {
      aucuneDonnee: "Aucune donnée pour l'instant.",
      total: 'Total',
      cotisationTitre: 'Membres par statut de cotisation',
      membreTitre: 'Membres par statut',
      membre: {
        ACTIF: 'Actifs',
        INACTIF: 'Inactifs',
        DECEDE: 'Décédés',
      },
    },
    evolution: {
      titre: 'Recouvrement cumulé · {{annee}}',
      titreMensuel: 'Collecté par mois · {{annee}}',
      collecte: 'Collecté (cumulé)',
      attendu: 'Objectif (cumulé)',
      collecteMois: 'Collecté',
      attenduMois: 'Attendu',
      n1: 'Année {{annee}}',
      colonneMois: 'Mois',
      resumeAria:
        'Progression cumulée du recouvrement pour {{annee}} : montant collecté cumulé mois après mois face à l’objectif cumulé. Détail chiffré dans la table associée.',
      resumeAriaMensuel:
        'Recouvrement mensuel {{annee}} : montant attendu et montant collecté pour chaque mois (non cumulé). Détail chiffré dans la table associée.',
      aucuneDonnee: 'Aucun versement enregistré cette année pour le moment.',
    },
    analyse: {
      recouvrementBranche: 'Recouvrement par branche',
      aRelancer: 'À relancer',
      tousAJour: 'Tous les membres actifs sont à jour. 🎉',
      reste: 'Reste {{montant}}',
      voirTous: 'Voir tous les membres à relancer',
      relancerWhatsApp: 'Relancer par WhatsApp',
      relanceMessage:
        'Bonjour {{prenom}}, petit rappel : il vous reste {{montant}} à régler pour vos cotisations. Merci !',
    },
    export: {
      titre: 'Exporter les contributions',
      excel: 'Excel',
      pdf: 'PDF',
      pretTitre: 'Export prêt',
      pretDetail: 'Le fichier {{format}} a été téléchargé.',
      echec: 'Échec de l’export',
      reessayez: 'Réessayez plus tard.',
    },
  },
}
