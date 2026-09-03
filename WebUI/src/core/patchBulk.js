/**
 * ABD Bank Manager — Patch Bulk Operations
 *
 * Renombrado masivo con plantillas y export/import de nombres vía CSV.
 * Módulo puro (sin DOM ni almacenamiento): todo testeable en aislamiento.
 *
 * Plantilla de renombrado — placeholders disponibles:
 *   {name}     nombre actual del patch (o vacío)
 *   {index}    índice del patch dentro del banco (1-based)
 *   {address}  dirección de programa según el contrato (ej. "A1", "A.01")
 *   {model}    displayName del contrato (ej. "Korg MS2000")
 *   {bank}     nombre del banco
 *
 * CSV de nombres — columnas:
 *   bankId, bankName, index, name, address
 * El import empareja por (bankId, index), que es lo único estable.
 */

const CSV_PLACEHOLDERS = ['{name}', '{index}', '{address}', '{model}', '{bank}'];

/**
 * Sustituye los placeholders de la plantilla con los datos del patch.
 *
 * @param {string} template Plantilla (ej. "BRASS {address}")
 * @param {object} ctx { name, index, contract, bankName } — contract opcional
 * @returns {string}
 */
export function applyRenameTemplate(template, ctx) {
  const { name = '', index = 0, contract = null, bankName = '' } = ctx;
  const address = contract && typeof contract.getProgramAddress === 'function'
    ? contract.getProgramAddress(index)
    : String(index + 1);
  const model = contract?.displayName || '';

  return template
    .replace(/\{name\}/g, name)
    .replace(/\{index\}/g, String(index + 1))
    .replace(/\{address\}/g, address)
    .replace(/\{model\}/g, model)
    .replace(/\{bank\}/g, bankName);
}

/**
 * Aviso: una plantilla sin placeholders produce nombres idénticos para todos
 * los patches. Devuelve true si la plantilla es válida para N patches.
 *
 * @param {string} template
 * @param {number} count
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateRenameTemplate(template, count) {
  const t = (template || '').trim();
  if (!t) return { valid: false, reason: 'Empty template' };
  if (count > 1 && !CSV_PLACEHOLDERS.some(p => t.includes(p))) {
    return { valid: false, reason: `Template contains no placeholders: ${count} patches would receive the same name` };
  }
  return { valid: true };
}

// ─── CSV ───

function escapeCsv(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serializa patches a CSV de nombres.
 *
 * @param {Array<{ bankId: string, bankName: string, index: number, name: string, contract?: object }>} rows
 * @returns {string}
 */
export function patchesToCsv(rows) {
  const header = 'bankId,bankName,index,name,address';
  const lines = rows.map(r => {
    const address = r.contract && typeof r.contract.getProgramAddress === 'function'
      ? r.contract.getProgramAddress(r.index)
      : '';
    return [r.bankId, r.bankName, r.index, r.name, address]
      .map(escapeCsv)
      .join(',');
  });
  return [header, ...lines].join('\n');
}

/**
 * Parse a CSV de nombres. Devuelve las filas con (bankId, index, name) y la
 * lista de errores de formato (fila ignorada, sin abortar el resto).
 *
 * La cabecera es tolerante (para CSVs generados fuera, p. ej. editados en
 * Excel): las columnas se detectan por nombre (case-insensitive, cualquier
 * orden) y las columnas extra se ignoran. Obligatorias: bankId, index, name.
 * Opcionales (se leen si están, si no quedan vacías): bankName, address.
 *
 * @param {string} text
 * @returns {{ rows: Array<{ bankId: string, bankName: string, index: number, name: string }>, errors: string[] }}
 */
export function parseNamesCsv(text) {
  const errors = [];
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');

  if (lines.length === 0) return { rows: [], errors: ['Empty CSV'] };

  const header = parseCsvLine(lines[0]);
  if (!header) return { rows: [], errors: ['Unreadable header (unclosed quotes)'] };

  const col = {}; // nombre normalizado → índice de columna
  header.forEach((name, i) => { col[name.trim().toLowerCase()] = i; });

  const required = ['bankid', 'index', 'name'];
  const missing = required.filter(k => !(k in col));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Cabecera incompleta. Faltan: ${missing.join(', ')} (necesarias: bankId, index, name)`]
    };
  }

  const get = (row, key) => (key in col && row[col[key]] !== undefined) ? row[col[key]] : '';

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parsed = parseCsvLine(lines[i]);
    if (!parsed) {
      errors.push(`Línea ${i + 1}: skipped (unclosed quotes)`);
      continue;
    }
    const bankId = get(parsed, 'bankid');
    const index = parseInt(get(parsed, 'index'), 10);
    if (!bankId || Number.isNaN(index)) {
      errors.push(`Línea ${i + 1}: skipped (invalid bankId or index)`);
      continue;
    }
    rows.push({ bankId, bankName: get(parsed, 'bankname'), index, name: get(parsed, 'name') });
  }
  return { rows, errors };
}

/**
 * Divide una línea CSV respetando comillas dobles.
 * @param {string} line
 * @returns {string[] | null}
 */
export function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return inQuotes ? null : fields;
}
