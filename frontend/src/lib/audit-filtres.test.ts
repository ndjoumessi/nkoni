import { describe, expect, it } from 'vitest'
import { construireFiltresAudit } from './audit-filtres'

/**
 * Contrat des paramètres du journal d'audit : la sélection d'une date « Du »/« Au » dans le
 * DatePicker doit produire des bornes de requête INCLUSIVES (journée entière). Ces cas
 * verrouillent le mapping état → query params qui pilote le filtrage effectif (vérifié
 * de bout en bout côté serveur : `dateAction` `gte`/`lte`).
 */
describe('construireFiltresAudit', () => {
  it('« Du » seul filtre à partir du début de journée (borne basse incluse)', () => {
    const params = construireFiltresAudit({ page: 1, dateDebut: '2026-05-01' })
    expect(params.dateDebut).toBe('2026-05-01T00:00:00')
    expect(params.dateFin).toBeUndefined()
    expect(params.page).toBe(1)
  })

  it('« Au » seul filtre jusqu’à la fin de journée (borne haute incluse)', () => {
    const params = construireFiltresAudit({ page: 1, dateFin: '2026-03-31' })
    expect(params.dateFin).toBe('2026-03-31T23:59:59')
    expect(params.dateDebut).toBeUndefined()
  })

  it('« Du » + « Au » combinés bornent la plage aux deux extrémités incluses', () => {
    const params = construireFiltresAudit({
      page: 2,
      dateDebut: '2026-03-01',
      dateFin: '2026-06-30',
    })
    expect(params.dateDebut).toBe('2026-03-01T00:00:00')
    expect(params.dateFin).toBe('2026-06-30T23:59:59')
    expect(params.page).toBe(2)
  })

  it('sans date, aucune borne n’est envoyée (les clés vides sont omises)', () => {
    const params = construireFiltresAudit({ page: 1, dateDebut: '', dateFin: '' })
    expect(params.dateDebut).toBeUndefined()
    expect(params.dateFin).toBeUndefined()
    expect('dateDebut' in params).toBe(false)
    expect('dateFin' in params).toBe(false)
  })

  it('conserve les autres filtres (entité, acteur) et les omet s’ils sont vides', () => {
    const avec = construireFiltresAudit({
      page: 1,
      entiteType: 'Membre',
      acteurId: 'u-123',
    })
    expect(avec.entiteType).toBe('Membre')
    expect(avec.acteurId).toBe('u-123')

    const sans = construireFiltresAudit({ page: 1, entiteType: '', acteurId: '' })
    expect('entiteType' in sans).toBe(false)
    expect('acteurId' in sans).toBe(false)
  })
})
