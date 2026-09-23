import { describe, it, expect } from 'vitest'
import { STATUS_CODES } from 'node:http'
import { ErreurMetier } from '../src/lib/erreur-metier'
import { t, type Langue } from '../src/lib/i18n'
import { QuotaStockageDepasseError } from '../src/services/capacites-organisation.service'
import {
  DocumentIntrouvableError,
  AccesDocumentRefuseError,
} from '../src/services/document.service'

/**
 * Base des refus métier (ADR-0001). Ce qui est verrouillé ici est le CONTRAT que le gestionnaire
 * d'erreur global consomme — statut, clé, paramètres — et surtout l'invariant qui protège
 * l'utilisateur : le message TECHNIQUE d'une erreur ne doit jamais sortir.
 *
 * Le câblage HTTP, lui, est prouvé par les tests de route EXISTANTS, non modifiés : c'est tout
 * l'argument de la migration incrémentale, et un test qu'on ne retouche pas est un test qui ne
 * ment pas.
 */
describe('ErreurMetier — le contrat que lit le gestionnaire global', () => {
  it('porte son statut et sa clé, et se nomme d’après la sous-classe construite', () => {
    const err = new DocumentIntrouvableError()
    expect(err.statutHttp).toBe(404)
    expect(err.cleMessage).toBe('documents.introuvable')
    // `new.target` : plus besoin de recopier `this.name = '…'` dans chaque classe.
    expect(err.name).toBe('DocumentIntrouvableError')
    expect(err).toBeInstanceOf(ErreurMetier)
    expect(err).toBeInstanceOf(Error)
  })

  it('un refus est toujours 4xx — un 5xx n’est pas un refus mais une panne', () => {
    for (const err of [
      new DocumentIntrouvableError(),
      new AccesDocumentRefuseError(),
      new QuotaStockageDepasseError(1, 2),
    ]) {
      expect(err.statutHttp).toBeGreaterThanOrEqual(400)
      expect(err.statutHttp).toBeLessThan(500)
      // Le gestionnaire dérive le champ `error` du statut : il doit exister pour chacun.
      expect(STATUS_CODES[err.statutHttp]).toBeTruthy()
    }
  })

  it('sans interpolation, aucun paramètre — le défaut ne fabrique rien', () => {
    expect(new DocumentIntrouvableError().parametres('FR')).toBeUndefined()
  })

  it('les paramètres se FORMATENT dans la langue du lecteur', () => {
    // C'est la raison d'être du paramètre `langue` : figer les paramètres au constructeur
    // produirait un message à moitié traduit (« 500 Mo » servi à un lecteur anglophone).
    const err = new QuotaStockageDepasseError(500 * 1024 * 1024, 500 * 1024 * 1024)
    const fr = err.parametres('FR')
    const en = err.parametres('EN')
    expect(fr?.['utilise']).toContain('Mo')
    expect(en?.['utilise']).toContain('MB')
    expect(fr?.['utilise']).not.toBe(en?.['utilise'])
  })

  it('le message rendu est TRADUIT, et ne contient jamais le message technique', () => {
    // Invariant protecteur : `Error.message` est écrit pour les logs (il porte des octets bruts,
    // des identifiants, parfois des détails d'implémentation). Le client ne voit que la clé.
    const err = new QuotaStockageDepasseError(524_288_000, 524_288_000)
    expect(err.message).toContain('octets')
    for (const langue of ['FR', 'EN'] as Langue[]) {
      const rendu = t(langue, err.cleMessage, err.parametres(langue))
      expect(rendu).not.toBe(err.message)
      expect(rendu).not.toContain('524288000')
      expect(rendu.length).toBeGreaterThan(0)
    }
  })
})
