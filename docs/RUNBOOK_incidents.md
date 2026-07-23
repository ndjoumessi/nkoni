# Runbook — Incidents & communication (GA 2.2)

Procédure d'exploitation pour le PO. Couvre la **détection**, la **qualification**, les **leviers de
confinement**, le **diagnostic par type de panne**, la **communication** aux utilisateurs, et le
**post-mortem**.

> **Un incident se gère avec des gestes déjà répétés, pas avec de l'improvisation à 23 h.** Le cœur
> de ce document n'est pas §3 (la boucle) mais **§4 (les leviers)** : la liste exhaustive de ce qu'on
> peut faire, ce que chaque geste coûte, et ce qu'il ne rattrape pas.

**Ce que ce runbook ne fait pas** : il ne met en place aucune automatisation (aucun code). Il ne
couvre pas la restauration de la base — c'est `RUNBOOK_sauvegardes_restauration.md`, appelé en §4.7
comme dernier recours. Les manques de l'outillage actuel sont inscrits en **§8** comme chantiers,
pas dissimulés.

---

## 0. ⚠️ État réel de la détection — à lire avant tout le reste

**Il n'y a aujourd'hui aucune alerte automatique en production.** Ce n'est pas une opinion, c'est
vérifiable :

| Dispositif | État constaté (2026-07-23) | Conséquence |
|---|---|---|
| Sentry backend (`SENTRY_DSN`) | **Non posé** sur Railway | Les 5xx, les échecs d'écriture d'audit et les échecs du scheduler ne remontent nulle part. `lib/env.ts` émet un warning au boot — dans les logs Railway, que personne ne lit. |
| Sentry frontend (`VITE_SENTRY_DSN`) | **Absent du build Vercel** | Une erreur de rendu laisse un écran blanc, silencieusement. |
| Sonde externe (uptime) | **Inexistante** | Personne ne sait que le service est tombé tant qu'un utilisateur n'écrit pas. |
| `/health` | Répond `{"status":"ok"}` **sans toucher la base** | Le backend peut répondre 200 avec Postgres à terre. La page `/statut` affiche alors « opérationnel » — un faux négatif visible du public. |

**Donc, aujourd'hui, la détection = un utilisateur se plaint.** Le délai de détection n'est pas
mesurable et peut valoir plusieurs jours (typiquement : une panne nocturne un week-end).

> **Les trois gestes qui changent cette situation sont en §8.** Tant qu'ils ne sont pas faits, tout
> engagement de disponibilité (cf. `SLA_disponibilite.md`) est **déclaratif et non mesuré** — c'est
> écrit noir sur blanc dans ce document.

---

## 1. Niveaux de gravité

Le niveau se décide sur **l'effet utilisateur**, jamais sur la cause technique. Une base corrompue
qui n'empêche personne de travailler n'est pas un P1 ; une page blanche sur `/login` en est un.

| Niveau | Définition | Exemples RÉELS sur ce produit | Réaction attendue |
|---|---|---|---|
| **P1 — critique** | Service inutilisable pour tous, **ou** perte/exposition de données | Backend qui ne démarre plus (`migrate deploy` en échec) · Postgres injoignable · login cassé pour tous · fuite cross-tenant · PII exposées publiquement | Immédiate. On contient AVANT de comprendre. |
| **P2 — majeur** | Une fonction importante est cassée, contournement pénible ou absent | Encaissement d'un versement en 500 · export PDF/Excel en échec · reçus non générés · relances nocturnes muettes plusieurs jours · un tenant seul bloqué | Sous 1 jour ouvré. |
| **P3 — mineur** | Gêne, contournement simple, pas d'argent ni de donnée en jeu | Libellé faux · colonne mal alignée · lenteur ponctuelle · traduction manquante | Traité dans le flux normal de développement. |

**Deux cas se traitent d'office en P1, quelle que soit leur ampleur apparente :**
- **toute suspicion de fuite cross-tenant** (une organisation voit les données d'une autre) — c'est
  l'invariant fondateur du produit ;
- **toute exposition de PII ou de données financières** hors des porteurs légitimes (lien public qui
  fuit des montants, export renvoyant un `passwordHash`, page publique qui affiche un téléphone).

Ces deux cas ont en plus une **obligation de notification** (RGPD, cf. §6.4) que les autres n'ont pas.

---

## 2. Rôles

L'exploitation est assurée par **une seule personne** (le PO). Ce runbook ne prétend pas le
contraire : il n'y a ni astreinte, ni rotation, ni second niveau.

| Rôle | Qui | Ce qu'il décide |
|---|---|---|
| **Responsable d'incident** | Le PO | Le niveau de gravité, l'activation de la maintenance, le rollback, la restauration, le contenu de la communication. |
| **Contact utilisateur** | Adresse de support publiée sur `/statut` | Reçoit les signalements. C'est aujourd'hui le **canal de détection principal** (cf. §0). |

**Conséquence assumée** : hors des heures d'éveil du PO, le délai de réaction est celui du sommeil.
Le SLA en tient compte explicitement plutôt que de promettre du 24/7 fictif.

---

## 3. La boucle d'incident

L'ordre compte. **Contenir vient avant diagnostiquer** — on arrête l'hémorragie, on comprend ensuite.
La tentation inverse (« je vais d'abord regarder les logs ») allonge l'exposition pour rien.

```
Détecter → Qualifier → CONTENIR → Diagnostiquer → Rétablir → Vérifier → Communiquer → Post-mortem
```

### 3.1 Détecter
Aujourd'hui : signalement utilisateur (cf. §0). Réflexe de premier niveau, en 30 secondes :

```bash
curl -s -o /dev/null -w "front  : %{http_code}\n" https://nkoni.vercel.app/
curl -s -o /dev/null -w "proxy  : %{http_code}\n" https://nkoni.vercel.app/api/health
curl -s https://nkoni-backend-production.up.railway.app/health   # backend en direct, hors proxy
```

> ⚠️ **Un `/health` à 200 ne prouve pas que le service fonctionne** — il ne touche pas la base. Pour
> savoir si Postgres répond, il faut exercer un vrai chemin applicatif (§3.4).

### 3.2 Qualifier
Poser le niveau (§1) et, surtout, répondre à trois questions **avant** de toucher quoi que ce soit :

1. **Combien de tenants sont touchés ?** Un seul → confinement ciblé (§4.4). Tous → confinement global.
2. **De la donnée est-elle en train d'être perdue ou exposée ?** Si oui, le confinement est
   prioritaire sur la disponibilité : mieux vaut une app coupée qu'une app qui fuit.
3. **Est-ce corrélé à un déploiement récent ?** C'est le cas le plus fréquent et le plus vite
   résolu — voir §4.1/§4.2.

```bash
railway deployment list | head -5        # un déploiement récent coïncide-t-il ?
git log --oneline -5                     # qu'est-ce qui est parti en dernier ?
```

### 3.3 Contenir
Choisir le levier le moins destructeur qui arrête l'effet (§4). **Noter l'heure UTC de chaque geste**
— le post-mortem et la mesure de disponibilité en dépendent, et la mémoire reconstruit faux.

### 3.4 Diagnostiquer
Catalogue de pannes en §5. Les trois sources, dans cet ordre :

```bash
railway status                    # affiche le « deployment ID » ACTIF
railway deployment list           # historique : SUCCESS / FAILED / SKIPPED / REMOVED
railway logs --deployment <id>    # logs de démarrage et d'exécution (dont `migrate deploy`)
railway logs --build <id>         # logs de BUILD — à utiliser si l'échec est antérieur au boot
```

> `railway status --json` n'expose **pas** de champ `deployment` : ne pas tenter d'extraire l'id par
> script, le lire dans la sortie texte de `railway status`.

Puis, si la base est suspectée — c'est le test que `/health` ne fait pas :

```bash
psql "$PROD_DATABASE_URL" -tAc 'SELECT 1;'                          # la base répond-elle ?
psql "$PROD_DATABASE_URL" -tAc 'SELECT count(*) FROM "Organisation";' # ... et sert-elle des données ?
```

### 3.5 Rétablir puis VÉRIFIER
Un rétablissement non vérifié n'en est pas un. Le contrôle minimal reprend celui de l'exercice de
restauration (`RUNBOOK_sauvegardes_restauration.md` §4.3) : le service doit répondre **sur un chemin
authentifié**, pas seulement sur `/health`.

```bash
# 1. Le front sert l'app
curl -s -o /dev/null -w "%{http_code}\n" https://nkoni.vercel.app/

# 2. Un login réel aboutit (champ `password`, cf. schéma de POST /auth/login)
curl -s -X POST https://nkoni.vercel.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<compte de contrôle>","password":"<mot de passe>"}' | head -c 120

# 3. Les invariants financiers tiennent (aucun écart attendu)
#    GET /tresorerie/reconciliation, avec le Bearer obtenu ci-dessus.
```

### 3.6 Communiquer
§6. **Y compris quand c'est réparé** : un incident silencieusement résolu laisse les utilisateurs
dans le doute et fait perdre plus de confiance que l'incident lui-même.

### 3.7 Post-mortem
§7, obligatoire pour tout P1.

---

## 4. Leviers de confinement

Du moins destructeur au plus destructeur. **Toujours essayer dans cet ordre** — le premier levier qui
arrête l'effet est le bon.

### 4.1 Rollback backend (Railway)
Le plus fréquent et le plus sûr : le déploiement précédent est intact.

> ⚠️ **Le CLI Railway ne sait pas revenir à un déploiement ANTÉRIEUR.** `railway redeploy` redéploie
> **le dernier** déploiement du service (aucun argument positionnel) : c'est utile pour rejouer un
> déploiement échoué, **pas** pour rollback. Il n'existe pas de `railway rollback`.

Deux voies réelles, par ordre de préférence :

```bash
# A. git revert — la voie à privilégier : traçable, relue, et le rollback part du dépôt
railway deployment list                 # repérer le dernier SUCCESS d'AVANT l'incident
git revert --no-edit <sha-fautif>       # sur une branche, puis merge --no-ff (convention du dépôt)
git push                                # déclenche un déploiement propre

# B. dashboard Railway → service `nkoni` → Deployments → le déploiement visé → Redeploy
#    Plus rapide, mais l'état du dépôt ne correspond plus à ce qui tourne : à ne faire qu'en
#    urgence, et à régulariser par un revert dans la foulée.
```

> ⚠️ **Un rollback de code NE rollback PAS les migrations.** `migrate deploy` a déjà tourné : le
> schéma reste celui de la version fautive. Un rollback n'est donc sûr que si la migration est
> **additive** (colonne nullable, table ajoutée, index). Si elle est **destructive** (DROP, NOT NULL,
> changement de type), le code précédent peut ne plus correspondre au schéma → §4.7.

**Cas particulier — le boot est déjà bloqué** : `startCommand` est `migrate deploy && npm run start`,
donc si la migration échoue, `start` ne tourne pas, le healthcheck échoue, le déploiement passe
`FAILED` et **Railway continue de servir le dernier déploiement réussi**. Le service est alors encore
debout : ce n'est pas un P1, c'est un déploiement à corriger sans précipitation.

### 4.2 Rollback frontend (Vercel)
```bash
cd frontend
vercel ls                                # repérer le déploiement Ready d'avant l'incident
vercel rollback <url-ou-deploymentId>    # revient au déploiement visé
# `vercel promote <url>` fait la même bascule ; `rollback` dit mieux l'intention.
```
Sans effet sur la base. Aucun risque. C'est le levier à privilégier si le symptôme est visuel.

### 4.3 Page de maintenance (front)
Quand il faut **arrêter les écritures** le temps d'intervenir. Procédure complète et copiable :
`frontend/MAINTENANCE.md` (un bloc `redirect` dans `vercel.json`, aucune modification de `src/`).

Elle laisse `/api/*` intact **par conception** : le proxy et le cookie de refresh continuent de
fonctionner, ce qui permet d'exercer l'API pendant que le public voit la page de maintenance.

> ⚠️ **La PWA sert du contenu en cache.** Un utilisateur déjà chargé peut continuer à voir l'app et à
> écrire dans sa file hors-ligne (IndexedDB) pendant la maintenance. Ces écritures **partiront au
> rétablissement** ; les clés d'idempotence évitent les doublons, mais ne pas conclure d'une page de
> maintenance affichée que plus rien n'écrit.

### 4.4 Suspendre UN tenant
Quand l'incident est circonscrit à une organisation (corruption de ses données, abus, litige) :

```
POST /platform/organisations/:id/suspendre     (SUPER_ADMIN)
POST /platform/organisations/:id/reactiver
```

Coupe login et refresh pour cet espace et **exclut l'organisation du balayage du scheduler**. C'est
aussi la précondition technique d'un export/purge — cf. CLAUDE.md, §Export & suppression.

> ⚠️ **Un access token déjà émis survit à la suspension** : `authenticate` ne relit pas la base.
> Exposition bornée au TTL de 15 minutes. Si l'urgence ne tolère pas 15 minutes, §4.5.

### 4.5 Révoquer les sessions
En cas de compromission d'identifiants. Deux portées :

- **Un utilisateur** — réinitialiser son mot de passe (admin) ou le lui faire changer : cela
  **incrémente `sessionEpoch`**, et toutes ses autres sessions tombent au prochain refresh (≤ 15 min).
- **Une chaîne compromise** — la rotation des refresh tokens détecte le rejeu : un token révoqué
  rejoué révoque **toute la famille**. Automatique, rien à faire.

> Il n'existe **pas** de bouton « déconnecter tout le monde ». La déconnexion de masse s'obtient en
> incrémentant `sessionEpoch` sur les comptes visés (SQL direct, à n'utiliser que sur incident) :
> ```sql
> UPDATE "Utilisateur" SET "sessionEpoch" = "sessionEpoch" + 1 WHERE "organisationId" = '<uuid>';
> ```
> Effet : tous les refresh de ces comptes échouent en 401 dès la prochaine rotation. Les access
> tokens en cours restent valides jusqu'à 15 minutes.

### 4.6 Révoquer les liens publics signés
Les reçus PDF publics et les cartes de statut sont servis par des liens **HMAC sans expiration**,
déjà partis sur WhatsApp ou imprimés en QR. Retirer un bouton ne reprend rien.

**Le seul geste qui révoque réellement : changer `RECU_LINK_SECRET` sur Railway.** Il invalide
**tous** les liens publics d'un coup, sans toucher aux sessions (c'est précisément pourquoi ce secret
doit rester distinct de `JWT_ACCESS_SECRET`, dont le repli n'existe que par commodité de démarrage).

> Coût : les QR de cartes déjà imprimés cessent de fonctionner. C'est un geste de sécurité, pas de
> confort — à réserver à une fuite avérée de liens.

### 4.7 Restaurer la base — dernier recours
Procédure complète : `RUNBOOK_sauvegardes_restauration.md`. **RPO 24 h** (on perd au pire une journée
de saisies), **RTO 4 h**.

> ⚠️ **La décision de restaurer est irréversible pour les données saisies depuis le dump.** Elle ne
> se prend que sur corruption ou perte avérée, jamais sur une simple indisponibilité — un service
> lent ou muet se répare, il ne se restaure pas.

---

## 5. Catalogue de pannes

| Symptôme | Cause probable | Diagnostic | Geste |
|---|---|---|---|
| App inaccessible, `/api/health` KO | Backend à terre ou déploiement échoué | `railway deployment list` · `railway status` | §4.1 rollback. Si `FAILED`, le service précédent tourne encore : corriger sans panique. |
| `/health` 200 mais tout échoue en 500 | Postgres injoignable ou saturée | `psql "$PROD_DATABASE_URL" -tAc 'SELECT 1;'` · Railway → Postgres → Metrics | Vérifier le service Postgres Railway. Si la base est perdue → §4.7. |
| Déploiement `FAILED` au boot | `migrate deploy` en échec (migration invalide, `DATABASE_URL` cassée → `P1000`) | `railway logs --deployment <id>` | Corriger la migration et redéployer. Le service **reste debout** sur l'ancienne version. |
| Déploiement `SKIPPED` | Watch path `/backend/**` : le push ne touchait que `frontend/` | — | **Normal, ce n'est pas un incident.** Vérifier Vercel à la place. |
| Écran blanc côté front | Erreur de rendu React (pas d'`ErrorBoundary`) | Console du navigateur | §4.2 rollback Vercel. Sans `VITE_SENTRY_DSN`, aucune alerte n'existe (§0). |
| Un seul tenant en erreur | Donnée incohérente propre à l'organisation | `GET /tresorerie/reconciliation` sur ce tenant | §4.4 suspendre le temps de corriger. |
| Reçus/relances non envoyés | Canal non configuré ou en panne | Variables `RESEND_*` / `WHATSAPP_*` sur Railway | **Best-effort par conception** : l'envoi n'échoue jamais l'opération métier. P2, pas P1 — l'argent est encaissé, la preuve est régénérable. |
| Relances nocturnes muettes | Scheduler in-process : le process était down à 03:00 (Africa/Douala) | `railway logs` autour de 03:00 | Aucun rattrapage automatique. Les retards seront générés la nuit suivante. |
| Tout le monde en 429 | Rate-limit keyé sur l'IP du proxy | Vérifier que `trustProxy: true` est bien actif | Sans lui, **un seul seau pour tous** → lockout global. Rollback si une régression l'a retiré. |
| PDF illisible / reçu manquant | Blob Vercel indisponible | Réessayer le téléchargement | Les **reçus se régénèrent** depuis la base. **Photos et documents non** : téléversements, perte définitive. |
| Une org voit les données d'une autre | Rupture d'isolation tenant | **P1 immédiat** | Maintenance (§4.3) sans attendre le diagnostic, puis §6.4 notification. |

---

## 6. Communication

### 6.1 Canaux réels
| Canal | Ce qu'il vaut | Limite dure |
|---|---|---|
| **Page `/statut`** | Publique, sans compte, atteignable même app coupée (hébergée sur Vercel, indépendante de Railway) | **Automatique uniquement** : elle sonde `/health` et n'a **aucun moyen de publier un message d'incident**. On ne peut pas y écrire « intervention en cours jusqu'à 14 h ». Cf. §8. |
| **Email (Resend)** | Configuré et opérationnel (`RESEND_API_KEY`/`RESEND_FROM` posés) | Aucun envoi groupé outillé : c'est un envoi à la main aux dirigeants concernés. |
| **WhatsApp** | — | **Non configuré en production** (`WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID` absents). Ne pas compter dessus en incident. |
| **Adresse de support** | Publiée sur `/statut` | Canal entrant, pas sortant. |

### 6.2 Quand communiquer
| Situation | Communication |
|---|---|
| P1 en cours | Dès la **qualification**, avant d'avoir compris. Un « nous avons identifié une panne, nous travaillons dessus » vaut mieux qu'un silence de deux heures. |
| P1 résolu | **Toujours**, même si personne ne s'est plaint. |
| P2 | Aux tenants concernés seulement, quand un contournement existe ou quand c'est réparé. |
| P3 | Pas de communication dédiée. |
| Maintenance planifiée | **48 h à l'avance**, par email aux dirigeants. |
| Fuite de données | §6.4 — régime distinct et contraint. |

### 6.3 Modèles de message

**Incident en cours (email aux dirigeants) — FR**
> Objet : NKONI — incident en cours
>
> Bonjour,
>
> Le service NKONI rencontre depuis {{heure}} un incident qui {{effet concret : empêche la connexion /
> empêche l'enregistrement des versements}}. Nous travaillons à le rétablir.
>
> **Vos données ne sont pas affectées** — {{à n'écrire que si c'est établi ; sinon supprimer cette
> ligne plutôt que de rassurer à tort}}.
>
> Nous vous tiendrons informés dès le rétablissement. L'état du service est consultable à tout moment
> sur https://nkoni.vercel.app/statut
>
> L'équipe NKONI

**Rétablissement — FR**
> Objet : NKONI — service rétabli
>
> Bonjour,
>
> L'incident signalé {{date}} est résolu depuis {{heure}}. Le service fonctionne normalement.
>
> **Ce qui s'est passé** : {{une phrase, sans jargon}}.
> **Ce que vous devez vérifier** : {{action concrète, ou « rien »}}.
> **Ce que nous changeons** : {{la mesure de fond retenue au post-mortem}}.
>
> Nous restons disponibles à {{adresse de support}}.
>
> L'équipe NKONI

**Incident (EN)**
> Subject: NKONI — service incident
>
> Hello,
>
> NKONI has been experiencing an incident since {{time}} which {{concrete effect}}. We are working to
> restore the service. Live status: https://nkoni.vercel.app/statut
>
> The NKONI team

> **Règle de rédaction** : dire l'**effet** (« impossible d'enregistrer un versement »), jamais la
> cause technique (« timeout Prisma sur le pool »). Ne jamais écrire « vos données sont intactes »
> avant de l'avoir vérifié — une rétractation coûte infiniment plus cher que le silence.

### 6.4 Fuite de données — régime particulier
Toute exposition de données personnelles (PII des membres, données financières, `passwordHash`)
déclenche, **en plus** de la boucle normale :

1. **Geler l'exposition** immédiatement (§4.3, §4.4, §4.6 selon le vecteur) ;
2. **Établir le périmètre** : quelles organisations, quelles personnes, quelles données, sur quelle
   fenêtre de temps. L'`AuditLog` per-tenant est la source ;
3. **Notifier les dirigeants des tenants concernés** sans délai, en nommant les données exposées ;
4. **Documenter** : la purge et les incidents plateforme n'étant tracés nulle part en base (dette
   assumée), la trace écrite hors base est la seule qui existera.

> Le RGPD impose une notification à l'autorité de contrôle sous **72 h** en cas de violation
> susceptible d'engendrer un risque pour les personnes. Ce runbook ne remplace pas un avis juridique :
> en cas de fuite avérée, faire relire la qualification.

---

## 7. Post-mortem

**Obligatoire pour tout P1**, dans les 5 jours. Sans blâme : on cherche ce qui a rendu l'erreur
possible, pas qui l'a commise.

```markdown
## Incident {{AAAA-MM-JJ}} — {{titre court}}

- **Gravité** : P{{1|2}}
- **Détecté à** : {{heure UTC}} — **par** : {{utilisateur / sonde / hasard}}
- **Contenu à** : {{heure}} — **Rétabli à** : {{heure}}
- **Durée d'indisponibilité** : {{minutes}} (à reporter dans le registre du SLA)
- **Tenants touchés** : {{nombre / tous}}

### Ce qui s'est passé
{{Chronologie factuelle, heures UTC.}}

### Pourquoi c'est arrivé
{{Cause racine. Creuser jusqu'à ce que la réponse ne soit plus « quelqu'un a oublié ».}}

### Pourquoi ça n'a pas été vu plus tôt
{{Le délai de détection est une cause à part entière — souvent la plus coûteuse.}}

### Ce qui a bien fonctionné
{{Les garde-fous qui ont joué. À nommer : ils méritent d'être préservés.}}

### Actions
| Action | Type | Échéance |
|---|---|---|
| {{…}} | prévention / détection / atténuation | {{date}} |
```

> Une action de **détection** vaut souvent mieux qu'une action de prévention : on ne préviendra pas
> toutes les pannes, on peut les voir toutes.

---

## 8. Prérequis manquants — à mettre en place

Ces trois chantiers conditionnent la crédibilité de tout le reste. Sans eux, ce runbook décrit une
réaction sans déclencheur.

| # | Chantier | Pourquoi c'est bloquant | Effort |
|---|---|---|---|
| **8.1** | **Poser `SENTRY_DSN` (Railway) et `VITE_SENTRY_DSN` (Vercel)** — projets **distincts**, un DSN front étant public par nature | Le code d'alerte existe, est testé et câblé sur les 5xx, l'échec d'audit et l'échec du scheduler. Il ne manque que la variable. **C'est le meilleur rapport effort/gain de toute cette liste.** | Minutes |
| **8.2** | **Sonde externe** sur `https://nkoni.vercel.app/api/health`, toutes les 5 min, alerte email | Sans sonde, la disponibilité n'est **pas mesurable** — donc le SLA n'est pas vérifiable, et une panne nocturne dure jusqu'au matin. | ~1 h |
| **8.3** | **Faire de `/health` un vrai healthcheck** — y ajouter un `SELECT 1` sur la base | Aujourd'hui il répond 200 avec Postgres à terre : la page `/statut` publie alors un « opérationnel » **faux**, ce qui est pire que pas de page du tout. Attention : le healthcheck Railway s'appuie dessus — un `/health` qui échoue sur base absente peut empêcher un boot légitime. Prévoir un code distinct (200 dégradé vs 503). | ~2 h |

Chantiers de second rang, à inscrire après les trois précédents :

- **Bandeau d'incident sur `/statut`** — aujourd'hui la page ne sait qu'afficher un état sondé
  automatiquement ; on ne peut y publier ni message, ni fenêtre de maintenance, ni historique. Une
  variable d'environnement Vercel lue au build suffirait pour une v1 (pas de base, pas de CMS).
- **`ErrorBoundary` React** — une erreur de rendu laisse un écran blanc muet.
- **Automatiser la sauvegarde quotidienne** — le RPO de 24 h suppose aujourd'hui que le PO lance le
  dump à la main, tous les jours.
- **Table `PlatformAuditLog` non scopée** — les actions plateforme (suspension, purge) ne laissent
  aucune trace en base.

---

## 9. Journal des incidents

Une ligne par incident P1/P2. C'est ce registre qui alimente la mesure de disponibilité du
`SLA_disponibilite.md` — sans lui, le taux annoncé n'est qu'une impression.

| Date | Niveau | Effet utilisateur | Durée | Cause racine | Post-mortem |
|---|---|---|---|---|---|
| _(aucun incident enregistré à ce jour)_ | | | | | |

---

## 10. Critères d'arrêt — récapitulatif

- **Ne jamais restaurer** sur une simple indisponibilité — seulement sur perte ou corruption avérée.
- **Ne jamais annoncer « vos données sont intactes »** avant de l'avoir vérifié.
- **Ne jamais rollback** un déploiement dont la migration est destructive sans avoir vérifié la
  compatibilité du schéma avec le code précédent.
- **Ne jamais conclure d'un `/health` à 200** que le service fonctionne (§0).
- **Toujours noter les heures UTC** au fil de l'incident, pas de mémoire après coup.
