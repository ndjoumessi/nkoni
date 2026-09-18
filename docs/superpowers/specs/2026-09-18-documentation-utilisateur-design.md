# Documentation utilisateur & administrateur (FR/EN) — design

**Chantier** : roadmap 2.1 « Documentation ». **Date** : 2026-09-18.
**État de départ** : aucune documentation utilisateur n'existe. L'onboarding (roadmap 1.2) couvre les
premiers pas — `GuideDemarrage`, `EmptyState` à CTA, espace de démonstration, aide contextuelle sur
17 notions — mais rien n'explique un parcours de bout en bout ni ne répond à une question précise.

## 1. Décisions de cadrage (validées par le PO)

| Question | Décision | Conséquence |
|---|---|---|
| Ampleur | **Guide ciblé** sur les parcours qui génèrent du support, pas une référence exhaustive | Une fonctionnalité peu utilisée est mentionnée, pas détaillée. Une doc exhaustive périmée coûte plus cher que pas de doc. |
| Découpage | **Deux guides** : membre et bureau | Chacun lit un document qui ne parle que de lui. |
| Accès | **Public**, comme les pages légales | Lisible par un prospect, partageable par lien, et utilisable par quelqu'un qui n'arrive pas à se connecter — un cas de support fréquent. |
| Langues | **FR et EN** | Parité tenue par le compilateur (§3). |
| FAQ | **Oui**, document séparé | Répond à une question précise sans lire un guide. |

## 2. Contrainte technique structurante

Les 34 catalogues i18n sont agrégés dans `locales/{fr,en}/index.ts`, **chargé au démarrage**. Y déposer
la documentation alourdirait le paquet initial pour TOUT LE MONDE, y compris un membre sur mobile qui
ne la lira jamais — inacceptable sur une PWA destinée à des connexions limitées.

**Le contenu de la documentation n'entre donc JAMAIS dans les catalogues i18n.** Il vit dans des
modules dédiés, chargés par `import()` dynamique à l'ouverture de la route. Seule la **coquille**
(titres de navigation, fil d'Ariane, libellés d'interface) passe par un namespace i18n `aide` normal,
qui reste minuscule.

## 3. Architecture

### Routes (publiques, hors `ProtectedRoute`)

| Route | Contenu |
|---|---|
| `/aide` | Sommaire : les trois entrées, avec une phrase de description chacune |
| `/aide/membre` | Guide du membre |
| `/aide/bureau` | Guide du bureau |
| `/aide/faq` | Questions fréquentes |

Routes statiques déclarées AVANT les routes paramétrées (invariant `CLAUDE.md`). Chaque section est
adressable par ancre (`/aide/bureau#encaisser-versement`) pour qu'un lien mène droit au point utile.

### Fichiers

```
frontend/src/pages/aide/AidePage.tsx          — sommaire
frontend/src/pages/aide/GuidePage.tsx         — rendu d'un guide (membre | bureau | faq)
frontend/src/components/aide/RenduDoc.tsx     — rendu des blocs typés + sommaire d'ancres
frontend/src/content/aide/types.ts            — modèle de contenu (types seuls)
frontend/src/content/aide/fr/membre.ts        — contenu FR
frontend/src/content/aide/fr/bureau.ts
frontend/src/content/aide/fr/faq.ts
frontend/src/content/aide/en/membre.ts        — contenu EN, même structure (parité gardée, cf. §3)
frontend/src/content/aide/en/bureau.ts
frontend/src/content/aide/en/faq.ts
frontend/src/locales/{fr,en}/aideDoc.ts       — coquille seulement (titres de nav, fil d'Ariane)
```

Le namespace i18n s'appelle `aideDoc` et non `aide` : `aide` existe déjà pour l'aide contextuelle
(`lib/aide.ts`, les 17 notions), et réutiliser son nom mélangerait deux choses distinctes.

### Modèle de contenu (`content/aide/types.ts`)

```ts
export type Bloc =
  | { type: 'paragraphe'; texte: string }
  | { type: 'etapes'; etapes: string[] }        // liste ORDONNÉE : « faites ceci, puis cela »
  | { type: 'liste'; items: string[] }          // liste non ordonnée
  | { type: 'note'; ton: 'info' | 'attention'; texte: string }
  | { type: 'lien'; vers: string; libelle: string } // route INTERNE de l'app uniquement

export interface SectionDoc {
  id: string        // ancre stable, en kebab-case ; NE CHANGE JAMAIS une fois publié (liens partagés)
  titre: string
  blocs: Bloc[]
}

export interface Document {
  titre: string
  intro: string
  sections: SectionDoc[]
}
```

Ce modèle donne le rendu, les ancres et le sommaire sans effort, et garde les chaînes courtes — donc
relisibles en diff, contrairement à des pavés de prose.

### Parité FR/EN

Chaque module EN déclare `const document: Document = {...}` et un test de structure compare les
identifiants de section FR/EN. Le typage seul ne suffit PAS ici (contrairement aux catalogues i18n) :
`Document` est une structure, pas un objet à clés fixes, donc TypeScript n'oblige pas à couvrir les
mêmes sections. La parité est donc **un garde exécutable** (§5), pas une propriété du compilateur.

### Chargement

`GuidePage` résout `(langue, guide)` vers un `import()` dynamique, dans un `Suspense` avec le
`Skeleton` existant. La langue vient de `i18n.language`. Un guide absent dans la langue courante
retombe sur le français plutôt que d'afficher une erreur — un texte dans la mauvaise langue vaut mieux
qu'une page vide.

## 4. Plan de contenu

### Guide du membre (`/aide/membre`)

1. `se-connecter` — première connexion, mot de passe oublié, changement de mot de passe
2. `ma-situation` — attendu, versé, reste à payer, sur quelles années
3. `mon-statut` — pourquoi « à jour », « partiel » ou « non à jour » ; ce que « valorisé » veut dire
4. `payer-en-ligne` — Mobile Money quand l'organisation l'a activé ; que faire si le paiement échoue
5. `mes-recus` — consulter, télécharger, partager le lien d'un reçu
6. `reunions-et-votes` — confirmer sa présence, voter une résolution ouverte
7. `ma-carte` — carte de membre et QR de vérification
8. `notifications` — activer les notifications sur son téléphone, choisir lesquelles
9. `hors-connexion` — ce qui fonctionne sans réseau et ce qui est mis en attente
10. `mon-profil` — photo, langue, coordonnées

### Guide du bureau (`/aide/bureau`)

1. `mettre-en-route` — barème de l'année, ouverture de l'année, premiers membres, désignation du chef
2. `ajouter-des-membres` — création unitaire et import d'un fichier ; ce que le quota du forfait limite
3. `encaisser-un-versement` — modes de paiement, choix de l'année, ouverture ciblée à la volée
4. `recus` — générer, envoyer, retrouver un reçu
5. `corriger-une-erreur` — **la voie annuler → corriger → réémettre** ; pourquoi un reçu actif bloque la modification et la suppression du versement
6. `suivre-le-recouvrement` — statuts, membres à relancer, relance WhatsApp
7. `tresorerie-et-depenses` — circuit brouillon → en attente → approuvée → payée ; qui approuve, qui paie
8. `vie-associative` — réunions, ordre du jour, résolutions, ouvrir un vote, dépouiller, compte-rendu
9. `autres-caisses` — cagnottes, amendes, tontines, en bref
10. `comptes-et-roles` — créer un utilisateur, réinitialiser un mot de passe, ce que chaque rôle peut faire
11. `forfait` — limites, échéance, période de grâce, ce qui se passe après
12. `exports-et-rapports` — quoi exporter, dans quel format, dans quelle langue
13. `parametres-immuables` — ce qui ne se change pas après la création, et pourquoi

### FAQ (`/aide/faq`)

Questions issues des frictions que le code rend prévisibles :

1. `annee-non-encaissable` — « Je ne peux pas enregistrer un versement sur cette année »
2. `membre-non-a-jour-alors-quil-a-paye` — années antérieures non couvertes, versé vs valorisé
3. `modifier-un-versement` — refusé tant qu'un reçu actif existe
4. `supprimer-un-versement` — le reçu survit en trace ; pourquoi
5. `ajout-de-membre-bloque` — quota de membres du forfait
6. `canal-denvoi-du-recu` — par quel canal part un reçu, et ce qui arrive si aucun n'est configuré
7. `reouvrir-une-annee` — pourquoi « Rien à créer » n'est pas une erreur
8. `annee-future` — pourquoi on ne peut pas ouvrir une année à venir
9. `mot-de-passe-oublie` — la marche à suivre
10. `sessions-et-deconnexion` — pourquoi changer son mot de passe déconnecte les autres appareils
11. `qui-voit-quoi` — visibilité des documents et des votes
12. `donnees-et-suppression` — export de ses données, suppression d'un espace

Les réponses citent les règles RÉELLES du produit ; toute règle écrite dans la documentation est
vérifiée dans le code au moment de la rédaction (défaut vécu sur l'aide contextuelle : deux textes
affirmaient l'inverse du code et ont dû être corrigés après coup).

## 5. Garde-fous exécutables

| Garde | Ce qu'il empêche |
|---|---|
| `aide-doc-parite.test.ts` | FR et EN couvrent les MÊMES sections, dans le même ordre, pour les trois documents. Une section traduite à moitié ne passe pas. |
| `aide-doc-ancres.test.ts` | Les `id` de section sont uniques dans un document et en kebab-case (une ancre en double rend un lien partagé imprévisible). |
| `aide-doc-liens.test.ts` | Tout bloc `lien` pointe vers une route DÉCLARÉE dans `App.tsx` — une documentation qui renvoie vers une page disparue est pire qu'une documentation sans lien. |

Chaque garde est **sabotée dans la direction utile** avant d'être considérée comme acquis, et porte un
`expect(n).toBeGreaterThan(0)` pour ne jamais devenir vacant (doctrine `docs/architecture-garde-fous.md`).

## 6. Navigation

- Pied de page de l'accueil : lien « Aide » à côté de Confidentialité, CGU et Statut (`LandingPage.tsx`).
- Coquille de l'application : entrée « Aide » dans le menu compte, à côté de « Mon profil ».
- Page de connexion : lien vers `/aide/faq`, pour le cas « je n'arrive pas à me connecter ».

## 7. Hors périmètre (délibérément)

- **Brancher les « ? » de l'aide contextuelle sur les ancres de la documentation.** Naturel ensuite,
  mais coupler les deux chantiers double la surface de revue. `LIENS_AIDE` reste inchangé.
  *(Fait ensuite, 2026-09-18 : `LIENS_AIDE` pointe vers les sections, ouvertes dans un nouvel onglet.)*
- **Recherche plein texte.** Trois documents courts avec sommaire d'ancres ; un moteur de recherche
  serait du travail sans bénéfice mesurable à cette taille.
- **Captures d'écran.** Elles périment à chaque refonte visuelle et alourdissent le chargement ; le
  texte décrit les libellés RÉELS de l'interface, qui sont stables et traduits.
- **Guide du super-administrateur.** La console plateforme n'a qu'un utilisateur, le PO.

## 8. Critères de sortie

1. Les quatre routes répondent, sans compte, en FR et en EN.
2. Aucun octet de contenu de documentation dans le paquet initial (vérifié sur la sortie de build).
3. Les trois gardes passent, et échouent quand on les sabote.
4. `npm run build`, `npm run lint` (0 finding) et `npm run test` verts côté frontend.
5. Chaque règle métier énoncée dans les textes a été vérifiée dans le code.
