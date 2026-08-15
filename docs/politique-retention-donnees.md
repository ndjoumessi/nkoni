# Politique de rétention des données — NKONI

Dernier volet actionnable du chantier **0.3** de [`roadmap-v1-vers-GA.md`](roadmap-v1-vers-GA.md).
Complète la politique de confidentialité (`/confidentialite`) et les CGU (`/cgu`).

**Ce document est un ENGAGEMENT, pas une description.** Chaque durée annoncée doit être tenue —
donc chacune indique ici si elle est **appliquée automatiquement**, **appliquée sur demande**, ou
**pas encore outillée**. Annoncer une purge automatique qui n'existe pas serait un mensonge
opposable.

---

## 1. Principe directeur

NKONI est un outil de **transparence financière associative**. Deux exigences s'y opposent, et
l'arbitrage doit être explicite :

- la **minimisation** RGPD : ne pas conserver de données personnelles au-delà du nécessaire ;
- la **traçabilité comptable** : une association doit pouvoir justifier ses comptes des exercices
  passés — devant ses membres, un commissaire aux comptes, ou en cas de conflit.

**Arbitrage retenu** : les données **financières** (versements, reçus, dépenses) sont conservées
tant que l'organisation est active, car les supprimer détruirait la preuve même que le produit
existe pour établir. Les données **techniques et périssables** (sessions, notifications, journaux
d'audit, abonnements push) sont purgées à échéance courte. Les données **personnelles non
financières** suivent le cycle de vie du membre.

C'est la donnée financière qui est durable ; le reste ne l'est pas.

---

## 2. Durées par catégorie

### 2.1 Compte et session

| Donnée | Durée | Application |
|---|---|---|
| `RefreshToken` (jeton de session) | **7 j**, ou **30 j** si « se souvenir de moi » | ✅ **Automatique** — champ `expiresAt` en base ; un jeton expiré est refusé au refresh. Révoqué immédiatement à la déconnexion (toute la famille) et au changement de mot de passe (via `sessionEpoch`). |
| Jeton d'accès (JWT) | **15 min** | ✅ Automatique — non stocké, expiration portée par le jeton. |
| `Utilisateur` (email, rôle, préférences, avatar) | Vie du compte | Supprimé avec l'organisation (offboarding). |
| Empreinte du mot de passe (argon2) | Vie du compte | Jamais exportée (`omit: passwordHash`), jamais journalisée. |

### 2.2 Données de membre (PII)

| Donnée | Durée | Application |
|---|---|---|
| Identité (`nom`, `prenom`, `dateNaissance`) | Vie de l'organisation | Nécessaire à l'imputation des cotisations. |
| Contact (`telephone`, `email`, `adresse`) | Vie de l'organisation | Support des relances et de l'envoi de reçus. |
| **Photo** (`photoBlobUrl`) | Vie du membre, **suppression immédiate sur demande** | ✅ Le membre peut la retirer lui-même (`DELETE /moi/photo`) — effet immédiat, blob effacé. |
| Statut (`ACTIF`/`INACTIF`/`DECEDE`) | Vie de l'organisation | Un membre inactif ou décédé **n'est pas supprimé** : ses versements passés doivent rester imputables. |

> **Membre décédé** : les données restent, car les cotisations versées appartiennent à l'historique
> comptable de l'association. Le RGPD ne s'applique pas aux personnes décédées, mais les familles
> peuvent demander le retrait de la **photo** et des **coordonnées** — traitable immédiatement,
> sans toucher à l'historique financier.

### 2.3 Données financières

| Donnée | Durée | Justification |
|---|---|---|
| `Versement`, `Contribution`, `Depense` | **Vie de l'organisation** | Preuve comptable. Leur suppression viderait le produit de son objet. |
| `Recu` | **Vie de l'organisation, y compris annulés et orphelins** | Un reçu numéroté ne disparaît jamais : son numéro serait réattribué, et deux reçus porteraient le même numéro à des dates différentes. Un reçu annulé garde son numéro et sa trace. |
| `Paiement` (PSP) | Vie de l'organisation | Réconciliation. **Ne contient aucune donnée de carte** — NKONI n'est jamais dépositaire des fonds ni des instruments de paiement. |
| Identifiants PSP de l'organisation | Vie de la configuration | Chiffrés AES-256-GCM (AAD = id d'organisation), **jamais renvoyés au client**, jamais exportés. |

### 2.4 Données techniques et périssables

| Donnée | Durée cible | Application |
|---|---|---|
| `Notification` (in-app) | **12 mois** | ⚠️ **Pas encore outillé** — purge à ajouter au scheduler nocturne. Le membre peut déjà supprimer les siennes à l'unité. |
| `PushSubscription` | Jusqu'à révocation | ✅ **Automatique** — un abonnement mort (404/410 du service push) est purgé au premier envoi qui échoue. |
| `AuditLog` (tenant) | **24 mois** | ⚠️ **Pas encore outillé** — durée choisie pour couvrir deux exercices comptables. |
| `PlatformAuditLog` (super-admin) | **5 ans** | ⚠️ Pas encore outillé. Durée longue assumée : il trace les suspensions et **purges** d'organisations — c'est la seule preuve qu'une destruction a été demandée et par qui. Ne contient aucune PII de membre (snapshots : nom d'organisation, action, acteur). |
| Journaux d'infrastructure (Railway, Vercel) | Rétention du fournisseur | Hors de notre maîtrise ; ne contiennent pas de corps de requête (`sendDefaultPii: false` côté Sentry). |
| Rapports d'erreur (Sentry) | 90 j (plan) | `sendDefaultPii: false` des deux côtés : ni corps de requête, ni identifiants. |

### 2.5 Sauvegardes

| Donnée | Durée | Application |
|---|---|---|
| Dump chiffré hebdomadaire | **30 j** (artefact GitHub) + copie R2 | ✅ Automatique (`backup-restore-exercise.yml`). |
| Miroir des fichiers Blob | Synchronisé hebdomadairement | ✅ Automatique (`blob-mirror.yml`). |

> **Conséquence à assumer et à dire** : une donnée supprimée en production **survit jusqu'à 30 jours
> dans les sauvegardes chiffrées**. C'est inhérent à toute politique de sauvegarde sérieuse. Une
> demande d'effacement est honorée **en production immédiatement** ; les sauvegardes s'effacent par
> rotation. Ne pas promettre l'inverse.

---

## 3. Fin de vie d'une organisation (offboarding)

1. **Export** — l'organisation récupère ses données quand elle veut, sans nous :
   `GET /organisations/moi/export` (ADMIN/PRESIDENT), bouton sur `/parametres`. JSON de tous les
   modèles + manifeste des pièces jointes.
2. **Suspension** — l'accès est coupé, les données conservées. Réversible.
3. **Suppression définitive** — réservée au SUPER_ADMIN, sous **double verrou** : organisation
   **déjà suspendue** *et* saisie exacte du nom. Purge transactionnelle (ordre figé), puis blobs.
   Journalisée en **fail-closed** : pas de trace ⇒ pas de destruction.

**Délai de grâce recommandé : 30 jours** entre suspension et suppression — le temps qu'un dirigeant
sortant conteste ou récupère l'export. Aujourd'hui la suppression est manuelle : ce délai est une
**règle d'exploitation**, pas une contrainte technique.

---

## 4. Droits des personnes

| Droit | Comment il est exercé aujourd'hui |
|---|---|
| Accès / portabilité | Export JSON self-service par un dirigeant (ADMIN/PRESIDENT). |
| Rectification | Édition directe de la fiche membre par un dirigeant ; le membre modifie lui-même sa photo, son avatar, sa langue et ses préférences de notification. |
| Effacement | Photo et coordonnées : immédiat. Historique financier : **conservé** (intérêt légitime — preuve comptable), sauf suppression de toute l'organisation. |
| Opposition aux notifications | ✅ Self-service par type (`/mon-profil`) et par appareil pour le push. Respecté à la source : aucune notification n'est **créée** si le type est désactivé. |

---

## 5. Ce qui reste à outiller

Les trois durées marquées ⚠️ (`Notification` 12 mois, `AuditLog` 24 mois, `PlatformAuditLog` 5 ans)
sont **annoncées mais pas appliquées automatiquement**. Deux voies honnêtes :

- **soit** ajouter une purge au scheduler nocturne (`notification-scheduler.ts`, qui tourne déjà à
  03:00 par organisation) — quelques `deleteMany` bornés par date, à écrire **avec le même soin
  d'isolation que la purge d'organisation** : sous contexte org, jamais un `deleteMany({})` ;
- **soit** requalifier ces durées en « objectif » dans le texte public tant que l'automatisation
  n'existe pas.

**La seule option exclue est de publier ces durées comme des garanties sans les tenir.**

---

## 6. Révision

À relire à chaque : nouveau modèle portant des données personnelles, changement d'hébergeur ou de
sous-traitant, immatriculation de la société (les mentions légales de `/confidentialite` et `/cgu`
sont encore en placeholders volontaires), ou demande d'un client sur un point non couvert ici.
