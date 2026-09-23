# Performance et montée en charge (roadmap 2.4)

**Date des mesures** : 2026-09-19. **Outil** : `npm run charge` (`backend/perf/`). **Garde permanent** :
`backend/tests/n-plus-un.integration.test.ts` (CI).

## 1. Ce qui a été mesuré, et comment

| Question | Méthode |
|---|---|
| Une route fait-elle une requête par ligne (N+1) ? | Extension Prisma de COMPTAGE posée par-dessus le client réel (isolation tenant incluse). Chaque route est appelée une fois dans des organisations de 100, 1 000 et 3 000 membres ; le nombre d'opérations doit être identique. |
| Combien coûte une route selon la taille de l'organisation ? | Serveur HTTP réel + `autocannon`, rate-limit neutralisé. Une connexion (temps de service) puis dix connexions (saturation). |
| Une route lourde fige-t-elle le serveur pour les autres ? | Sonde `/health` toutes les 20 ms pendant un export de l'organisation de 3 000 membres. |
| Les budgets de rate-limit tiennent-ils un usage réel ? | Nombre d'appels API par écran, mesuré dans le navigateur sur l'espace de démonstration de production, puis rate-limit ACTIF depuis une seule IP avec plusieurs comptes. |

**Jeu de données** (`perf/jeu-de-charge.ts`) : fictif, déterministe, sur une base JETABLE seulement
(le script refuse une base dont le nom ne contient ni `_it_`, ni `test`, ni `perf`). Il simule une
association après dix ans d'usage : adhésions réparties sur la décennie, 6 % d'inactifs, 2 % de
décès, 55 % d'années soldées, 25 % partielles, 20 % impayées, et 1 à 3 versements par année payée.
À 3 000 membres, cela fait **15 973 contributions et 25 475 versements**.

```bash
cd backend
DATABASE_URL=postgresql://<vous>@localhost:5432/nkoni_it_demo npm run charge -- --tailles 100,1000,3000 --duree 5 --connexions 1
```

**Portée des chiffres** : un seul processus Node, Postgres local, sur un portable Apple Silicon. Un
conteneur Railway est plus lent : **compter un facteur 2 à 3**. Ce sont les ORDRES DE GRANDEUR et les
PENTES qui comptent, pas la milliseconde.

## 2. Résultats

### 2.1 Aucun N+1 — et un garde pour que ça dure

Les 15 routes lourdes font **le même nombre d'opérations Prisma à 100, 1 000 et 3 000 membres** : 12
pour le tableau de bord, 1 à 4 pour les autres. Chaque route fait donc un nombre FIXE de lectures,
lancées en parallèle, et calcule en mémoire.

Ce constat devient un **garde exécuté en CI** : `n-plus-un.integration.test.ts` compare, route par
route, les comptes entre une organisation de 10 membres et une de 80. Sabotage vérifié : une lecture
par membre ajoutée dans `GET /tresorerie` fait passer le compte de **13 à 83** et le test échoue. Les
routes mesurées ont une source unique, `perf/routes-mesurees.ts`, partagée avec le harnais : **ajouter
une route lourde à cette liste la couvre des deux côtés**.

### 2.2 Temps de service (une connexion, p50)

| Route | 100 membres | 1 000 | 3 000 |
|---|---:|---:|---:|
| Tableau de bord | 6 ms | 22 ms | 62 ms |
| Liste des membres (page, recherche, tri) | 5 ms | 29 ms | 80 ms |
| Options de membres (sélecteurs, ⌘K) | 1 ms | 12 ms | 27 ms |
| Réconciliation | 3 ms | 21 ms | 63 ms |
| Rapport financier (10 ans) | 5 ms | 22 ms | 67 ms |
| Export Excel (toutes années) | 23 ms | 182 ms | 620 ms |
| Export PDF (une année) | 17 ms | 105 ms | 325 ms |
| Fiche, statut, contributions d'un membre ; trésorerie ; `/moi/*` | ≤ 5 ms | ≤ 3 ms | ≤ 5 ms |

**Lecture** : tout ce qui porte sur l'ORGANISATION ENTIÈRE croît linéairement avec elle, puisque le
statut de cotisation est calculé et non stocké. Ce qui porte sur UN membre reste constant. À **3 000
membres, trois fois la cible à 12 mois**, aucun écran interactif ne dépasse 100 ms de service.

**Conséquence pour 1.3** : la décision de reporter la MATÉRIALISATION du statut est confirmée par la
mesure. La liste des membres passe de 29 ms à 1 000 membres à 80 ms à 3 000 ; même avec le facteur
Railway, elle reste sous 250 ms. Le seuil de réouverture (~3 000 membres) tient.

Sous **dix connexions simultanées** sur la même organisation de 3 000 membres, le serveur sature :
dashboard à 17 req/s pour 613 ms p50, export Excel à 6 s. C'est le comportement attendu d'un fil
unique occupé par du calcul. Ce n'est pas un usage réaliste : dix personnes du même bureau qui ouvrent
le tableau de bord à la même seconde.

### 2.3 Les PDF proportionnels à l'organisation figeaient le serveur — rendus hors fil depuis

**Mesure initiale** (3 000 membres, sonde `/health` toutes les 20 ms pendant l'export) :

| Export | Durée | Pire latence de `/health` AVANT | APRÈS (worker) |
|---|---:|---:|---:|
| Excel (toutes années) | ~0,7 s | 33 ms | 30 ms (inchangé : `exceljs` rend déjà la main) |
| PDF des contributions (une année) | ~0,75 s | **725 ms** | **2 ms** |
| PDF du recouvrement | ~0,9 s | *(non mesuré avant)* | **2 ms** |
| Planche de cartes de membre | **27 s** | **~22 s** de gel (estimé : 7,5 ms × ~2 900 cartes, mesuré sur le fil) | **44 ms** |

**PDFKit est synchrone** : pendant le rendu, le processus ne répondait à PERSONNE, toutes
organisations confondues, puisqu'un seul processus sert tous les tenants. Le pire cas n'était pas
l'export annoncé. C'était la **planche de cartes**, à ~7,5 ms par carte (QR + dessin) : 2,3 s de
serveur figé pour 300 membres, 7,5 s pour 1 000.

**Correctif** (`services/pdf-hors-fil.service.ts`) : les trois documents dont la taille suit celle de
l'organisation (contributions, recouvrement, planche de cartes) sont rendus dans un `worker_thread`.
Le worker ne touche ni la base ni le contexte d'organisation : la route lit les données sous
l'isolation habituelle, seul le dessin part. Au plus 2 rendus simultanés. **Seuils mesurés** sur le
module compilé : démarrer un worker coûte ~200 ms, parce qu'il recharge PDFKit et exceljs. En
conséquence :

- un **tableau de moins de 1 000 lignes** reste sur le fil : il s'y rend en moins de ~110 ms, plus
  vite que le worker ne démarre ;
- une **planche de plus d'une carte** part toujours au worker ;
- les **PDF d'une page** (reçu, relevé, carte seule, compte rendu, rapports agrégés) restent sur le
  fil.

Si le worker échoue, le rendu est **rejoué sur le fil** et journalisé en `error` : l'utilisateur a
son document. Le chemin de PRODUCTION, c'est-à-dire le worker compilé chargé par `node dist/app.js`,
est testé en CI après le build (`pdf-hors-fil.test.ts`). Deux sabotages ont été vérifiés :

- **rendu remis sur le fil** : le fil principal ne tourne plus pendant le rendu, et le test échoue ;
- **photos non reconverties** : le clonage vers le worker change les `Buffer` en `Uint8Array`, que
  PDFKit refuse, et `carte.service` avale l'erreur pour dessiner les initiales. Le test compte donc
  les images réellement intégrées au PDF.

**Limite restante** : la planche de 3 000 cartes prend toujours ~27 s (le serveur reste disponible
pour les autres), ce qui peut dépasser le délai du proxy Vercel. Au-delà de ~1 500 membres, le
remède sera d'imprimer par branche, ou de générer la planche en tâche différée avec un lien de
téléchargement.

### 2.4 Rate-limit : des seaux partagés par tous les utilisateurs (défaut de production, corrigé en partie)

**Constat, mesuré en production le 2026-09-19** (logs HTTP Railway + en-têtes `x-ratelimit-remaining`) :
le navigateur appelle `nkoni.vercel.app/api/*`, que Vercel relaie vers Railway. **Railway réécrit
`X-Forwarded-For`** avec l'adresse de son pair TCP. Malgré `trustProxy: true`, le backend voit donc
pour TOUS les utilisateurs une adresse de SORTIE de Vercel, jamais celle du client :

- **un seau de 300 requêtes/min partagé** par tous ceux qui sortent par la même adresse ;
- **un seau de 10 connexions/min partagé** de la même façon, le login ayant son propre budget.

**Combien de seaux, exactement ?** Vercel sort par un **pool** d'adresses, pas une seule ; sa taille
et sa composition varient et ne sont pas contractuelles. Relevé le 2026-09-22 sur 200 lignes de logs
Railway, le trafic applicatif proxifié arrive de `51.44.162.123`, `35.180.23.203` et
`35.180.62.180` ; deux autres adresses (`13.39.112.199`, `13.36.234.177`) avaient été vues le
2026-09-19. C'est donc **une poignée de seaux pour toute la plateforme**, et non un seul comme
l'affirmait d'abord cette section. La correction ne change pas la NATURE du défaut — le budget d'un
utilisateur dépend de ce que consomment des inconnus, et rien ne le lui rend — mais elle en change
l'ordre de grandeur, donc ne pas la perdre en relisant.

> ⚠️ **Ne pas confondre avec les adresses qui frappent `/ready`** : c'est le moniteur d'uptime Sentry,
> qui appelle Railway **en direct** sans passer par Vercel (huit adresses distinctes dans le même
> relevé). Les compter comme des sorties Vercel donnerait un nombre de seaux largement surestimé.

Consommation réelle d'un utilisateur, mesurée dans le navigateur sur la démo de production :

| Geste | Appels API |
|---|---:|
| Ouverture de l'application jusqu'au tableau de bord | 7 |
| Fiche d'un membre | 8 |
| Trésorerie, retour au tableau de bord | 2 chacun |

Un utilisateur actif consomme ainsi 20 à 40 requêtes par minute. **Une dizaine de personnes
simultanées sortant par la même adresse suffisaient à provoquer des 429 pour toutes les autres.** Le
défaut est passé inaperçu faute de trafic.

Revers de la même réécriture : un `X-Forwarded-For` **forgé** en appelant Railway en direct n'a
**aucun effet**. Vérifié : trois valeurs différentes, un seul et même compteur. L'IP n'est pas
usurpable.

**Corrigé (`lib/rate-limit.ts`)** — une requête qui porte un jeton d'accès dont la signature est
vérifiée est imputée à son **COMPTE** (300 requêtes/min chacun, soit 7 à 15 fois l'usage mesuré). Un
jeton forgé ne vérifie pas et retombe sur l'IP : aucun seau neuf sans le secret. Deux exceptions
restent volontairement à l'IP :

- **les routes à budget propre** (login, inscription, démo, webhooks) : les imputer au compte
  permettrait de multiplier le budget anti-force-brute avec plusieurs comptes ;
- **les jetons de démonstration** : tous les visiteurs partagent le même compte démo.

Vérifié de bout en bout (phase 3, rate-limit actif, une seule IP) : deux comptes font chacun 300
requêtes sans refus, et la 301ᵉ d'un compte est refusée.

**RESTE OUVERT — le trafic anonyme est toujours mutualisé derrière Vercel.** Sont concernés :

- le **login** : 10/min par adresse de sortie Vercel, donc pour de larges pans du trafic ;
- l'**inscription** : 5/min ;
- le **refresh**, qui porte un cookie mais pas de jeton Bearer, et chaque ouverture d'application en
  fait un ;
- la **démo**, les **liens publics signés** et `/statut`.

Exemple concret : une assemblée générale où 30 membres se connectent en même temps pour voter.
Réparti sur les trois adresses de sortie relevées, le budget cumulé est de 30 connexions par minute :
l'assemblée passe tout juste, et la moindre saisie ratée bascule les suivants en refus. Le pool
n'étant pas contractuel, il peut aussi se réduire — à une seule adresse, le 11ᵉ membre est déjà
refusé pendant une minute.

Le remède sûr exige de transmettre l'IP du client par un canal que Railway ne réécrit pas **et**
qu'un appel direct à Railway ne peut pas forger. Faire confiance à `x-vercel-forwarded-for` seul
rouvrirait la force brute : il suffirait de l'inventer en appelant Railway en direct. **Option
recommandée** :

1. une Routing Middleware Vercel (`frontend/middleware.ts`) ajoute à chaque requête `/api/*` l'IP du
   client et un **secret partagé** (`PROXY_SECRET`, posé sur Vercel ET sur Railway) ;
2. le backend n'utilise cette IP que si le secret concorde, et garde l'IP du pair sinon.

Cela demande deux variables d'environnement, donc un geste PO sur Vercel et Railway. **Décision PO
requise** avant de le faire.

> ⚠️ **Cette option a déjà été tentée, et reverté le 2026-09-23 — lire le post-mortem avant de la
> reprendre** : [`post-mortems/2026-09-23-fuite-proxy-secret.md`](post-mortems/2026-09-23-fuite-proxy-secret.md).
> Deux enseignements, qui changent la conception :
>
> 1. **`next({ headers })` de `@vercel/functions` pose des en-têtes de RÉPONSE, pas de requête.** La
>    middleware a donc publié le secret à tout client appelant `/api/*`. La documentation Vercel
>    illustre les deux usages avec la même signature sans les distinguer. **Prouver la propagation
>    sur une prévisualisation AVANT d'écrire la moindre ligne de production.**
> 2. **Ne pas transmettre un secret porteur.** Faire signer l'IP du client (HMAC de `PROXY_SECRET`
>    sur l'IP) plutôt que d'envoyer le secret : divulguée, une telle signature ne vaut que pour
>    l'adresse de son porteur, qui serait de toute façon sa clé. Le même bug serait resté
>    inoffensif.

## 3. Ce que ces mesures ne couvrent pas

- **L'infrastructure de production** : pas de test de charge contre Railway. Ce serait tester
  l'hébergeur avec le trafic réel des clients, et les chiffres locaux suffisent à trancher.
- **Les écritures** : versements, imports, génération de reçus. Leur coût est dominé par argon2, le
  Blob et les envois, pas par la base.
- **La concurrence entre organisations** : les requêtes d'une organisation n'ont aucun effet sur le
  plan d'exécution d'une autre (index `organisationId`), mais elles partagent le même fil Node.
  C'est ce que montre le §2.3.
