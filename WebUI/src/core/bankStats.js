/**
 * ABD Bank Manager — MF.14 Bank Statistics
 * Computes metrics for a bank's patches.
 */

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

  // Parameter stats (if schema available)
  let parameterStats = null;
  if (contract && contract.getParameterSchema) {
    try {
      const schema = contract.getParameterSchema();
      if (schema && schema.parameters) {
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
  // Track min/max/avg for each parameter offset
  const paramCount = schema.parameters?.length || 0;
  if (paramCount === 0) return null;

  const ranges = schema.parameters.map((param, i) => ({
    name: param.name,
    min: 255,
    max: 0,
    sum: 0,
    count: 0,
    values: new Set(),
  }));

  for (const p of patches) {
    const raw = p.rawData instanceof Uint8Array ? p.rawData : new Uint8Array(p.rawData || []);
    for (let i = 0; i < paramCount && i < raw.length; i++) {
      const val = raw[i];
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
