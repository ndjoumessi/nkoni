# RUNBOOK — Rotation des secrets

Chantier **1.4** de [`roadmap-v1-vers-GA.md`](roadmap-v1-vers-GA.md) (« rotation documentée des
secrets »). Complète [`RUNBOOK_incidents.md`](RUNBOOK_incidents.md) (leviers de confinement §4.5 à §4.8)
et [`SECRETS_GITHUB_SETUP.md`](SECRETS_GITHUB_SETUP.md) (secrets du workflow de sauvegarde).

**Le PO exécute les commandes de production.** Ce document dit, secret par secret : où il vit, ce
que sa rotation casse, dans quel ordre la faire et comment vérifier qu'elle a pris.

---

## 0. Règles communes

1. **Aucune valeur ne transite par un chat, un ticket, un commit ou un message.** Générer localement,
   coller directement dans le tableau de bord (Railway / Vercel / GitHub), conserver dans le
   gestionnaire de mots de passe.
2. **Générer** : `openssl rand -base64 32` (32 octets) pour tout secret qu'on choisit soi-même.
   Préférer la saisie au tableau de bord Railway à `railway variables --set …`, qui laisse la valeur
   dans l'historique du shell.
3. **Une variable Railway modifiée ne redéploie pas toujours** : le watch path `/backend/**` peut
   marquer le déploiement `SKIPPED`. Après chaque changement : `railway redeploy`, puis vérifier le
   statut réel (`railway deployment list` → `SUCCESS`, cf. `CLAUDE.md` § Déploiement).
4. **Vérification minimale après toute rotation backend** :
   - `railway deployment list` : le dernier déploiement est `SUCCESS` ;
   - `railway logs --deployment <id> | grep -F "[env]"` : aucun avertissement de configuration ;
   - `https://nkoni.vercel.app/api/ready` → 200 ;
   - le contrôle fonctionnel propre au secret (tableaux ci-dessous).
5. **Journaliser** chaque rotation en §6 : date, secret, motif, auteur — **jamais la valeur**.
6. **Pas de rollback par le tableau de bord pendant ou après une rotation.** Sur Railway, « Redeploy »
   d'un ancien déploiement restaure **son image ET ses variables** : revenir à un déploiement antérieur
   à la rotation remet l'**ancienne** valeur du secret — sans alerte. Pour `PSP_ENCRYPTION_KEY`, cela
   rend illisibles toutes les configurations déjà rechiffrées. Après une rotation, un rollback passe par
   `git revert` (`RUNBOOK_incidents.md` §4.1, voie A), ou les variables sont reposées juste après.
7. **Rotation d'urgence** (fuite avérée ou suspectée, départ d'une personne ayant eu accès) : tout
   secret exposé est tourné **le jour même**, en commençant par ceux qui donnent accès à des données
   (`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `PSP_ENCRYPTION_KEY`, `JWT_REFRESH_SECRET`).

---

## 1. Inventaire

### 1.1 Railway — service `nkoni` (projet `nkoni`)

| Variable | Nature | Effet d'une rotation | Planifiée ? |
|---|---|---|---|
| `DATABASE_URL` | Référence `${{ Postgres.DATABASE_URL }}` | Aucun côté backend (la référence suit) ; **le secret GitHub `DATABASE_URL` doit être reposé** | Sur incident |
| `JWT_ACCESS_SECRET` | Secret | Jetons d'accès invalides ; le front se rafraîchit seul (refresh-on-401) → **invisible** | Annuelle |
| `JWT_REFRESH_SECRET` | Secret | **Tout le monde est déconnecté** au prochain rafraîchissement (≤ 15 min) | Annuelle ou incident |
| `RECU_LINK_SECRET` | Secret | **Tous les liens publics de reçus ET les QR des cartes imprimées cessent de fonctionner** (404) | **Jamais en routine** — fuite de liens seulement |
| `PSP_ENCRYPTION_KEY` | Clé maître AES-256 | Sans procédure : **configurations de paiement illisibles** pour toutes les organisations | Sur incident — **procédure §3** |
| `BLOB_READ_WRITE_TOKEN` | Jeton Vercel Blob | Uploads et lectures en échec tant que Railway **et** GitHub ne sont pas à jour | Sur incident |
| `RESEND_API_KEY` | Clé API | Repli e-mail muet tant que la nouvelle clé n'est pas posée | Annuelle |
| `WHATSAPP_TOKEN` | Jeton Meta | Canal WhatsApp muet tant que le nouveau jeton n'est pas posé | Selon expiration Meta |
| `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` | Paire de clés | **Tous les abonnements push existants deviennent inutilisables** ; chaque appareil doit réactiver le push | **Jamais en routine** |
| `PSP_ENCRYPTION_KEY_PRECEDENTE` | Clé maître précédente | **Temporaire** : posée seulement pendant une rotation (§3), à retirer ensuite — un avertissement `[env]` le rappelle à chaque démarrage | — |
| `SENTRY_DSN` | Identifiant d'envoi (peu sensible) | Aucun, si la nouvelle clé client est créée avant la désactivation de l'ancienne | Sur abus (spam d'événements) |

Configuration **non secrète** (aucune rotation) : `NODE_ENV`, `CORS_ORIGIN`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, `REFRESH_COOKIE_NAME`, `REFRESH_COOKIE_PATH`, `PUBLIC_BASE_URL`,
`PAIEMENT_MONTANT_MIN`, `RESEND_FROM`, `WHATSAPP_PHONE_ID`, `VAPID_SUBJECT`. Réservées au lancement de
scripts, jamais posées en production : `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`,
`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`.

### 1.2 GitHub Actions (dépôt)

| Secret | Utilisé par | Effet d'une rotation |
|---|---|---|
| `DATABASE_URL` | Sauvegarde hebdo (URL **publique**, utilisateur `postgres`) | Sauvegarde en échec si périmé → issue d'alerte |
| `GPG_PASSPHRASE_BACKUP` | Chiffrement des dumps | Les dumps déjà produits restent chiffrés avec l'**ancienne** |
| `BLOB_READ_WRITE_TOKEN` | Miroir hebdo des blobs vers R2 | Miroir en échec si périmé |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Copie hors-site | Copie en échec (fail-closed → issue d'alerte) |

Procédures GitHub détaillées : [`SECRETS_GITHUB_SETUP.md`](SECRETS_GITHUB_SETUP.md) § Rotation.

### 1.3 Vercel — projet `nkoni`

`VITE_SENTRY_DSN` : **public par nature** (présent dans le bundle). Rotation seulement sur abus :
nouvelle clé client dans le projet Sentry `nkoni-web`, poser la variable, redéployer, désactiver
l'ancienne.

### 1.4 Comptes humains

Mot de passe du SUPER_ADMIN et des comptes d'organisation : changés **dans l'application**
(« Mon profil »). Le changement incrémente `sessionEpoch` et coupe les autres sessions du compte
(`RUNBOOK_incidents.md` §4.5). `SUPERADMIN_PASSWORD` ne sert qu'au bootstrap : le modifier sur une
machine ne change rien au compte existant.

---

## 2. Secrets à rotation simple

### `JWT_ACCESS_SECRET`
1. Vérifier que `RECU_LINK_SECRET` est **posé** sur Railway (aucun avertissement `[env]` au dernier
   démarrage). S'il manque, les liens publics signés utilisent `JWT_ACCESS_SECRET` en repli : tourner ce
   dernier casserait tous les liens de reçus et les QR des cartes. Dans ce cas, poser d'abord un
   `RECU_LINK_SECRET` égal à l'**actuel** `JWT_ACCESS_SECRET` (les liens restent valides), redéployer,
   puis seulement tourner `JWT_ACCESS_SECRET`.
2. Poser la nouvelle valeur, `railway redeploy`.
3. Contrôle : se connecter, naviguer 20 minutes (au-delà du TTL de 15 min) sans être déconnecté.

### `JWT_REFRESH_SECRET`
1. Prévenir les utilisateurs si c'est planifié (« reconnexion nécessaire »).
2. Poser, `railway redeploy`.
3. Contrôle : une session ouverte avant la rotation est renvoyée à la connexion ; une nouvelle
   connexion fonctionne et survit à un rechargement de page.
4. Les lignes `RefreshToken` émises avant la rotation deviennent inutilisables : aucun nettoyage requis.

### `RECU_LINK_SECRET`
Levier de **révocation**, pas d'hygiène : voir `RUNBOOK_incidents.md` §4.6. Coût : QR des cartes
imprimées et liens de reçus déjà envoyés morts. Après la rotation, les écrans authentifiés produisent
de nouveaux liens ; les cartes doivent être réimprimées.

### `BLOB_READ_WRITE_TOKEN`
Procédure et symptômes : `RUNBOOK_incidents.md` §4.8. Mettre à jour **dans la même séance** Railway
(`railway redeploy`) **et** le secret GitHub (miroir R2), puis lancer le workflow `blob-mirror.yml` à la
main pour vérifier. Contrôle applicatif : afficher une photo de membre et télécharger un document.

### `RESEND_API_KEY`
1. Resend → API Keys : créer la nouvelle clé (droit « Sending access » suffit).
2. Poser, `railway redeploy`.
3. Contrôle : envoyer un reçu à un membre **fictif** sans téléphone (repli e-mail).
4. **Révoquer l'ancienne clé** dans Resend.

### `WHATSAPP_TOKEN`
Même schéma : nouveau jeton système Meta, poser, redéployer, envoyer un reçu à un numéro de test,
révoquer l'ancien.

### `SENTRY_DSN`
Sentry → projet `nkoni-api` → Client Keys : créer une clé, poser le DSN, redéployer, vérifier qu'un
événement de test arrive, **puis** désactiver l'ancienne clé.

### `DATABASE_URL`
Tourner le mot de passe Postgres depuis le service Postgres de Railway : la référence du backend suit.
**Reposer immédiatement le secret GitHub** avec la commande de `SECRETS_GITHUB_SETUP.md` §1, puis lancer
le workflow de sauvegarde à la main (un secret périmé ne se verrait que dimanche). Contrôle :
`/api/ready` → 200 et run de sauvegarde vert.

### `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY`
Seulement si la clé privée a fuité. Générer une paire (`npx web-push generate-vapid-keys`), poser les
deux, redéployer. Les abonnements existants échouent ensuite à l'envoi (erreur signalée à Sentry, pas
une purge automatique) : prévenir les utilisateurs de désactiver puis réactiver les notifications push
dans « Mon profil ». Le nettoyage des abonnements morts est une décision du PO, en SQL, après
vérification.

---

## 3. `PSP_ENCRYPTION_KEY` — rotation avec rechiffrement

Les identifiants de prestataire de paiement de chaque organisation sont chiffrés en base avec cette clé
(AES-256-GCM, lié à l'organisation). Changer la clé sans procédure rend **toutes** les configurations
illisibles : paiements impossibles à démarrer et à confirmer jusqu'à ce que chaque bureau ressaisisse
ses identifiants.

Le backend accepte, **pendant la bascule**, une clé précédente : il chiffre avec
`PSP_ENCRYPTION_KEY` et déchiffre avec `PSP_ENCRYPTION_KEY` puis `PSP_ENCRYPTION_KEY_PRECEDENTE`
(`backend/src/lib/crypto-secret.ts`). Le script `prisma/rechiffrer-secrets-psp.ts` réécrit ensuite
chaque configuration sous la nouvelle clé.

**Prérequis** : le déploiement actif contient ce mécanisme (`railway status` : déploiement postérieur à
l'ajout de `PSP_ENCRYPTION_KEY_PRECEDENTE`), et le poste qui lance le script est sur le **même commit**
que la production, avec son client Prisma généré (`npx prisma generate`).

**Si la rotation fait suite à une fuite** : pendant la fenêtre de bascule, un secret chiffré avec
l'ancienne clé est accepté puis rechiffré. Un tiers qui aurait eu la clé ET un accès en écriture à la
base pourrait y avoir déposé ses propres identifiants. Garder la fenêtre courte, et faire confirmer à
chaque bureau, après l'étape 6, l'identifiant affiché dans Paramètres.

1. **Générer** la nouvelle clé : `openssl rand -base64 32`. La ranger dans le gestionnaire de mots de
   passe **à côté de l'ancienne**.
2. **Railway** : `PSP_ENCRYPTION_KEY_PRECEDENTE` = l'**ancienne** valeur, `PSP_ENCRYPTION_KEY` = la
   **nouvelle**. Enregistrer les deux dans la même modification, `railway redeploy`.
3. **Contrôle** :
   - logs de démarrage : l'avertissement `[env] … rotation de clé EN COURS` est présent, **aucun**
     avertissement « doit décoder en 32 octets » ;
   - sur une organisation qui a une configuration de paiement, Paramètres affiche le badge
     **Environnement** et l'**identifiant masqué**, et non « — » (c'est la seule lecture qui déchiffre :
     le bouton « Payer » s'affiche même quand le déchiffrement échoue).
4. **Dry-run** du rechiffrement, depuis `backend/`, sans jamais coller l'URL de la base (elle resterait
   dans l'historique du shell) :
   ```bash
   railway run --service nkoni -- sh -c 'DATABASE_URL="$(railway variables --service Postgres --kv | grep "^DATABASE_PUBLIC_URL=" | cut -d= -f2-)" npm run rechiffrer:psp'
   ```
   Attendu au premier passage : `À rechiffrer` = nombre d'organisations ayant une configuration de
   paiement, `Illisibles : 0`, code de sortie 0. Aucune valeur n'est affichée.
   - « `PSP_ENCRYPTION_KEY_PRECEDENTE` absente » (sortie 1) : mauvais service ou variable non posée.
   - « Toutes les configurations sont déjà sous la clé courante » au premier passage : les deux
     variables sont probablement **inversées** — corriger avant d'aller plus loin.
5. **Application** : même commande, en terminant par `npm run rechiffrer:psp -- --apply`. Code de sortie
   0 = terminé ; 2 = une organisation a modifié sa configuration pendant le script (relancer le
   dry-run) ; 1 = erreur ou configuration illisible.
   Le rechiffrement met à jour la date « dernière mise à jour » affichée au bureau dans Paramètres.
6. **Relancer le dry-run** : `Déjà sous la clé courante` = total, `À rechiffrer : 0`.
7. **Retirer** `PSP_ENCRYPTION_KEY_PRECEDENTE` de Railway, `railway redeploy` ; refaire le contrôle du
   point 3 (cette fois **sans** l'avertissement de rotation).
8. **Conserver l'ancienne clé**, marquée « ne plus poser en production », aussi longtemps qu'existe un
   dump chiffré qui contient des configurations sous cette clé (rétention des sauvegardes :
   `RUNBOOK_sauvegardes_restauration.md` §2.3, jusqu'à 12 mois). Restaurer un tel dump exige de la
   reposer temporairement en `PSP_ENCRYPTION_KEY_PRECEDENTE` puis de relancer le script.

**Organisation « illisible »** (clé perdue, donnée corrompue) : le script sort en erreur et la liste.
Ne pas retirer la clé précédente ; demander au bureau concerné de ressaisir ses identifiants dans
Paramètres, puis relancer le dry-run.

---

## 4. `GPG_PASSPHRASE_BACKUP`

Procédure : `SECRETS_GITHUB_SETUP.md` § Rotation. Point à ne pas manquer : les dumps déjà produits
(artefacts GitHub 30 jours, copies R2 selon la règle de cycle de vie du bucket, rétention 7/4/12 de
`RUNBOOK_sauvegardes_restauration.md` §2.3) restent chiffrés avec l'**ancienne** passphrase. La
conserver jusqu'à expiration du plus ancien dump qui en dépend, avec sa date de fin d'usage. Après la
rotation, lancer le workflow à la main : le job `restore-verify` prouve que la nouvelle passphrase
chiffre et déchiffre.

---

## 5. Calendrier recommandé

| Fréquence | Secrets |
|---|---|
| **Immédiate** | Tout secret exposé ; départ d'une personne ayant eu accès aux tableaux de bord |
| **Annuelle** | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (prévenir : reconnexion), `RESEND_API_KEY`, jeton R2, `GPG_PASSPHRASE_BACKUP` |
| **À expiration fournisseur** | `WHATSAPP_TOKEN`, jeton R2 s'il porte une date d'expiration |
| **Jamais en routine** | `RECU_LINK_SECRET` (QR imprimés), paire VAPID (abonnements push), `PSP_ENCRYPTION_KEY` (procédure lourde, réservée à l'incident) |

---

## 6. Journal des rotations

| Date | Secret | Motif | Par | Vérifié |
|---|---|---|---|---|
| — | — | — | — | — |
