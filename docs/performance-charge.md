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

### 2.3 Un export PDF fige le serveur — pour tous les tenants

| Export (3 000 membres) | Durée | Pire latence de `/health` pendant l'export |
|---|---:|---:|
| Excel (toutes années) | 1 254 ms | **33 ms** |
| PDF (une année) | 771 ms | **725 ms** |

`exceljs` rend la main à la boucle d'événements pendant la construction : les autres requêtes passent.
**PDFKit est synchrone** : pendant les ~0,7 s de rendu, le processus ne répond à PERSONNE, toutes
organisations confondues, puisqu'un seul processus sert tous les tenants.

**Décision : acceptable aujourd'hui.** À la cible (< 1 000 membres), le gel est d'environ 0,1 s.
**Seuil de traitement** : une organisation au-delà de ~2 000 membres, ou des exports PDF fréquents. Le
remède sera de déporter le rendu PDF dans un `worker_thread`, sans changer l'API. Le reçu, la carte et
le compte rendu, eux, sont des PDF d'une page, non concernés.

### 2.4 Rate-limit : un seul seau pour toute la plateforme (défaut de production, corrigé en partie)

**Constat, mesuré en production le 2026-09-19** (logs HTTP Railway + en-têtes `x-ratelimit-remaining`) :
le navigateur appelle `nkoni.vercel.app/api/*`, que Vercel relaie vers Railway. **Railway réécrit
`X-Forwarded-For`** avec l'adresse de son pair TCP. Malgré `trustProxy: true`, le backend voit donc
pour TOUS les utilisateurs l'adresse de sortie de Vercel (`13.39.112.199` lors de la mesure) :

- **un seul seau de 300 requêtes/min pour toute la plateforme** ;
- **un seul seau de 10 connexions/min**, puisque le login a son propre budget.

Consommation réelle d'un utilisateur, mesurée dans le navigateur sur la démo de production :

| Geste | Appels API |
|---|---:|
| Ouverture de l'application jusqu'au tableau de bord | 7 |
| Fiche d'un membre | 8 |
| Trésorerie, retour au tableau de bord | 2 chacun |

Un utilisateur actif consomme ainsi 20 à 40 requêtes par minute. **Une dizaine de personnes
simultanées, sur toute la plateforme, suffisaient à provoquer des 429 pour tout le monde.** Le
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

- le **login** : 10/min pour toute la plateforme ;
- l'**inscription** : 5/min ;
- le **refresh**, qui porte un cookie mais pas de jeton Bearer, et chaque ouverture d'application en
  fait un ;
- la **démo**, les **liens publics signés** et `/statut`.

Exemple concret : une assemblée générale où 30 membres se connectent en même temps pour voter. À
partir du 11ᵉ, les connexions sont refusées pendant une minute.

Le remède sûr exige de transmettre l'IP du client par un canal que Railway ne réécrit pas **et**
qu'un appel direct à Railway ne peut pas forger. Faire confiance à `x-vercel-forwarded-for` seul
rouvrirait la force brute : il suffirait de l'inventer en appelant Railway en direct. **Option
recommandée** :

1. une Routing Middleware Vercel (`frontend/middleware.ts`) ajoute à chaque requête `/api/*` l'IP du
   client et un **secret partagé** (`PROXY_SECRET`, posé sur Vercel ET sur Railway) ;
2. le backend n'utilise cette IP que si le secret concorde, et garde l'IP du pair sinon.

Cela demande deux variables d'environnement, donc un geste PO sur Vercel et Railway. **Décision PO
requise** avant de le faire.

## 3. Ce que ces mesures ne couvrent pas

- **L'infrastructure de production** : pas de test de charge contre Railway. Ce serait tester
  l'hébergeur avec le trafic réel des clients, et les chiffres locaux suffisent à trancher.
- **Les écritures** : versements, imports, génération de reçus. Leur coût est dominé par argon2, le
  Blob et les envois, pas par la base.
- **La concurrence entre organisations** : les requêtes d'une organisation n'ont aucun effet sur le
  plan d'exécution d'une autre (index `organisationId`), mais elles partagent le même fil Node.
  C'est ce que montre le §2.3.
