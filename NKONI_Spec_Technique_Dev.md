# NKONI — Spécification technique de développement (v1.0)

> Document de handoff pour développement avec Claude Code. Il complète et tranche
> les ambiguïtés du cahier des charges fonctionnel (`NKONI_Cahier_des_charges_v1.1`).
> En cas de conflit entre les deux documents, **ce document fait foi**.

---

## 0. Décisions de cadrage (arbitrages validés)

| Sujet | Décision |
|---|---|
| Calcul du statut à jour / partiel / non à jour | **Cumulatif** : basé sur le cumul des arriérés depuis l'année d'adhésion du membre, pas seulement l'année en cours |
| Montant attendu annuel | **Uniforme** pour tous les membres (un seul barème global par année, pas de surcharge par membre) |
| Équilibrage & statut rétroactif | **Cumulatif** : le statut n'est jamais stocké en dur, il est toujours recalculé à partir des montants valorisés courants → un équilibrage ne peut mécaniquement pas casser un statut déjà "à jour" sur la période équilibrée, car la somme totale attendue/versée ne change pas |
| Équilibrages qui se chevauchent | **Cumulatif** : un nouvel équilibrage prend les montants valorisés *actuels* (donc déjà éventuellement lissés par un équilibrage précédent) sur sa propre plage, et les relisse. Pas d'annulation de l'équilibrage précédent, juste un nouveau calcul sur l'état courant |
| Gestion des branches familiales | Liste **gérée par l'administrateur** (création manuelle des branches, rattachement manuel des membres) — pas de dérivation automatique depuis un arbre généalogique |
| Confidentialité des conflits | **Oui**, 3 niveaux (voir §4.9, module V2) |
| Droits du Commissaire aux comptes | **Oui**, accès **lecture seule** à l'intégralité du module financier (contributions, versements, équilibrages, exports) |
| Authentification | Identifiant = **email** pour tous les profils, y compris membre simple |
| Génération du reçu de versement | **À la demande** (bouton "Générer le reçu"), jamais automatique à la saisie |

---

## 1. Stack technique imposée

| Composant | Choix |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Fastify |
| ORM | Prisma |
| Base de données | PostgreSQL |
| Auth | JWT (access + refresh token), hash mot de passe avec argon2 ou bcrypt |
| Génération PDF (reçus, rapports) | À définir en phase 1 (ex. Puppeteer ou PDFKit) |
| Export Excel | À définir en phase 1 (ex. exceljs) |

---

## 2. Rôles et matrice de permissions (MVP)

Rôles : `ADMIN`, `PRESIDENT`, `SECRETAIRE`, `TRESORIERE`, `COMMISSAIRE_COMPTES`, `GUIDE_RELIGIEUX`, `MEMBRE_SIMPLE`.

| Entité \ Rôle | ADMIN | PRESIDENT | SECRETAIRE | TRESORIERE | COMMISSAIRE_COMPTES | MEMBRE_SIMPLE |
|---|---|---|---|---|---|---|
| Membre (CRUD) | CRUD | Lecture | Créer/Modifier | Lecture | Lecture | Lecture (sa propre fiche) |
| BrancheFamiliale | CRUD | Lecture | Lecture | Lecture | Lecture | — |
| BaremeAnnuel | CRUD | Lecture | — | Lecture | Lecture | — |
| Contribution | CRUD | Lecture | — | CRUD | Lecture seule | Lecture (les siennes) |
| Versement | CRUD | Lecture | — | CRUD | Lecture seule | Lecture (les siens) |
| Équilibrage | Créer/Appliquer | Lecture | — | Créer/Appliquer | Lecture seule | — |
| Reçu | Générer | Générer | — | Générer | Générer | Générer (les siens) |
| Utilisateur (comptes) | CRUD | — | — | — | — | Modifier son propre profil |
| Tableau de bord | Complet | Complet | Vue restreinte | Financier | Financier | Vue perso |
| Export PDF/Excel | Oui | Oui | Non | Oui | Oui | Non |

> `GUIDE_RELIGIEUX` : aucun droit sur les entités MVP ci-dessus (son périmètre — commémorations, cérémonies — arrive en V2). Prévoir le rôle dans l'enum dès maintenant, sans lui donner de permission avant V2.

**Règle d'implémentation :** la vérification des permissions doit se faire côté backend (middleware Fastify par route), jamais uniquement côté frontend.

---

## 3. Modèle de données (MVP)

### 3.1 Schéma Prisma de référence

```prisma
enum Role {
  ADMIN
  PRESIDENT
  SECRETAIRE
  TRESORIERE
  COMMISSAIRE_COMPTES
  GUIDE_RELIGIEUX
  MEMBRE_SIMPLE
}

enum StatutMembre {
  ACTIF
  INACTIF
  DECEDE
}

enum ModeVersement {
  ESPECES
  TIERS
  AUTRE
}

enum StatutContribution {
  A_JOUR
  PARTIEL
  NON_A_JOUR
}

model Utilisateur {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         Role
  actif        Boolean  @default(true)
  membre       Membre?  @relation("CompteMembre")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model BrancheFamiliale {
  id          String   @id @default(uuid())
  nom         String
  description String?
  membres     Membre[]
  createdAt   DateTime @default(now())
}

model Membre {
  id                  String            @id @default(uuid())
  nom                 String
  prenom              String
  sexe                String?
  dateNaissance       DateTime?
  fonctionSociale     String?
  statut              StatutMembre      @default(ACTIF)
  telephone           String?
  adresse             String?
  brancheId           String?
  branche             BrancheFamiliale? @relation(fields: [brancheId], references: [id])
  chefSousFamilleId   String?
  chefSousFamille     Membre?           @relation("ChefSousFamille", fields: [chefSousFamilleId], references: [id])
  membresRattaches    Membre[]          @relation("ChefSousFamille")
  anneeAdhesion       Int               // année à partir de laquelle la contribution est attendue
  anneeFinContribution Int?             // renseignée automatiquement si statut = DECEDE ou INACTIF
  dateDeces           DateTime?
  compteUtilisateurId String?           @unique
  compteUtilisateur   Utilisateur?      @relation("CompteMembre", fields: [compteUtilisateurId], references: [id])
  contributions       Contribution[]
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
}

model BaremeAnnuel {
  id             String @id @default(uuid())
  annee          Int    @unique
  montantAttendu Int    // en FCFA, uniforme pour tous les membres actifs cette année-là
  createdAt      DateTime @default(now())
}

model Contribution {
  id              String   @id @default(uuid())
  membreId        String
  membre          Membre   @relation(fields: [membreId], references: [id])
  annee           Int
  montantAttendu  Int      // copié du BaremeAnnuel au moment de la création (historisation)
  montantVerse    Int      @default(0) // somme dénormalisée des Versement.montant
  montantValorise Int      @default(0) // = montantVerse par défaut, modifiable uniquement par un Équilibrage
  versements      Versement[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([membreId, annee])
}

model Versement {
  id              String        @id @default(uuid())
  contributionId  String
  contribution    Contribution  @relation(fields: [contributionId], references: [id])
  montant         Int
  dateVersement   DateTime
  mode            ModeVersement
  receptionnaireId String?      // FK Utilisateur (généralement la trésorière)
  note            String?
  createdAt       DateTime      @default(now())
}

model EquilibrageContribution {
  id             String   @id @default(uuid())
  membreId       String
  anneeDebut     Int
  anneeFin       Int
  totalPeriode   Int      // total conservé, doit être identique avant/après
  auteurId       String   // FK Utilisateur
  dateApplication DateTime @default(now())
  details        EquilibrageDetail[]
}

model EquilibrageDetail {
  id             String   @id @default(uuid())
  equilibrageId  String
  equilibrage    EquilibrageContribution @relation(fields: [equilibrageId], references: [id])
  annee          Int
  montantAvant   Int
  montantApres   Int
}

model Recu {
  id             String   @id @default(uuid())
  versementId    String
  numero         String   @unique // ex. NKONI-2025-000123
  genereParId    String   // FK Utilisateur
  dateGeneration DateTime @default(now())
  urlPdf         String?
}
```

### 3.2 Entités hors périmètre MVP (à prévoir dans l'enum/schema mais non développées)

À déclarer dans le schéma pour éviter une migration lourde plus tard, sans développer la logique associée en MVP :
`Reunion`, `PointOrdreDuJour`, `Resolution`, `FonctionFamiliale`, `AffectationFonction`,
`EvenementFamilial`, `Conflit` (avec `niveauConfidentialite`), `Commemoration`, `Document`, `Notification`.

---

## 4. Règles de gestion détaillées

### 4.1 Calcul du statut de contribution (cumulatif)

Pour un membre donné, à un instant T (généralement l'année en cours) :

```
totalAttenduCumule = Σ BaremeAnnuel.montantAttendu
                      pour chaque année entre membre.anneeAdhesion
                      et min(anneeCourante, membre.anneeFinContribution ?? anneeCourante)

totalValoriseCumule = Σ Contribution.montantValorise
                       pour les mêmes années

statut :
  - A_JOUR      si totalValoriseCumule >= totalAttenduCumule
  - PARTIEL     si 0 < totalValoriseCumule < totalAttenduCumule
  - NON_A_JOUR  si totalValoriseCumule == 0
```

**Important :** ce statut n'est **jamais stocké tel quel** en base comme vérité figée — il doit être recalculé à la volée (ou recalculé et mis en cache à chaque écriture sur `Contribution`/`Versement`/`Équilibrage`). Ne pas figer un `statut` par année de façon indépendante : c'est le cumul qui fait foi. C'est ce qui garantit qu'un équilibrage ne peut jamais faire "reculer" un membre déjà à jour, puisque la somme totale ne change pas.

Un membre `DECEDE` ou `INACTIF` cesse d'accumuler de nouvelles attentes après `anneeFinContribution` (renseignée au moment du changement de statut), mais conserve son historique et son statut cumulatif figé à cette date.

### 4.2 Barème annuel

- Un seul `BaremeAnnuel.montantAttendu` par année, applicable à tous les membres actifs cette année-là.
- Pas de surcharge par membre en MVP. Si un besoin de dérogation apparaît (ex. membres à l'étranger), il sera traité en V2 via un champ optionnel sur `Contribution.montantAttendu` (déjà prévu dans le schéma, actuellement toujours copié du barème global).

### 4.3 Équilibrage entre années

1. La trésorière ou l'admin sélectionne un membre + une plage d'années contiguës (`anneeDebut`, `anneeFin`).
2. Le système calcule `totalPeriode = Σ Contribution.montantValorise` sur cette plage (valeurs **courantes**, qui peuvent déjà refléter un équilibrage précédent).
3. Le système propose `montantParAnnee = totalPeriode / nombreAnnees` (arrondi à définir — proposition : arrondir à l'entier le plus proche pour toutes les années sauf la dernière, qui absorbe le reliquat, pour garantir l'égalité exacte de la somme).
4. La trésorière valide tel quel ou ajuste manuellement chaque année, **sous contrainte bloquante** : `Σ montants ajustés === totalPeriode`.
5. À la validation :
   - Créer un `EquilibrageContribution` + ses `EquilibrageDetail` (montant avant/après par année), dans une **transaction Prisma** (`$transaction`).
   - Mettre à jour `Contribution.montantValorise` pour chaque année concernée.
   - Ne **jamais** toucher aux lignes `Versement` (les versements réels restent inchangés, seule la valorisation change).
6. Les équilibrages qui se chevauchent sont autorisés : le calcul repart toujours de l'état courant de `montantValorise`, donc la somme totale réellement versée reste toujours conservée globalement, quel que soit le nombre d'équilibrages appliqués.

### 4.4 Confidentialité des conflits (V2 — à titre de cadrage anticipé)

Trois niveaux sur `Conflit.niveauConfidentialite` :
- `PUBLIC` : visible par tous les membres connectés
- `BUREAU` : visible par bureau exécutif + président + admin
- `CONFIDENTIEL` : visible uniquement par l'auteur, le responsable de suivi désigné, et l'admin

### 4.5 Authentification

- Identifiant unique = email, pour tous les rôles y compris `MEMBRE_SIMPLE`.
- Un `Membre` sans email ne peut pas avoir de compte `Utilisateur` ; sa fiche reste gérée uniquement par l'admin/secrétaire/trésorière (cas fréquent en pratique — ne pas bloquer la création d'un `Membre` sur l'existence d'un compte).

### 4.6 Reçu de versement

- Jamais généré automatiquement à la saisie d'un versement.
- Généré à la demande via une action explicite, à partir d'un `Versement` existant.
- Numérotation séquentielle unique (`Recu.numero`, format proposé `NKONI-{annee}-{sequence}`).

---

## 5. Découpage en phases de développement

### MVP (bloquant — cœur métier)
1. Auth (email/mot de passe, JWT) + gestion des rôles
2. CRUD Membres + Branches familiales (gérées par l'admin)
3. Barème annuel (admin)
4. Contributions : création automatique à l'ouverture d'année, saisie de versements multiples, calcul `montantVerse`
5. Statut cumulatif à jour/partiel/non à jour (calculé à la volée)
6. Équilibrage entre années (avec transaction atomique et contrainte de conservation)
7. Génération de reçu à la demande
8. Tableau de bord (total attendu, total collecté, membres à jour/en retard)
9. Export PDF/Excel des contributions

### V1.1 (important)
- Réunions, ordre du jour, comptes rendus
- Résolutions liées aux réunions
- Fonctions/organes + historique des nominations

### V2 (nice-to-have)
- Conflits (avec niveaux de confidentialité définis en §4.4)
- Événements familiaux, commémorations
- Documents/archives
- Notifications
- Audit trail transverse (historique des modifications toutes entités)

---

## 6. Prompt de démarrage pour Claude Code

```
Tu es un développeur full-stack senior. Nous construisons NKONI, un logiciel de gestion
familiale pour la famille WAMBA TCHOUPA. Le document de référence complet est
"NKONI_Spec_Technique_Dev.md" — respecte-le strictement, en particulier les règles de
gestion de la section 4 (statut cumulatif, équilibrage transactionnel, barème uniforme).

STACK :
- Frontend : React + Vite
- Backend : Node.js + Fastify
- ORM : Prisma
- Base de données : PostgreSQL
- Auth : JWT + hash argon2/bcrypt

PÉRIMÈTRE DE CE SPRINT : uniquement le MVP décrit en section 5. Ne développe pas les
modules Réunions, Résolutions, Conflits, Événements — ils viendront plus tard, mais
déclare-les dans le schéma Prisma comme squelette vide si c'est trivial de le faire
maintenant pour éviter une migration lourde.

ÉTAPES ATTENDUES, DANS L'ORDRE :
1. Initialise le projet (monorepo ou deux dossiers frontend/backend, à ta discrétion,
   propose-moi une structure avant de générer les fichiers).
2. Génère le schema.prisma à partir de la section 3.1 du document — reprends-le tel quel,
   ne le modifie pas sans me le signaler.
3. Implémente le calcul du statut cumulatif (section 4.1) comme fonction pure testable,
   pas comme colonne stockée figée.
4. Implémente l'équilibrage (section 4.3) dans une transaction Prisma unique, avec la
   contrainte bloquante de conservation de la somme. Écris un test qui vérifie qu'un
   équilibrage qui chevauche un équilibrage précédent reste cohérent.
5. Implémente la matrice de permissions de la section 2 via un middleware Fastify
   appliqué à chaque route — pas de contrôle uniquement côté frontend.
6. Construis les endpoints CRUD Membres, Branches, Barème, Contributions, Versements,
   Équilibrages, Reçus (génération à la demande uniquement).
7. Construis le tableau de bord et les exports PDF/Excel en dernier.

Avant d'écrire du code, confirme-moi ta compréhension du calcul du statut cumulatif
(section 4.1) avec un exemple chiffré, pour qu'on valide ensemble avant que tu codes.
```
