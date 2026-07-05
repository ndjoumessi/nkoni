# NKONI SaaS — Spécification technique de cadrage (v1.0)

> Ce document cadre la version multi-tenant commercialisable de NKONI, destinée à
> plusieurs familles/associations clientes. Il s'appuie sur la logique métier déjà
> développée et éprouvée dans le projet NKONI mono-tenant existant (voir
> `NKONI_Spec_Technique_Dev.md`), réutilisée comme référence fonctionnelle, mais
> **le code repart de zéro** sur une nouvelle base.

---

## 0. Décisions de cadrage (arbitrages validés)

| Sujet | Décision |
|---|---|
| Isolation des données entre clients | **Base de données partagée**, avec `organisationId` sur chaque table métier — pas de base séparée par client |
| Stratégie de développement | **⚠️ RÉVISÉ — Transformation sur place** du projet `nkoni` existant (pas de nouveau repo). Les données actuelles de la famille WAMBA TCHOUPA deviennent la 1ère `Organisation` du système multi-tenant, via une migration de données réelle sur la base de production existante. Voir §9 pour le protocole de sécurité obligatoire. |
| Facturation | **Aucune en v1** — lancement gratuit/beta pour valider le produit ; la facturation (Stripe ou équivalent) est un chantier V2 explicitement hors périmètre |
| Devises supportées | FCFA, EUR, USD, CAD — choisies **une fois à la création de l'organisation**, immuables ensuite (pas de changement de devise en cours de route pour une organisation existante) |
| Langues supportées | FR / EN, sélectionnable par utilisateur (pas seulement par organisation) |
| Réutilisation | La logique métier pure (calcul de statut cumulatif, équilibrage, arrondi/reliquat) est **conservée telle quelle**, uniquement enrichie du scoping par organisation en amont des requêtes |
| Données existantes | La famille WAMBA TCHOUPA (données réelles en production) devient la première organisation cliente du système transformé — pas de système parallèle |

---

## 1. Stack technique

Identique au projet existant, pour capitaliser sur l'expérience acquise :

| Composant | Choix |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Fastify |
| ORM | Prisma |
| Base de données | PostgreSQL |
| Auth | JWT (access + refresh), argon2 |
| i18n | À déterminer en phase 1 (ex. `react-i18next` côté front ; côté back, messages d'erreur/notifications traduits via une table de clés ou un fichier de ressources par langue) |
| Devises | Stockage en entier (plus petite unité, ex. centimes pour EUR/USD/CAD, unité FCFA sans décimales) + code devise (`FCFA`, `EUR`, `USD`, `CAD`) par organisation |

---

## 2. Modèle multi-tenant — principe d'isolation

### 2.1 Organisation comme racine de toute donnée

```prisma
model Organisation {
  id            String   @id @default(uuid())
  nom           String
  devise        Devise   // FCFA | EUR | USD | CAD, fixée à la création, immuable
  langueDefaut  Langue   @default(FR)
  actif         Boolean  @default(true)
  createdAt     DateTime @default(now())

  utilisateurs  Utilisateur[]
  membres       Membre[]
  // ... toutes les entités métier existantes gagnent une relation vers Organisation
}

enum Devise {
  FCFA
  EUR
  USD
  CAD
}

enum Langue {
  FR
  EN
}
```

Chaque modèle métier existant (`Membre`, `Contribution`, `Versement`, `BaremeAnnuel`,
`EquilibrageContribution`, `Conflit`, `Reunion`, etc.) reçoit un champ obligatoire
`organisationId` (FK vers `Organisation`), avec un index composite pour les requêtes
fréquentes (ex. `@@index([organisationId, annee])` sur Contribution).

### 2.2 Garantie d'isolation — non négociable

**Principe strict :** aucune requête Prisma ne doit s'exécuter sans un filtre
`organisationId` explicite, sur AUCUNE route. Deux mécanismes complémentaires,
appliqués ensemble (défense en profondeur, pas l'un ou l'autre) :

1. **Middleware/extension Prisma automatique** (comme pour l'audit trail du
   projet existant) : injecte `organisationId` dans le `where` de toute requête
   sur les modèles scopés, à partir du contexte de la requête HTTP authentifiée.
   Objectif : rendre une fuite structurellement difficile, pas juste rare.
2. **Tests d'isolation systématiques** : pour CHAQUE endpoint exposant des
   données scopées, un test explicite qui crée des données dans 2 organisations
   différentes et vérifie qu'un utilisateur de l'organisation A ne peut JAMAIS
   voir/modifier une donnée de l'organisation B (ni par liste, ni par accès
   direct via id). Ce test doit être aussi systématique que les tests de
   permissions par rôle dans le projet existant.

### 2.3 Rôle Super-Admin (nouveau, transverse aux organisations)

Rôle plateforme, au-dessus des rôles existants (`ADMIN`, `PRESIDENT`, etc. qui
restent scopés à une organisation) :
- Voit la liste des organisations clientes, leur statut (actif/suspendu), leur
  date de création
- Peut désactiver une organisation (accès bloqué, pas de suppression de données)
- Pas d'accès aux données métier des organisations (Membres, Contributions...)
  sauf raison de support explicite à cadrer séparément (V2)

---

## 3. Auth & onboarding

### 3.1 Auto-inscription (nouveau flux, absent du mono-tenant)

Le mono-tenant exigeait qu'un ADMIN existant crée chaque compte. En SaaS, il faut
un flux d'inscription en libre-service :

1. Formulaire "Créer mon espace" : nom de l'organisation, devise, langue, email +
   mot de passe de l'admin fondateur
2. Création atomique (transaction) : `Organisation` + premier `Utilisateur` en
   rôle `ADMIN` de cette organisation
3. Cet ADMIN peut ensuite inviter d'autres utilisateurs (réutilise le flux
   `/utilisateurs` existant, scopé à son organisation)

### 3.2 Le reste de l'auth est repris à l'identique

JWT access/refresh, cookie httpOnly, "se souvenir de moi", changement/réinitialisation
de mot de passe — logique déjà éprouvée, portée telle quelle avec ajout du scoping
organisation dans le payload JWT (`organisationId` inclus dans le token, vérifié à
chaque requête).

---

## 4. Internationalisation (FR/EN)

- **Frontend** : toutes les chaînes d'interface externalisées (fichiers de
  traduction FR/EN), sélecteur de langue par utilisateur (préférence personnelle,
  indépendante de la langue par défaut de l'organisation)
- **Backend** : messages d'erreur et notifications traduits selon la langue de
  l'utilisateur destinataire (stockée sur `Utilisateur`, pas juste sur
  `Organisation`)
- **Formats** : dates et montants formatés selon la locale (ex. séparateur
  décimal, symbole monétaire après/avant le montant selon la devise)
- **Hors périmètre v1** : traduction de contenu généré par les utilisateurs
  (ex. le texte d'une Résolution reste dans la langue dans laquelle il a été
  écrit, pas de traduction automatique)

---

## 5. Devises

- Un `Devise` par organisation, choisi à la création, **immuable** une fois que
  des données financières existent pour cette organisation (empêche un
  changement de devise qui corromprait l'historique)
- Stockage : entier en plus petite unité (centimes pour EUR/USD/CAD ; FCFA reste
  en unité entière, pas de centimes usuels)
- Affichage : formaté selon la devise (`1 234,56 €`, `$1,234.56`, `1 234 FCFA`)
- Aucune conversion inter-devises n'est nécessaire en v1 (chaque organisation vit
  entièrement dans sa devise choisie)

---

## 6. Réutilisation de la logique métier existante

Fonctions pures à porter **sans réécriture de la logique**, seule l'intégration
change (scoping organisation ajouté en amont, avant l'appel) :

- `calculerStatutContribution` (statut cumulatif A_JOUR/PARTIEL/NON_A_JOUR)
- `calculerRepartition` / logique d'équilibrage (arrondi + reliquat sur la
  dernière année, contrainte de conservation de somme)
- `peutVoirConflit` (matrice de confidentialité) — le principe se généralise
  bien : ajouter `organisationId` comme premier filtre avant d'appliquer la
  logique de rôle/identité existante
- La logique d'audit trail (capture avant/après, exclusion `passwordHash`)

---

## 7. Périmètre du MVP SaaS (v1)

### Bloquant (cœur du produit commercialisable)
1. Organisation + isolation multi-tenant + auto-inscription
2. Auth complète (portée du mono-tenant)
3. i18n FR/EN (interface)
4. Devise par organisation (FCFA/EUR/USD/CAD)
5. CRUD Membres/Branches/Barème/Contributions/Versements (porté)
6. Statut cumulatif + Équilibrage (porté, logique pure réutilisée)
7. Dashboard (porté, scopé par organisation)
8. Rôle Super-Admin (liste/désactivation d'organisations)

### Important (peut suivre rapidement après le lancement)
- Réunions/Résolutions, Fonctions/organes (portés)
- Reçus, Exports PDF/Excel (portés)

### Hors périmètre v1 (explicitement reporté)
- Facturation/abonnement (Stripe)
- Conflits, Commémorations, Documents, Notifications, Audit trail, Rapports
  financiers avancés (tout le V2 du mono-tenant) — à reporter en V1.1/V2 du SaaS,
  une fois le cœur multi-tenant validé et stable
- Conversion entre devises
- Traduction de contenu utilisateur

---

## 9. Protocole de sécurité obligatoire — transformation sur place

⚠️ Cette section est **non négociable**. Le projet `nkoni` existant est en
production, utilisé par de vraies données financières réelles (famille WAMBA
TCHOUPA). Une transformation sur place de cette ampleur (ajout d'`organisationId`
sur ~20 modèles, migration de données réelles) ne doit JAMAIS se faire directement
sur `main`/production sans les garde-fous suivants :

1. **Sauvegarde complète de la base de production AVANT toute migration**
   (dump PostgreSQL complet, vérifié restaurable, stocké en lieu sûr) — à faire
   systématiquement avant chaque étape de migration de schéma, pas une fois pour
   toutes.
2. **Développement sur une branche dédiée** (ex. `feat/multi-tenant`), jamais
   directement sur `main`. Le déploiement Railway/Vercel doit avoir un
   environnement de preview/staging séparé de la production tant que la
   transformation n'est pas validée de bout en bout.
3. **Migration de schéma en étapes réversibles** : ajouter `organisationId`
   comme colonne nullable d'abord, peupler les données existantes (assigner
   toutes les lignes actuelles à l'organisation "WAMBA TCHOUPA" créée en premier),
   PUIS seulement rendre la colonne obligatoire (`NOT NULL`) une fois vérifié que
   100% des lignes sont correctement peuplées. Ne jamais rendre une colonne
   obligatoire avant d'avoir vérifié l'intégrité complète des données migrées.
4. **Suite de tests existante (400+ tests) comme filet de sécurité minimal** :
   aucune fonctionnalité déjà couverte par un test ne doit régresser. Chaque test
   existant doit être adapté pour scoper ses données de test à une organisation,
   sans changer ce qu'il vérifie sur le fond.
5. **Test d'isolation multi-tenant AVANT tout déploiement en production** :
   créer 2 organisations de test, vérifier de façon exhaustive qu'aucune requête
   ne fuit entre elles (voir §2.2), avant même d'envisager de basculer les
   données réelles de la famille.
6. **Bascule finale en fenêtre de maintenance annoncée** : le jour où les
   données réelles de la famille sont migrées vers le nouveau modèle, prévenir
   les utilisateurs actuels d'une interruption de service temporaire, plutôt
   qu'une migration silencieuse en arrière-plan sur des données vivantes.

---

## 10. Points ouverts — tous tranchés

1. ~~Nom de domaine et sous-domaines~~ — **Tranché** : **domaine unique partagé**
   pour toutes les organisations. Après connexion, l'utilisateur sélectionne
   son organisation (ou y accède directement si son compte n'est lié qu'à une
   seule, cas le plus fréquent). Pas de sous-domaine dédié par client en v1.
2. ~~Limite de plan gratuit~~ — **Tranché** : plafond de **100 membres par
   organisation** en plan gratuit, pas de limite de durée. Au-delà de 100
   membres, l'organisation doit passer à un plan payant (dont la définition
   reste hors périmètre v1, cf. §7 — la limite technique doit néanmoins être
   implémentée dès le départ : blocage de création d'un 101e membre avec message
   clair invitant à contacter le support/upgrade).
3. ~~Migration des données existantes~~ — **Tranché (§0, §9)** : les données de
   la famille WAMBA TCHOUPA deviennent la première organisation, via
   transformation sur place du projet existant, selon le protocole de
   sécurité du §9.

Tous les points de cadrage sont désormais actés. Le développement peut démarrer,
en respectant strictement le protocole de sécurité du §9.
