import { PageLegale, SectionLegale } from './PageLegale'

/**
 * Conditions générales d’utilisation (CGU) — bloquant GA 0.3. Ancrées sur le produit réel
 * (forfaits, attribution manuelle sans paiement, propriété des données du tenant, export/purge).
 * PLACEHOLDERS `[ … ]` à compléter et faire RELIRE par un juriste avant mise en ligne réelle.
 */
export function CGUPage() {
  return (
    <PageLegale titre="Conditions générales d’utilisation" majLe="[DATE DE PUBLICATION]">
      <SectionLegale titre="1. Objet">
        <p>
          Les présentes conditions régissent l’utilisation de NKONI, service de gestion des
          cotisations et de transparence financière pour associations, familles élargies et
          tontines, édité par HABATECH (ci-après « nous »). En
          créant un espace ou en utilisant le service, vous acceptez ces conditions.
        </p>
      </SectionLegale>

      <SectionLegale titre="2. Compte et inscription">
        <p>
          L’inscription crée un espace pour votre organisation et un compte administrateur. Vous
          êtes responsable de l’exactitude des informations fournies, de la confidentialité de vos
          identifiants et de toute activité réalisée depuis votre compte. Vous devez nous informer
          sans délai de tout usage non autorisé.
        </p>
      </SectionLegale>

      <SectionLegale titre="3. Utilisation du service">
        <p>
          Vous vous engagez à utiliser NKONI de façon licite et conforme à sa finalité. En
          particulier, lorsque vous saisissez les données de vos membres, vous garantissez disposer
          du droit de le faire et être responsable, en tant que responsable de traitement de votre
          organisation, de la licéité de cette collecte et de l’information de vos membres.
        </p>
        <p>
          Il est notamment interdit de tenter d’accéder aux données d’une autre organisation, de
          perturber le service, ou de l’utiliser à des fins frauduleuses.
        </p>
      </SectionLegale>

      <SectionLegale titre="4. Forfaits">
        <p>
          NKONI propose plusieurs forfaits (Gratuit, Pro, Entreprise) dont les limites — notamment
          le nombre de membres — sont propres à chaque forfait. Le forfait Gratuit est limité en
          nombre de membres ; les forfaits Pro et Entreprise lèvent cette limite. L’attribution
          d’un forfait est, à ce jour, réalisée manuellement par nos soins, sans paiement en ligne.
          Les modalités commerciales pourront évoluer et seront alors précisées.
        </p>
      </SectionLegale>

      <SectionLegale titre="5. Propriété et responsabilité des données">
        <p>
          Les données saisies dans votre espace restent la propriété de votre organisation. Nous
          agissons comme prestataire technique pour les héberger et les traiter selon vos
          instructions et notre{' '}
          <a href="/confidentialite" className="text-brass underline-offset-2 hover:underline">
            politique de confidentialité
          </a>
          . Un dirigeant peut exporter à tout moment l’intégralité des données de son organisation.
        </p>
      </SectionLegale>

      <SectionLegale titre="6. Disponibilité et évolutions">
        <p>
          Nous nous efforçons d’assurer la disponibilité et la fiabilité du service, sans toutefois
          garantir un fonctionnement ininterrompu. Nous pouvons faire évoluer, suspendre ou limiter
          certaines fonctionnalités, notamment pour des raisons de maintenance ou de sécurité. Les
          sauvegardes des données sont réalisées régulièrement, sans que cela ne vous dispense
          d’exporter vos données si vous souhaitez en conserver une copie.
        </p>
      </SectionLegale>

      <SectionLegale titre="7. Limitation de responsabilité">
        <p>
          NKONI est un outil d’aide à la gestion. Vous restez responsable de l’exactitude des
          informations que vous saisissez et des décisions que vous prenez sur cette base. Dans les
          limites permises par la loi, notre responsabilité ne saurait être engagée pour les
          dommages indirects résultant de l’utilisation ou de l’impossibilité d’utiliser le service.
        </p>
      </SectionLegale>

      <SectionLegale titre="8. Résiliation et clôture">
        <p>
          Vous pouvez demander la clôture de votre espace à tout moment. À la clôture, vos données
          sont supprimées définitivement dans le délai indiqué par notre politique de
          confidentialité. Nous vous recommandons d’exporter vos données au préalable. Nous nous
          réservons le droit de suspendre ou de clôturer un espace en cas de manquement grave aux
          présentes conditions.
        </p>
      </SectionLegale>

      <SectionLegale titre="9. Droit applicable et litiges">
        <p>
          Les présentes conditions sont régies par le droit applicable au siège de l’éditeur
          (droit français). En cas de litige, une solution
          amiable sera recherchée en priorité ; à défaut, les tribunaux compétents seront ceux
          désignés par la réglementation applicable.
        </p>
      </SectionLegale>

      <SectionLegale titre="10. Contact">
        <p>
          Pour toute question relative aux présentes conditions, contactez-nous à{' '}
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

export default CGUPage
