# Engagement de service — disponibilité & support (GA 2.2)

Définit ce que NKONI s'engage à tenir : **disponibilité**, **délais de réaction**, **fenêtres de
maintenance**, et ce qui est explicitement **exclu**. Le versant opérationnel — comment on réagit
quand la cible n'est pas tenue — est dans `RUNBOOK_incidents.md`.

> **Ce document est un engagement INTERNE, pas un contrat.** NKONI ne facture rien aujourd'hui
> (l'attribution d'un forfait est une action manuelle du SUPER_ADMIN, sans paiement) : il n'y a donc
> ni client payant, ni contrepartie, ni avoir de service. Publier ces chiffres dans les CGU en ferait
> une obligation contractuelle — **ne pas le faire avant de les avoir tenus et mesurés sur plusieurs
> trimestres**. Même prudence que pour le RPO/RTO des sauvegardes.

---

## 1. Disponibilité

### 1.1 Cible

| Objectif | Cible | Budget d'indisponibilité |
|---|---|---|
| **Disponibilité mensuelle** | **99 %** | **7 h 12 min** par mois (base 30 j) |

**Pourquoi 99 % et pas 99,9 %.** Le chiffre n'est pas une modestie de façade, il découle
mécaniquement de l'architecture et de l'organisation actuelles :

- **RTO de 4 h** (`RUNBOOK_sauvegardes_restauration.md`). Or le budget mensuel à 99,5 % vaut
  **3 h 36 min** : **une seule restauration ferait sauter le mois**. À 99 % (7 h 12 min), un
  événement de restauration tient dans le budget — de justesse. Annoncer 99,5 % reviendrait à
  s'engager sur un objectif que notre propre procédure de reprise contredit.
- **Instance unique, région unique.** Un seul process Railway, une seule base Postgres, pas de
  bascule automatique. Toute panne d'infrastructure est une indisponibilité, pas une dégradation.
- **Exploitation par une personne, sans astreinte.** Une panne à 2 h du matin dure jusqu'au réveil.
  99,9 % (43 min/mois) supposerait une réaction automatique ou une équipe de garde : ni l'une ni
  l'autre n'existent.

**Trajectoire.** Le passage à **99,5 %** devient défendable une fois réunis : (a) l'alerting posé,
(b) une sonde externe qui mesure, (c) la sauvegarde automatisée, (d) **deux trimestres de mesure
effective** confirmant la cible. Les trois premiers points sont les chantiers §8 du runbook.

### 1.2 Périmètre mesuré
Est « disponible » un service qui répond à un **chemin authentifié réel**, pas seulement à un
ping. La mesure retenue est le succès de **`GET https://nkoni.vercel.app/api/ready`** — readiness :
le process répond **et** la base répond (`SELECT 1`) — complété par la capacité à se connecter.

> **Mesurer sur `/ready`, jamais sur `/health`.** `/health` est le *liveness* : il répond
> `{"status":"ok"}` sans toucher la base, par conception (c'est le healthcheck Railway). Une mesure
> fondée sur lui **surestimerait** la disponibilité, puisqu'il reste vert avec Postgres à terre.
>
> Réserve résiduelle : `/ready` prouve que la base **répond**, pas qu'elle est **cohérente**. Une
> base restaurée mais incomplète le laisserait vert — d'où le contrôle applicatif du §3.5 du runbook.

### 1.3 ⚠️ La disponibilité n'est pas mesurée aujourd'hui
Il n'existe **aucune sonde externe** (chantier §8.2 du runbook). Le taux ci-dessus est donc, à ce
jour, une **cible sans instrument** : la seule source d'indisponibilité connue est le journal des
incidents tenu à la main (§9 du runbook), qui ne capte que ce qu'un humain a remarqué.

**Conséquence à assumer** : ne communiquer aucun taux de disponibilité à des utilisateurs tant que la
sonde n'existe pas. Un chiffre non mesuré qui se révèle faux coûte plus cher que l'absence de chiffre.

---

## 2. Délais de réaction du support

Les délais courent à partir de la **réception** du signalement à l'adresse de support publiée sur
`/statut`, et non à partir du début de l'incident — la détection dépend aujourd'hui entièrement des
utilisateurs.

| Niveau | Prise en compte | Rétablissement visé | Heures couvertes |
|---|---|---|---|
| **P1** — service inutilisable, perte ou exposition de données | **4 h** | **8 h** ouvrées, ou RTO 4 h si restauration | 8 h – 20 h (Afrique de l'Ouest, UTC+1) · au mieux hors de ces heures |
| **P2** — fonction importante cassée | **1 jour ouvré** | **5 jours ouvrés** | Heures ouvrées |
| **P3** — gêne mineure | **3 jours ouvrés** | Flux normal de développement | Heures ouvrées |

**Pas de couverture 24/7, et c'est dit.** En dehors de la plage 8 h – 20 h, la réaction est
« au mieux » : sans astreinte ni alerte automatique, elle dépend de la disponibilité d'une personne.
La fenêtre est exprimée en **UTC+1** parce que c'est le fuseau applicatif du produit
(`Africa/Douala`), mais les utilisateurs de la diaspora sont décalés — un incident de fin de soirée
en Europe tombe dans la nuit ouest-africaine.

---

## 3. Maintenance planifiée

| Règle | Engagement |
|---|---|
| Préavis | **48 h**, par email aux dirigeants des organisations |
| Fenêtre privilégiée | **22 h – 6 h** (UTC+1), en dehors des jours de collecte |
| Décompte | La maintenance **annoncée** n'est **pas** décomptée du budget d'indisponibilité |
| Procédure | Page de maintenance Vercel — `frontend/MAINTENANCE.md` |

Les déploiements ordinaires ne sont pas des maintenances planifiées : ils provoquent un redémarrage
de quelques secondes et **sont décomptés** comme indisponibilité s'ils échouent.

---

## 4. Exclusions

Ne sont pas décomptés du budget :

1. **Panne d'un fournisseur tiers** — Railway, Vercel, Vercel Blob, Resend. Nous n'avons ni
   redondance ni contrat de niveau de service auprès d'eux ; leur indisponibilité est la nôtre, mais
   elle n'est pas de notre ressort.
2. **Maintenance annoncée** dans les conditions du §3.
3. **Usage hors des conditions prévues** — dépassement du plafond de requêtes (300/min), fichiers
   au-delà des limites (photos 5 Mo), automatisation non prévue.
4. **Réseau ou terminal de l'utilisateur.** La PWA fonctionne partiellement hors ligne (file
   d'écritures IndexedDB rejouée à la reconnexion) : une coupure côté utilisateur n'est pas une
   indisponibilité du service.
5. **Force majeure.**

**Ne sont PAS des exclusions**, et sont donc bien décomptés : nos bugs, nos déploiements ratés, nos
migrations défaillantes, nos erreurs d'exploitation.

---

## 5. Ce sur quoi nous ne nous engageons pas encore

Dit franchement, pour que l'engagement porté par ce document reste crédible :

| Sujet | État |
|---|---|
| **Avoirs ou compensations** | Aucun. Pas de facturation, donc pas de contrepartie. |
| **Détection automatique des pannes** | Aucune (aucun DSN Sentry posé, aucune sonde). Runbook §8.1/§8.2. |
| **Historique public d'incidents** | La page `/statut` affiche l'état courant, pas d'historique ni de message d'incident. |
| **Haute disponibilité** | Instance et région uniques. Pas de bascule. |
| **RPO inférieur à 24 h** | La sauvegarde est un geste manuel quotidien. |
| **Support en dehors de 8 h – 20 h** | Au mieux, sans engagement. |

---

## 6. Registre de disponibilité

À renseigner mensuellement à partir du journal des incidents (`RUNBOOK_incidents.md` §9), et de la
sonde externe dès qu'elle existe.

| Mois | Indisponibilité constatée | Disponibilité | Cible tenue ? | Incidents |
|---|---|---|---|---|
| _(pas encore de mesure — cf. §1.3)_ | | | | |

> **Revue trimestrielle** : relire ce document avec le registre en main. Si la cible est tenue quatre
> trimestres d'affilée **et** que les chantiers §8.1–8.2 du runbook sont faits (§8.3 l'est déjà),
> envisager 99,5 %.
> Si elle ne l'est pas, **abaisser la cible plutôt que de la maintenir par principe** — un engagement
> qu'on rate systématiquement ne vaut rien.
