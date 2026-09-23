# Incident 2026-09-23 — `PROXY_SECRET` renvoyé dans les en-têtes de réponse

- **Gravité** : P2
- **Détecté à** : 2026-09-23 00:09:58 UTC — **par** : le contrôle de bout en bout prévu pour la
  recette du chantier (comparaison de `x-ratelimit-remaining` entre les deux chemins d'accès)
- **Contenu à** : 00:14 UTC — **Rétabli à** : 00:14 UTC (le confinement ET le rétablissement sont le
  même geste : un revert)
- **Durée d'indisponibilité** : **0 minute** — rien n'a jamais cessé de fonctionner. Aucune ligne à
  reporter au registre du SLA.
- **Tenants touchés** : aucun. Aucune donnée d'organisation, de membre ou de compte n'est en cause.

## Pourquoi P2 et pas P1

Le runbook classe d'office en P1 « toute exposition de PII ou de données financières ». Ce n'est pas
le cas ici, et il faut le dire précisément plutôt que de sur-classer par prudence : **ce qui a fuité
est un secret d'infrastructure, pas une donnée**. Sa seule capacité était de choisir la clé de
rate-limit d'une requête — donc de se soustraire au budget anti-force-brute du login. Il n'ouvrait
aucune session, ne déchiffrait rien, ne donnait accès à aucun enregistrement.

Ce n'est pas non plus un P3 : un identifiant partagé publié en clair sur un endpoint public n'est pas
« une gêne avec contournement simple ». D'où P2.

**Pas de régime « fuite de données » (§6.4), donc pas d'obligation de notification RGPD.** Un point
mérite toutefois d'être consigné pour que personne n'ait à le redécouvrir : la réponse contenait
aussi `x-nkoni-ip-client`, c'est-à-dire **l'adresse IP du destinataire lui-même**. Une IP est une
donnée personnelle, mais renvoyée à son propre porteur elle ne lui apprend rien — il n'y a
d'exposition que si une donnée atteint quelqu'un d'autre que son titulaire légitime. Aucune IP de
tiers n'a circulé.

## Ce qui s'est passé

Toutes les heures en UTC (heure locale = UTC+2).

| Heure | Événement |
|---|---|
| 23:53 (22/09) | PR #172 fusionnée et déployée. `PROXY_SECRET` n'existe alors sur aucune plateforme : la middleware retourne `next()` sans en-tête, le mécanisme est inerte. **Aucune fuite.** |
| ~00:01 | Le PO pose `PROXY_SECRET` sur Vercel et sur Railway. Railway redéploie (00:01:47) et prend la variable. |
| ~00:04 | Contrôle : les deux chemins restent sur des seaux distincts. Diagnostic : Vercel n'a pas redéployé depuis la création de la variable, la middleware en cours d'exécution lit `undefined`. |
| ~00:07 | Le PO redéploie la production Vercel. La middleware voit enfin la variable — **et se met à poser le secret en en-tête de RÉPONSE. Début de l'exposition.** |
| 00:09:58 | Le contrôle montre que le mécanisme ne marche toujours pas. En cherchant pourquoi, inspection de **tous** les en-têtes de réponse : `x-nkoni-proxy` y porte le secret en clair. |
| 00:10:54 | Revert intégral de la PR #172 (`git revert -m 1`). |
| 00:11–00:14 | CI verte sur le revert, PR #173 fusionnée. |
| 00:14 | Railway SUCCESS et déploiement Vercel `Ready`. **Fin de l'exposition.** Contrôle : plus aucun en-tête `x-nkoni-*`, application, API, `/statut` et pages légales toutes à 200. |

**Fenêtre d'exposition : environ 7 minutes.** La fin (00:14) et la détection (00:09:58, lue dans
l'en-tête `date` de la réponse fautive) sont exactes ; le début est estimé à la minute près, la
commande de redéploiement n'ayant pas horodaté sa sortie.

## Pourquoi c'est arrivé

**Cause immédiate.** `next({ headers })` de `@vercel/functions` pose des en-têtes de **réponse**, pas
de requête. La middleware renvoyait donc au client le secret qu'elle croyait transmettre au backend.

**Pourquoi cette lecture a été retenue.** La page de documentation Vercel contient les deux usages
sans les distinguer : son exemple « IP Address » (`next({ headers: { 'x-your-ip-address': ip } })`)
se lit naturellement comme un en-tête de requête vers l'amont, tandis que son exemple Gatsby emploie
la **même signature** pour poser des en-têtes de sécurité de réponse (`X-Frame-Options`,
`Referrer-Policy`). Les deux lectures étaient sous les yeux ; la mauvaise a été retenue sans que
l'autre soit testée.

**Cause racine, plus profonde que la documentation.** Le canal a été conçu pour transporter un
**secret porteur** : quiconque le lit peut s'en servir. Sa divulgation est donc, par construction,
catastrophique. Associer une conception où la divulgation est catastrophique à un transport dont le
comportement n'était **pas prouvé** est ce qui a transformé une mélecture de documentation en fuite.
Une conception où la preuve ne vaut que pour son porteur — une signature HMAC de l'IP du client
plutôt qu'un secret partagé — aurait rendu le même bug totalement inoffensif : le client n'aurait
reçu que la signature de sa propre adresse, qui ne lui donne rien.

**Cause de processus.** La PR annonçait noir sur blanc que la preuve de bout en bout restait à faire.
Elle a tout de même été fusionnée et déployée. C'est exactement la règle que ce dépôt s'est donnée
après l'exercice de restauration de 0.2 : *un contrôle marqué « livré » qui n'a jamais tourné en
conditions réelles ne prouve rien*. Elle a été énoncée, puis enfreinte dans la même session.

## Pourquoi ça n'a pas été vu plus tôt

Le délai de détection est court (≈ 3 minutes), mais il ne doit rien à un dispositif de surveillance :

- **Aucun test ne pouvait l'attraper.** L'ambiguïté vit dans le runtime Vercel, pas dans notre code.
  Les 10 tests unitaires du backend étaient justes et verts ; ils vérifiaient que le backend ne croit
  pas un en-tête sans secret, ce qui était vrai. Le défaut était de l'autre côté du fil.
- **La CI ne regarde pas la production.** Aucun contrôle n'inspecte les en-têtes de réponse réels.
- **La sonde de disponibilité n'aurait rien vu** : tout répondait 200, ce qui est précisément le
  profil d'un incident de confidentialité.
- **C'est le contrôle de recette qui a sauvé la situation**, et seulement parce qu'il échouait pour
  une autre raison — le mécanisme ne fonctionnait pas non plus. Si l'en-tête était bien parvenu au
  backend, le contrôle serait passé au vert et le secret aurait continué de fuiter. **Il faut le dire
  ainsi : la détection doit autant au hasard qu'à la méthode.**

## Ce qui a bien fonctionné

- **La conception fail-closed.** À aucun moment le service n'a été dégradé : secret absent, non
  concordant ou en-tête manquant ramenaient au comportement antérieur. Le pire cas était l'inaction,
  jamais la panne.
- **Le revert était disponible et propre**, parce que le chantier tenait dans une seule PR et que le
  dépôt impose `--no-ff` : `git revert -m 1` a suffi, sans reconstitution manuelle.
- **La protection de `main` a tenu jusque dans l'urgence.** Le revert est passé par la CI complète
  avant d'atterrir — la tentation de court-circuiter était réelle, et la règle l'a empêchée.
- **Les watch patterns Railway** ont redéployé le backend automatiquement : le confinement des deux
  côtés n'a demandé qu'une seule fusion.
- **Le revert a été intégral, backend compris.** Ne reverter que la middleware aurait laissé un
  backend disposé à croire `x-nkoni-proxy` avec un secret désormais public : la fuite serait devenue
  une capacité réelle de forger sa clé de rate-limit.

## Actions

| Action | Type | Échéance |
|---|---|---|
| Supprimer `PROXY_SECRET` sur Vercel **et** sur Railway — le considérer comme brûlé, ne jamais réutiliser cette valeur | atténuation | immédiat (PO) |
| ~~Spike prouvant qu'un en-tête ajouté par la middleware atteint le backend à travers le rewrite~~ → **FAIT le 2026-09-23, résultat ci-dessous** | prévention | ✅ |
| Reconcevoir le canal pour que la divulgation soit **sans valeur** : signature HMAC de l'IP du client, jamais un secret porteur transmis tel quel. **Le spike renforce cette action** : il reste un résidu d'en-têtes internes observé côté client, que seule une preuve sans valeur rend inoffensif | prévention | à la reprise |
| Ne pas fusionner un mécanisme dont la preuve de bout en bout est **déclarée manquante** dans sa propre PR — la mention du manque n'est pas une mitigation | prévention | règle, immédiate |
| Contrôle automatisé des en-têtes de réponse de la production : échouer si un en-tête inattendu (`x-nkoni-*` ou toute valeur ressemblant à un secret) apparaît. C'est la seule action qui aurait détecté cet incident **indépendamment** de la recette | détection | à inscrire au chantier 1.4 |

> Le dernier point est celui qui compte. La prévention n'aurait pas empêché cette erreur : elle venait
> d'une documentation ambiguë, et la prochaine viendra d'ailleurs. Un contrôle qui regarde ce que la
> production **répond réellement** les attrape toutes.

---

## Suite — résultat du spike (2026-09-23)

Mené après le revert, sur une branche jetable supprimée depuis, sans toucher à la production. Il
répond aux deux actions de prévention ci-dessus et en ajoute une troisième, trouvée en chemin.

### Méthode

Point de départ : **lire le code de `@vercel/functions`**, pas sa documentation — c'est son ambiguïté
qui a causé l'incident. La réponse y est explicite :

| Champ | Destination | Encodage |
|---|---|---|
| `init.headers` | **réponse au client** (« sent to the user response ») | posé tel quel |
| `init.request.headers` | **requête amont** | `x-middleware-request-<clé>` + `x-middleware-override-headers`, consommés par le routeur Vercel |

Le champ `request.headers` exige un objet `Headers` (il lève sinon) et **remplace** les en-têtes de la
requête amont : on part de `new Headers(request.headers)` puis on `set()`.

Banc d'essai : une middleware posant DEUX marqueurs par les deux voies, et un rewrite `vercel.json`
vers une origine **externe** qui renvoie les en-têtes reçus — la forme exacte de la production.

### Ce qui est prouvé

1. **`next({ request: { headers } })` traverse un rewrite EXTERNE.** L'origine a reçu le marqueur.
   C'est la voie correcte ; `init.headers` est bien la voie fautive.
2. **Un client ne peut pas écraser l'en-tête posé par la middleware.** Marqueur envoyé par le client
   → l'origine reçoit la valeur de la middleware. La construction `new Headers(...)` + `set()` gagne.
3. **Le protocole interne du routeur n'est pas injectable par le client.** Un client envoyant
   lui-même `x-middleware-override-headers` et `x-middleware-request-<clé>` les voit arriver à
   l'origine **comme du bruit inerte** : la valeur effective reste celle de la middleware.
   **Corollaire impératif** : le backend doit lire **son propre nom d'en-tête**, jamais un
   `x-middleware-request-*` — ceux-là traversent verbatim depuis le client.

### Un trou trouvé en chemin, à ne pas reproduire

La middleware reverté contenait `if (!ip) return next()`. Sur ce chemin, **un en-tête
`x-nkoni-ip-client` envoyé par le client survit intact jusqu'au backend**, puisque rien ne l'écrase.
Règle : **toujours poser ou supprimer les en-têtes du canal, sur TOUS les chemins** — jamais de
retour anticipé qui laisse passer ce que le client a envoyé.

### Limite, et pourquoi elle est acceptable

Le banc tourne sur le routeur local de `vercel dev`, **pas sur l'edge**. Les déploiements de
prévisualisation sont protégés par le SSO Vercel (`ssoProtection: all_except_custom_domains`) : un
appel non authentifié reçoit un 302 vers la page de connexion. Une preuve au niveau edge demanderait
d'activer *Protection Bypass for Automation* dans les réglages du projet (un interrupteur, qui génère
un secret de contournement) — geste PO, non pris.

Un résidu observé en dev appuie cette réserve : `x-middleware-request-connection` et
`x-middleware-request-host` sont **ressortis dans la réponse au client**. Valeurs anodines, mais la
démonstration qu'un résidu d'en-têtes internes peut atteindre le client.

**C'est exactement pourquoi la conception doit être sans valeur en cas de divulgation.** Avec une
signature HMAC de l'IP du client, un résidu ne donne rien : la signature ne vaut que pour l'adresse
de son porteur, qui serait de toute façon sa clé de rate-limit. Résidu connu et borné : qui
obtiendrait la signature d'un tiers pourrait consommer le seau de CETTE adresse — une nuisance sur
une IP, pas un contournement du budget anti-force-brute.

### Recette pour la reprise

- `next({ request: { headers } })`, **jamais** `init.headers` ;
- transmettre `x-nkoni-ip-client` **et sa signature HMAC**, jamais le secret ;
- poser ou supprimer les deux en-têtes sur **tous** les chemins de la middleware ;
- backend : vérification en temps constant, `isIP`, repli fail-closed sur l'IP du pair — le code
  reverté était juste et testé, il se remet tel quel ;
- livrer **avec** le contrôle des en-têtes de réponse de la production, pas après.
