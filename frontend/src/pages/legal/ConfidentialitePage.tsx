import { PageLegale, SectionLegale, Placeholder } from './PageLegale'

/**
 * Politique de confidentialité (RGPD) — bloquant GA 0.3. Contenu ancré sur les traitements RÉELS
 * du logiciel (données membres, finances, hébergement). Date + adresse du siège renseignées ;
 * RESTE le NUMÉRO D'IMMATRICULATION (Placeholder) à compléter, puis faire RELIRE par un juriste
 * avant mise en ligne réelle. Marché cible francophone → français.
 */
export function ConfidentialitePage() {
  return (
    <PageLegale titre="Politique de confidentialité" majLe="24 juillet 2026">
      <SectionLegale titre="1. Qui est responsable de vos données">
        <p>
          NKONI est un service de gestion des cotisations et de transparence financière pour
          associations, familles élargies et tontines. Le responsable du traitement est la société{' '}
          HABATECH, immatriculée sous le numéro{' '}
          <Placeholder>NUMÉRO D’IMMATRICULATION</Placeholder>, dont le siège est situé{' '}
          71 rue de Rome, 13001 Marseille (ci-après « nous »).
        </p>
        <p>
          Nous traitons les données personnelles dans le respect du Règlement général sur la
          protection des données (RGPD) et de toute réglementation applicable, que nous appliquons
          comme socle de protection à l’ensemble de nos utilisateurs.
        </p>
      </SectionLegale>

      <SectionLegale titre="2. Quelles données nous traitons">
        <p>Selon votre rôle, nous traitons les catégories de données suivantes :</p>
        <p className="font-medium text-foreground">Données de compte (utilisateurs connectés)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>adresse e-mail et mot de passe (stocké de façon chiffrée et irréversible, jamais en clair) ;</li>
          <li>rôle, organisation de rattachement, langue et préférences de notification.</li>
        </ul>
        <p className="font-medium text-foreground">Données des membres (saisies par l’organisation)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>identité : nom, prénom, sexe, date de naissance ;</li>
          <li>coordonnées : téléphone, e-mail, adresse ;</li>
          <li>rattachement : branche familiale, fonction sociale, année d’adhésion, statut ;</li>
          <li>photographie du membre, lorsqu’elle est fournie.</li>
        </ul>
        <p className="font-medium text-foreground">Données financières</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>cotisations attendues, versements, reçus, dépenses, cagnottes et amendes ;</li>
          <li>historique et documents justificatifs associés.</li>
        </ul>
        <p className="font-medium text-foreground">Données techniques</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>journaux de connexion et d’activité nécessaires à la sécurité et à la traçabilité ;</li>
          <li>en cas d’erreur applicative, un rapport technique anonymisé (sans contenu personnel).</li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="3. Pourquoi nous les traitons (finalités et bases légales)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            fournir le service (gestion des cotisations, reçus, tableaux de bord) —{' '}
            <span className="text-foreground">exécution du contrat</span> ;
          </li>
          <li>
            sécuriser les comptes et prévenir les usages abusifs —{' '}
            <span className="text-foreground">intérêt légitime</span> ;
          </li>
          <li>
            respecter nos obligations comptables et légales —{' '}
            <span className="text-foreground">obligation légale</span> ;
          </li>
          <li>
            envoyer des reçus et relances de cotisation par WhatsApp ou e-mail —{' '}
            <span className="text-foreground">exécution du contrat</span>, dans le respect des
            préférences de notification du destinataire.
          </li>
        </ul>
        <p>
          Les membres n’ayant pas de compte sont ajoutés par leur organisation, qui est responsable
          de la licéité de la collecte des données qu’elle saisit.
        </p>
      </SectionLegale>

      <SectionLegale titre="4. Qui a accès à vos données">
        <p>
          Chaque organisation dispose d’un espace <span className="text-foreground">strictement
          isolé</span> : ses données ne sont accessibles qu’à ses propres membres autorisés, selon
          leur rôle. Nous ne vendons ni ne louons vos données, et ne les partageons pas à des fins
          publicitaires.
        </p>
        <p>Nous faisons appel à des sous-traitants techniques, uniquement pour opérer le service :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>hébergement de l’application et de la base de données (fournisseurs d’infrastructure cloud) ;</li>
          <li>stockage des pièces jointes (photos, documents, reçus) sur un espace privé ;</li>
          <li>envoi d’e-mails transactionnels (reçus, notifications) ;</li>
          <li>envoi de messages WhatsApp, lorsque ce canal est activé ;</li>
          <li>supervision technique des erreurs, sans données personnelles.</li>
        </ul>
        <p>
          Certains de ces prestataires peuvent héberger des données hors de l’Union européenne. Le
          cas échéant, ces transferts sont encadrés par des garanties appropriées (clauses
          contractuelles types ou mécanismes équivalents).
        </p>
      </SectionLegale>

      <SectionLegale titre="5. Combien de temps nous les conservons">
        <p>
          Vos données sont conservées tant que l’espace de votre organisation est actif. À la
          clôture de l’espace, elles sont définitivement supprimées dans un délai maximum de{' '}
          <span className="text-foreground">30 jours</span>, à l’exception des données que nous
          sommes légalement tenus de conserver plus longtemps (par exemple certaines pièces à
          valeur comptable). Un dirigeant peut à tout moment exporter les données de son
          organisation depuis les paramètres.
        </p>
      </SectionLegale>

      <SectionLegale titre="6. Vos droits">
        <p>Conformément au RGPD, vous disposez des droits suivants sur vos données personnelles :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>droit d’accès et de rectification ;</li>
          <li>droit à l’effacement (« droit à l’oubli ») ;</li>
          <li>droit à la portabilité (export de vos données dans un format lisible) ;</li>
          <li>droit d’opposition et de limitation du traitement ;</li>
          <li>droit de définir des directives sur le sort de vos données après votre décès.</li>
        </ul>
        <p>
          Pour exercer ces droits, écrivez-nous à{' '}
          <a
            href="mailto:romel.djoumessi@gmail.com"
            className="text-brass underline-offset-2 hover:underline"
          >
            romel.djoumessi@gmail.com
          </a>
          . Vous disposez également du droit d’introduire une réclamation auprès de l’autorité de
          contrôle compétente en matière de protection des données.
        </p>
      </SectionLegale>

      <SectionLegale titre="7. Comment nous protégeons vos données">
        <p>
          La sécurité est au cœur du service : isolation stricte entre organisations, chiffrement
          des communications (HTTPS), stockage chiffré et irréversible des mots de passe, stockage
          privé des pièces jointes (jamais exposées publiquement), et journalisation des actions
          sensibles. Aucun système n’étant infaillible, nous nous engageons à vous informer sans
          délai en cas d’incident affectant vos données, conformément à la réglementation.
        </p>
      </SectionLegale>

      <SectionLegale titre="8. Cookies">
        <p>
          NKONI n’utilise que les cookies <span className="text-foreground">strictement
          nécessaires</span> à son fonctionnement — principalement un cookie sécurisé de session
          permettant de vous garder connecté. Nous n’utilisons pas de cookies publicitaires ni de
          traceurs tiers.
        </p>
      </SectionLegale>

      <SectionLegale titre="9. Modifications">
        <p>
          Nous pouvons faire évoluer la présente politique. Toute modification substantielle sera
          portée à votre connaissance, et la date de dernière mise à jour figure en tête de page.
          Pour toute question, contactez-nous à{' '}
          <a
            href="mailto:romel.djoumessi@gmail.com"
            className="text-brass underline-offset-2 hover:underline"
          >
            romel.djoumessi@gmail.com
          </a>
          .
        </p>
      </SectionLegale>
    </PageLegale>
  )
}

export default ConfidentialitePage
