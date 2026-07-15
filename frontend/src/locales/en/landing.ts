/** Chaînes EN de la page publique d'accueil (§4 i18n) — hero, à-propos, forfaits, footer. */
export default {
  landing: {
    hero: {
      badge: 'Association & family management',
      titre: {
        ligne1: 'The contributions of',
        ligne2: 'your community',
        ligne3: 'in full clarity',
      },
      description: {
        partie1: 'Every association, family or tontine has its',
        emphase: 'own secure and isolated space',
        partie2:
          ' : each member knows their status, every transaction is tracked, every receipt is archived.',
      },
      decouvrir: 'Discover NKONI',
      stats: {
        membresActifs: 'Active members',
        groupesBranches: 'Groups / branches',
        cotisationsAJour: 'Contributions up to date',
      },
      apercu: {
        titre: 'A space at a glance',
        sousTitre: 'Sample data — showcase',
        actif: 'Active',
        membres: 'Members',
        branches: 'Branches',
        cotisationsAJour: 'Contributions up to date',
        legende: {
          aJour: 'Up to date',
          partiel: 'Partial',
          nonAJour: 'Overdue',
        },
      },
      valeurs: {
        titre: 'What keeps a group alive',
        tresorerie: 'Treasury',
        transparence: 'Transparency',
        solidarite: 'Solidarity',
        cotisations: 'Contributions',
        equilibrage: 'Balancing',
        branches: 'Branches',
      },
    },
    apropos: {
      overline: 'Why NKONI',
      titre: 'Designed for families and associations',
      description:
        'Each group has its own space, secure and isolated: NKONI gives everyone a clear, shared view of their collective finances, with no grey areas — and no data is ever shared between spaces.',
      cards: {
        statuts: {
          titre: 'Transparent statuses',
          texte: 'Each member sees whether they are up to date, partial or overdue, in real time.',
        },
        mouvements: {
          titre: 'Tracked transactions',
          texte: 'Balancing between branches is recorded and verifiable by everyone.',
        },
        recus: {
          titre: 'Archived receipts',
          texte: 'Each contribution can generate a receipt kept and viewable at any time.',
        },
        cartes: {
          titre: 'Member cards',
          texte: 'Cards with photo and QR: a scan verifies the member’s status live.',
        },
      },
      dejaEspace: 'Already have a space? Sign in',
    },
    forfaits: {
      overline: 'Plans',
      titre: 'Start for free, grow at your own pace',
      description:
        'The Free plan is available today. The Pro and Enterprise plans are activated on request — write to us to lift the limits (no online payment for now).',
      disponible: 'Available',
      bientot: 'On request',
      gratuit: {
        nom: 'Free',
        tagline: 'To get started',
        prix: 'Free',
        f1: 'Up to 50 members',
        f2: 'Members, contributions & payments',
        f3: 'Meetings, positions & resolutions',
        f4: 'Financial reports & exports',
        f5: 'Secure space, isolated from others',
      },
      pro: {
        nom: 'Pro',
        tagline: 'To grow',
        prix: 'Pricing coming soon',
        bouton: 'Get notified at launch',
        f1: 'Unlimited members',
        f2: 'Unlimited documents',
        f3: 'Priority support',
        f4: 'Advanced export',
      },
      entreprise: {
        nom: 'Enterprise',
        tagline: 'Tailor-made',
        prix: 'On quote',
        bouton: 'Contact us',
        f1: 'Large structures & federations',
        f2: 'Dedicated onboarding support',
        f3: 'No commitment',
      },
      mailto: {
        proSujet: 'NKONI Pro — get notified at launch',
        entrepriseSujet: 'NKONI Enterprise — information request',
      },
      note: 'The Pro and Enterprise plans are activated on request (contact us). The announced features are indicative and may change.',
    },
    etapes: {
      overline: 'Getting started',
      titre: 'Up and running in three steps',
      description:
        'No setup, no spreadsheet to maintain. Create your space and invite your members in minutes.',
      creer: {
        titre: 'Create your space',
        texte: 'Name your association, family or tontine and pick your currency. It’s free and instant.',
      },
      inviter: {
        titre: 'Add your members',
        texte: 'Enter members one by one or import them from an existing Excel / CSV file.',
      },
      suivre: {
        titre: 'Track contributions',
        texte: 'Record payments, generate receipts and let everyone check their status in real time.',
      },
    },
    pourQui: {
      overline: 'Who it’s for',
      titre: 'A space for every kind of collective',
      description:
        'NKONI fits the reality of groups built on trust and everyone’s contribution.',
      associations: {
        titre: 'Associations',
        texte: 'Annual dues, meetings, roles and resolutions — all of your association’s life in one place.',
      },
      familles: {
        titre: 'Extended families',
        texte: 'Solidarity funds, bereavements and events: clear treasury shared across branches.',
      },
      tontines: {
        titre: 'Tontines',
        texte: 'Track everyone’s stakes and cash movements, with no blind spots or lost notebooks.',
      },
    },
    capacites: {
      titre: 'And everything you need to run things day to day',
      description: 'One single app, from collection to accountability.',
      reunions: 'Meetings & attendance',
      resolutions: 'Resolutions & roles',
      cagnottes: 'Event funds',
      amendes: 'Fines & penalties',
      cartes: 'Member cards + QR',
      rapports: 'Reports & PDF/Excel exports',
      releve: 'Account statement PDF',
      recus: 'Automatic PDF receipts',
      horsLigne: 'Works even offline',
      multiDevise: 'Multi-currency & bilingual',
    },
    securite: {
      overline: 'Security & transparency',
      titre: 'Your collective finances, safe and verifiable',
      description:
        'Trust is built on proof: every space is partitioned and every movement leaves a trace.',
      isolation: {
        titre: 'Full isolation',
        texte: 'Each group has its own dedicated space. No data is ever shared or visible between organizations.',
      },
      tracabilite: {
        titre: 'Complete traceability',
        texte: 'Every payment, expense and change is timestamped and available in an audit log.',
      },
      exports: {
        titre: 'Your data stays yours',
        texte: 'Export your reports and receipts as PDF or Excel at any time, with no lock-in.',
      },
    },
    faq: {
      overline: 'Frequently asked',
      titre: 'What people often ask us',
      cout: {
        q: 'Is NKONI really free?',
        r: 'Yes. The Free plan covers up to 50 members with all the essential features, no credit card required.',
      },
      modules: {
        q: 'Does NKONI handle more than contributions?',
        r: 'Yes: event funds (bereavement, wedding, birth…), fines and penalties, member cards with a verification QR, PDF account statements, meetings and reports — all in the same space.',
      },
      donnees: {
        q: 'Is my data isolated from other groups?',
        r: 'Absolutely. Each organization has a partitioned space: no data is ever shared between spaces.',
      },
      horsLigne: {
        q: 'Can I enter data without an Internet connection?',
        r: 'Yes. NKONI installs like an app and saves your entries offline, then syncs them without duplicates as soon as the network is back.',
      },
      langues: {
        q: 'Is the app available in several languages?',
        r: 'Yes, in French and English, with date and amount formats matching your currency.',
      },
    },
    ctaFinal: {
      titre: 'Ready to bring clarity to your community?',
      description: 'Create your space in minutes. Free, no commitment.',
    },
    footer: 'NKONI — contribution management & financial transparency.',
    footerNav: {
      produit: 'Product',
      pourquoi: 'Why NKONI',
      forfaits: 'Plans',
      faq: 'FAQ',
      commencer: 'Get started',
      creer: 'Create my space',
      seConnecter: 'Sign in',
      contact: 'Contact us',
      contactSujet: 'NKONI — getting in touch',
      droits: '© 2026 NKONI. All rights reserved.',
    },
  },
}
