/**
 * MF.17 — Advanced Global Search Engine
 * Searches across patches, banks, models, hex data, and parameters.
 * Returns grouped, ranked results with highlight info.
 */

import icons from '../ui/icons.js';

import { getAllBanks, getAllPatches } from '../store/persistence.js';
import { MODEL_CONTRACTS, getModelContract } from '../contracts/modelContracts.js';
import { getParameterSchema, hasParameterSchema, getModelThumbnail } from './modelRegistry.js';
import { spacedHex } from './hexDump.js';

/**
 * @typedef {Object} SearchResult
 * @property {string} type - 'patch' | 'bank' | 'model'
 * @property {string} id
 * @property {string} name
 * @property {string} matchField - which field matched
 * @property {string} matchSnippet - text snippet with highlights
 * @property {string} context - e.g. "ROM 1A → Yamaha DX7"
 * @property {number} score - relevance score (lower = better)
 * @property {Object} [nav] - navigation info { level, manufacturer, modelId, bankId, patchId }
 * @property {string} [thumbnail]
 * @property {string} [badge]
 */

const SCORE_EXACT_NAME = 0;
const SCORE_NAME_STARTS = 1;
const SCORE_NAME_CONTAINS = 2;
const SCORE_CATEGORY = 3;
const SCORE_AUTHOR = 4;
const SCORE_NOTES = 5;
const SCORE_BANK_NAME = 6;
const SCORE_HEX = 7;
const SCORE_PARAM_NAME = 8;
const SCORE_PARAM_VALUE = 9;
const SCORE_MODEL = 10;

/**
 * Highlight matching text in a string
 * @param {string} text
 * @param {string} query
 * @returns {string} HTML with <mark> tags around matches
 */
export function highlightMatch(text, query) {
  if (!query || !text) return escHtml(text || '');
  const escapedQuery = escHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark>$1</mark>');
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

/**
 * Search across all data
 * @param {string} query - search string
 * @returns {Promise<SearchResult[]>}
 */
export async function globalSearch(query) {
  if (!query || query.length < 1) return [];

  const q = query.toLowerCase().trim();
  const results = [];

  // 1. Search models
  for (const contract of MODEL_CONTRACTS) {
    const name = (contract.displayName || '').toLowerCase();
    if (name.includes(q)) {
      const score = name === q ? SCORE_EXACT_NAME
        : name.startsWith(q) ? SCORE_NAME_STARTS
        : SCORE_MODEL;
      results.push({
        type: 'model',
        id: contract.modelId,
        name: contract.displayName,
        matchField: 'modelo',
        matchSnippet: highlightMatch(contract.displayName, query),
        context: contract.manufacturer,
        score,
        nav: { level: 'models', manufacturer: contract.manufacturer, modelId: contract.modelId },
        thumbnail: getModelThumbnail(contract.modelId),
        badge: `${contract.bankCapacity} patches`
      });
    }
  }

  // 2. Search banks (MF.7: include description, tags, author, notes, license)
  const allBanks = await getAllBanks();
  for (const bank of allBanks) {
    const bankName = (bank.name || '').toLowerCase();
    const contract = getModelContract(bank.modelId);

    // Build searchable text from all MF.7 fields
    const searchableFields = [
      bank.name,
      bank.description,
      bank.bankAuthor,
      bank.source,
      bank.license,
      bank.bankNotes,
      bank.firmwareCompat,
      bank.knownIssues,
      ...(bank.tags || []),
    ].filter(Boolean).join(' ').toLowerCase();

    if (searchableFields.includes(q)) {
      // Determine which field matched
      let matchField = 'bank';
      if ((bank.description || '').toLowerCase().includes(q)) matchField = 'description';
      else if ((bank.bankAuthor || '').toLowerCase().includes(q)) matchField = 'autor';
      else if ((bank.tags || []).some(t => t.toLowerCase().includes(q))) matchField = 'tags';
      else if ((bank.bankNotes || '').toLowerCase().includes(q)) matchField = 'notas';
      else if ((bank.license || '').toLowerCase().includes(q)) matchField = 'licencia';

      const score = bankName === q ? SCORE_EXACT_NAME
        : bankName.startsWith(q) ? SCORE_NAME_STARTS
        : SCORE_BANK_NAME;
      results.push({
        type: 'bank',
        id: bank.id,
        name: bank.name,
        matchField,
        matchSnippet: highlightMatch(bank.name, query),
        context: `${contract?.displayName || bank.modelId}${bank.description ? ' · ' + bank.description.slice(0, 60) : ''}`,
        score,
        nav: { level: 'patches', manufacturer: bank.manufacturer || contract?.manufacturer, modelId: bank.modelId, bankId: bank.id },
        thumbnail: getModelThumbnail(bank.modelId),
        badge: bank.isFactory ? `${icons.lock} Factory` : `${icons.user} User`
      });
    }
  }

  // 3. Search patches
  const allPatches = await getAllPatches();
  // Build bank lookup for context
  const bankMap = new Map(allBanks.map(b => [b.id, b]));
  const contractMap = new Map(MODEL_CONTRACTS.map(c => [c.modelId, c]));

  for (const patch of allPatches) {
    const bank = bankMap.get(patch.bankId);
    const contract = bank ? contractMap.get(bank.modelId) : null;
    const contextStr = `${bank?.name || '?'} → ${contract?.displayName || bank?.modelId || '?'}`;

    // Name match
    const patchName = (patch.name || '').toLowerCase();
    if (patchName.includes(q)) {
      const score = patchName === q ? SCORE_EXACT_NAME
        : patchName.startsWith(q) ? SCORE_NAME_STARTS
        : SCORE_NAME_CONTAINS;
      results.push({
        type: 'patch',
        id: patch.id,
        name: patch.name,
        matchField: 'name',
        matchSnippet: highlightMatch(patch.name, query),
        context: contextStr,
        score,
        nav: { level: 'patches', manufacturer: bank?.manufacturer || contract?.manufacturer, modelId: bank?.modelId, bankId: patch.bankId, patchId: patch.id },
        thumbnail: bank ? getModelThumbnail(bank.modelId) : null,
        badge: patch.category
      });
      continue; // Don't double-count
    }

    // Category match
    if (patch.category && patch.category.toLowerCase().includes(q)) {
      results.push({
        type: 'patch',
        id: patch.id,
        name: patch.name,
        matchField: 'category',
        matchSnippet: highlightMatch(patch.category, query),
        context: contextStr,
        score: SCORE_CATEGORY,
        nav: { level: 'patches', manufacturer: bank?.manufacturer || contract?.manufacturer, modelId: bank?.modelId, bankId: patch.bankId, patchId: patch.id },
        thumbnail: bank ? getModelThumbnail(bank.modelId) : null,
        badge: patch.category
      });
      continue;
    }

    // Author match
    if (patch.author && patch.author.toLowerCase().includes(q)) {
      results.push({
        type: 'patch',
        id: patch.id,
        name: patch.name,
        matchField: 'autor',
        matchSnippet: highlightMatch(patch.author, query),
        context: contextStr,
        score: SCORE_AUTHOR,
        nav: { level: 'patches', manufacturer: bank?.manufacturer || contract?.manufacturer, modelId: bank?.modelId, bankId: patch.bankId, patchId: patch.id },
        thumbnail: bank ? getModelThumbnail(bank.modelId) : null,
        badge: patch.category
      });
      continue;
    }

    // Notes match
    if (patch.notes && patch.notes.toLowerCase().includes(q)) {
      results.push({
        type: 'patch',
        id: patch.id,
        name: patch.name,
        matchField: 'notas',
        matchSnippet: highlightMatch(patch.notes, query),
        context: contextStr,
        score: SCORE_NOTES,
        nav: { level: 'patches', manufacturer: bank?.manufacturer || contract?.manufacturer, modelId: bank?.modelId, bankId: patch.bankId, patchId: patch.id },
        thumbnail: bank ? getModelThumbnail(bank.modelId) : null,
        badge: patch.category
      });
      continue;
    }

    // Hex data match
    const rawData = patch.rawData instanceof Uint8Array ? patch.rawData : new Uint8Array(patch.rawData || []);
    if (rawData.length > 0) {
      const hexStr = spacedHex(rawData).toLowerCase();
      if (hexStr.includes(q) || hexStr.replace(/\s/g, '').includes(q.replace(/\s/g, '').replace(/0x/g, ''))) {
        // Find position for snippet
        const cleanQ = q.replace(/0x/g, '').replace(/\s/g, '');
        const cleanHex = hexStr.replace(/\s/g, '');
        const pos = cleanHex.indexOf(cleanQ);
        const snippet = pos >= 0
          ? hexStr.substring(Math.max(0, pos * 3 - 6), pos * 3 + cleanQ.length * 3 + 9)
          : hexStr.substring(0, 40) + '…';
        results.push({
          type: 'patch',
          id: patch.id,
          name: patch.name,
          matchField: 'hex',
          matchSnippet: `<code>${highlightMatch(snippet.trim(), query)}</code>`,
          context: contextStr,
          score: SCORE_HEX,
          nav: { level: 'patches', manufacturer: bank?.manufacturer || contract?.manufacturer, modelId: bank?.modelId, bankId: patch.bankId, patchId: patch.id },
          thumbnail: bank ? getModelThumbnail(bank.modelId) : null,
          badge: patch.category
        });
        continue;
      }
    }

    // Parameter search (if schema available)
    if (bank && hasParameterSchema(bank.modelId)) {
      const schema = getParameterSchema(bank.modelId);
      const params = schema.getTable(rawData);
      for (const p of params) {
        const paramName = (p.name || '').toLowerCase();
        const paramDesc = (p.description || '').toLowerCase();
        const paramVal = String(p.displayValue ?? p.value ?? p.rawByte ?? '').toLowerCase();

        if (paramName.includes(q) || paramDesc.includes(q)) {
          results.push({
            type: 'patch',
            id: patch.id,
            name: patch.name,
            matchField: 'parameter',
            matchSnippet: `${highlightMatch(p.name, query)} = ${escHtml(String(p.displayValue ?? p.value ?? p.rawByte ?? '—'))}`,
            context: contextStr,
            score: SCORE_PARAM_NAME,
            nav: { level: 'patches', manufacturer: bank?.manufacturer || contract?.manufacturer, modelId: bank?.modelId, bankId: patch.bankId, patchId: patch.id },
            thumbnail: bank ? getModelThumbnail(bank.modelId) : null,
            badge: p.name
          });
          break; // One param match per patch is enough
        }

        if (paramVal.includes(q)) {
          results.push({
            type: 'patch',
            id: patch.id,
            name: patch.name,
            matchField: 'valor',
            matchSnippet: `${escHtml(p.name)} = <mark>${highlightMatch(String(p.displayValue ?? p.value ?? p.rawByte ?? ''), query)}</mark>`,
            context: contextStr,
            score: SCORE_PARAM_VALUE,
            nav: { level: 'patches', manufacturer: bank?.manufacturer || contract?.manufacturer, modelId: bank?.modelId, bankId: patch.bankId, patchId: patch.id },
            thumbnail: bank ? getModelThumbnail(bank.modelId) : null,
            badge: p.name
          });
          break;
        }
      }
    }
  }

  // Sort by score, then alphabetically
  results.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));

  // Limit to 50 results for performance
  return results.slice(0, 50);
}

/**
 * Get result count per type
 * @param {SearchResult[]} results
 * @returns {{ models: number, banks: number, patches: number }}
 */
export function countByType(results) {
  const counts = { models: 0, banks: 0, patches: 0 };
  for (const r of results) {
    if (counts[r.type] !== undefined) counts[r.type]++;
  }
  return counts;
}
