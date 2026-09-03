/**
 * ABD Bank Manager — MF.14 Bank Statistics
 * Computes metrics for a bank's patches.
 */

import { getParameterSchema, hasParameterSchema } from './modelRegistry.js';

/**
 * @param {Array} patches - Array of patch objects
 * @param {object|null} contract - Model contract (optional, for parameter stats)
 * @returns {object} Statistics object
 */
export function computeBankStats(patches, contract = null) {
  if (!patches || patches.length === 0) {
    return {
      total: 0, capacity: contract?.bankCapacity || 0,
      categories: {}, noCategory: 0, favorites: 0, favPct: 0,
      avgNameLen: 0, shortestName: '', longestName: '',
      genericNames: [], noName: 0,
      totalDataBytes: 0, avgDataBytes: 0,
      parameterStats: null,
    };
  }

  const capacity = contract?.bankCapacity || patches.length;

  // Category distribution
  const categories = {};
  let noCategory = 0;
  let favorites = 0;

  // Name stats
  let totalNameLen = 0;
  let shortestName = patches[0]?.name || '';
  let longestName = patches[0]?.name || '';
  const genericNames = [];
  let noName = 0;

  // Data size
  let totalDataBytes = 0;

  for (const p of patches) {
    // Categories
    const cat = p.category || '';
    if (!cat || cat === 'Other') {
      noCategory++;
    } else {
      categories[cat] = (categories[cat] || 0) + 1;
    }

    // Favorites
    if (p.isFavorite) favorites++;

    // Names
    const name = (p.name || '').trim();
    totalNameLen += name.length;
    if (name.length < shortestName.length) shortestName = name;
    if (name.length > longestName.length) longestName = name;
    if (!name) {
      noName++;
    } else if (/^P\d+$/i.test(name) || /^Init$/i.test(name) || /^Default$/i.test(name) || /^Untitled$/i.test(name)) {
      genericNames.push(name);
    }

    // Data size
    const raw = p.rawData instanceof Uint8Array ? p.rawData : new Uint8Array(p.rawData || []);
    totalDataBytes += raw.length;
  }

  // Parameter stats (if schema available via modelRegistry)
  let parameterStats = null;
  if (contract?.modelId && hasParameterSchema(contract.modelId)) {
    try {
      const schema = getParameterSchema(contract.modelId);
      if (schema) {
        parameterStats = computeParameterStats(patches, schema);
      }
    } catch {
      // Schema not available
    }
  }

  return {
    total: patches.length,
    capacity,
    fillPct: Math.round((patches.length / capacity) * 100),
    categories,
    noCategory,
    favorites,
    favPct: Math.round((favorites / patches.length) * 100),
    avgNameLen: Math.round(totalNameLen / patches.length),
    shortestName,
    longestName,
    genericNames,
    noName,
    totalDataBytes,
    avgDataBytes: Math.round(totalDataBytes / patches.length),
    parameterStats,
  };
}

function computeParameterStats(patches, schema) {
  // Use schema.getTable(rawData) to get [{ name, value }] rows per patch
  // Collect all parameter names from the first patch
  const firstRaw = patches[0]?.rawData;
  if (!firstRaw) return null;
  const firstRows = schema.getTable(firstRaw instanceof Uint8Array ? firstRaw : new Uint8Array(firstRaw || []));
  if (!firstRows || firstRows.length === 0) return null;

  // Initialize accumulators per parameter
  const ranges = firstRows.map(row => ({
    name: row.name,
    min: 255,
    max: 0,
    sum: 0,
    count: 0,
    values: new Set(),
  }));

  for (const p of patches) {
    const raw = p.rawData instanceof Uint8Array ? p.rawData : new Uint8Array(p.rawData || []);
    const rows = schema.getTable(raw);
    for (let i = 0; i < ranges.length && i < rows.length; i++) {
      const val = rows[i].value ?? rows[i].rawByte ?? 0;
      ranges[i].min = Math.min(ranges[i].min, val);
      ranges[i].max = Math.max(ranges[i].max, val);
      ranges[i].sum += val;
      ranges[i].count++;
      ranges[i].values.add(val);
    }
  }

  // Find most variable (most unique values) and least variable
  const withVariability = ranges
    .filter(r => r.count > 0)
    .map(r => ({
      name: r.name,
      min: r.min,
      max: r.max,
      avg: Math.round(r.sum / r.count),
      uniqueValues: r.values.size,
    }));

  withVariability.sort((a, b) => b.uniqueValues - a.uniqueValues);

  return {
    mostVariable: withVariability.slice(0, 5),
    leastVariable: withVariability.slice(-5).reverse(),
  };
}
