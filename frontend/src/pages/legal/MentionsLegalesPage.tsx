import { Link } from 'react-router-dom'
import { PageLegale, SectionLegale, Placeholder } from './PageLegale'
import { CONTACT_EMAIL } from '@/lib/contact'

/**
 * Mentions légales (obligation LCEN, art. 6-III) — bloquant GA 0.3. Complète CGU et
 * confidentialité : identifie l'ÉDITEUR, le DIRECTEUR DE LA PUBLICATION et les HÉBERGEURS.
 *
 * Sources, et rien d'autre — document opposable, on ne publie pas de valeur fabriquée :
 * - éditeur : attestation d'immatriculation au Registre national des entreprises du 10/09/2026
 *   (dénomination DJOUMESSI, siège 71 rue de Rome, 13001 Marseille). SIREN, forme juridique,
 *   prénom et téléphone NE figurent PAS dans les données lues (page 1 = image) → Placeholders.
 * - hébergeurs : identités relevées sur leurs propres CGU/politiques (12/09/2026) — Vercel Inc.
 *   (frontend + stockage des pièces jointes, Vercel Blob) et Railway Corporation (API + base
 *   PostgreSQL). Aucun des deux ne publie de numéro de téléphone : on renvoie à leur site.
 *   Resend et Sentry sont des SOUS-TRAITANTS, pas des hébergeurs : ils relèvent de la page
 *   confidentialité, pas d'ici.
 */
export function MentionsLegalesPage() {
  const lien = 'text-brass underline-offset-2 hover:underline'
  return (
    <PageLegale titre="Mentions légales" majLe="12 septembre 2026">
      <SectionLegale titre="1. Éditeur du service">
        <p>
          Le service NKONI, accessible à l’adresse nkoni.vercel.app, est édité par l’entreprise
          DJOUMESSI, immatriculée au Registre national des entreprises sous le numéro{' '}
          <Placeholder>NUMÉRO SIREN</Placeholder>.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            forme juridique : <Placeholder>FORME JURIDIQUE</Placeholder> ;
          </li>
          <li>siège : 71 rue de Rome, 13001 Marseille, France ;</li>
          <li>
            e-mail :{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className={lien}>
              {CONTACT_EMAIL}
            </a>{' '}
            ;
          </li>
          <li>
            téléphone : <Placeholder>NUMÉRO DE TÉLÉPHONE</Placeholder>.
          </li>
        </ul>
      </SectionLegale>

      <SectionLegale titre="2. Directeur de la publication">
        <p>
          <Placeholder>PRÉNOM</Placeholder> DJOUMESSI, en qualité d’exploitant de l’entreprise
          éditrice.
        </p>
      </SectionLegale>

      <SectionLegale titre="3. Hébergement">
        <p>Le service est hébergé par les prestataires suivants :</p>
        <p className="font-medium text-foreground">
          Application web et stockage des pièces jointes
        </p>
        <p>
          Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis —{' '}
          <a href="https://vercel.com" className={lien} rel="noopener noreferrer" target="_blank">
            vercel.com
          </a>
        </p>
        <p className="font-medium text-foreground">Serveur applicatif et base de données</p>
        <p>
          Railway Corporation, 548 Market St PMB 68956, San Francisco, CA 94104, États-Unis —{' '}
          <a href="https://railway.com" className={lien} rel="noopener noreferrer" target="_blank">
            railway.com
          </a>
        </p>
      </SectionLegale>

      <SectionLegale titre="4. Propriété intellectuelle">
        <p>
          Le nom NKONI, son logo, son interface et son code sont la propriété de l’éditeur. Toute
          reproduction ou réutilisation sans autorisation est interdite.
        </p>
        <p>
          Les données saisies par une organisation dans son espace restent sa propriété, dans les
          conditions prévues par les{' '}
          <Link to="/cgu" className={lien}>
            conditions générales d’utilisation
          </Link>
          .
        </p>
      </SectionLegale>

      <SectionLegale titre="5. Données personnelles">
        <p>
          Le traitement des données personnelles, les sous-traitants auxquels nous faisons appel et
          l’exercice de vos droits sont décrits dans notre{' '}
          <Link to="/confidentialite" className={lien}>
            politique de confidentialité
          </Link>
          .
        </p>
      </SectionLegale>
    </PageLegale>
  )
}

export default MentionsLegalesPage
