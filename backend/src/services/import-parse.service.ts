import ExcelJS from 'exceljs'

/**
 * Parsing SERVEUR des fichiers d'import de membres (audit m6) — le parseur `xlsx` (SheetJS, CVE)
 * QUITTE le navigateur : le fichier téléversé est parsé ici avec `exceljs` (déjà utilisé pour les
 * exports) pour le .xlsx, et un parseur CSV minimal pour le .csv. Retourne un tableau de lignes
 * brutes `{ entetes, lignes }` ; le mapping colonnes → champs + l'aperçu + le commit restent côté
 * front (données JSON, aucun parseur). Borné à `MAX_LIGNES` (anti-DoS, cohérent avec l'import).
 */
const MAX_LIGNES = 1000

export interface FichierImportParse {
  entetes: string[]
  lignes: string[][]
}

/** Parseur CSV minimal : gère les guillemets (doublés) et les séparateurs `,`/`;`. */
function parserCsv(texte: string): string[][] {
  const out: string[][] = []
  for (const rawLigne of texte.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (rawLigne === '') continue
    const cells: string[] = []
    let cur = ''
    let dansGuillemets = false
    for (let i = 0; i < rawLigne.length; i++) {
      const ch = rawLigne[i]
      if (dansGuillemets) {
        if (ch === '"') {
          if (rawLigne[i + 1] === '"') {
            cur += '"'
            i++
          } else dansGuillemets = false
        } else cur += ch
      } else if (ch === '"') {
        dansGuillemets = true
      } else if (ch === ',' || ch === ';') {
        cells.push(cur)
        cur = ''
      } else cur += ch
    }
    cells.push(cur)
    out.push(cells)
  }
  return out
}

/** Parseur XLSX via exceljs → tableau de tableaux (aligné par numéro de colonne, `cell.text`). */
async function parserXlsx(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  // Cast `any` : les types d'exceljs attendent un `Buffer` non générique, alors que @types/node
  // récent le rend `Buffer<ArrayBufferLike>` (mismatch purement nominal — c'est un Buffer au runtime).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const out: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      vals[col - 1] = String(cell.text ?? '')
    })
    out.push(Array.from(vals, (v) => v ?? ''))
  })
  return out
}

/**
 * Parse un fichier d'import (.xlsx ou .csv) en `{ entetes, lignes }`. Détection par extension du
 * nom (repli xlsx). Trim des cellules ; lignes entièrement vides retirées ; bornage `MAX_LIGNES`.
 */
export async function parserFichierImport(
  buffer: Buffer,
  nomFichier: string,
): Promise<FichierImportParse> {
  const estCsv = /\.csv$/i.test(nomFichier)
  const aoa = estCsv ? parserCsv(buffer.toString('utf8')) : await parserXlsx(buffer)
  const entetes = (aoa[0] ?? []).map((c) => c.trim())
  const lignes = aoa
    .slice(1)
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''))
    .slice(0, MAX_LIGNES)
  return { entetes, lignes }
}
