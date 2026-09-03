/**
 * ABD Bank Manager — Pure Search & Filter (P1.2)
 *
 * Funciones puras e inmutables para búsqueda y filtrado de patches.
 * No external dependencies, deterministic, no side effects.
 */

export function searchPatches(library, query) {
  if (!library || !Array.isArray(library.banks)) return [];

  const q = (query?.text || '').toLowerCase().trim();
  const modelId = query?.modelId;
  const category = query?.category;
  const favoritesOnly = query?.favoritesOnly === true;
  const minRating = typeof query?.minRating === 'number' ? query.minRating : 0;

  const results = [];

  for (const bank of library.banks) {
    if (!bank.patches || !Array.isArray(bank.patches)) continue;

    if (modelId && bank.modelId !== modelId) continue;

    for (const patch of bank.patches) {
      if (category && patch.category !== category) continue;
      if (favoritesOnly && !patch.isFavorite) continue;
      if (patch.rating < minRating) continue;

      let matches = q === '';
      if (!matches) {
        const searchable = [
          patch.name,
          patch.author,
          patch.notes,
          ...(patch.tags || [])
        ].join(' ').toLowerCase();
        matches = searchable.includes(q);
      }

      if (matches) {
        results.push({
          patch,
          bankId: bank.id,
          bankName: bank.name
        });
      }
    }
  }

  return results;
}

export function getFilteredPatches(library, filters) {
  if (!library || !Array.isArray(library.banks)) return [];

  const {
    modelId,
    category,
    author,
    tags,
    favoritesOnly,
    sortBy = 'name',
    sortOrder = 'asc'
  } = filters || {};

  const results = [];

  for (const bank of library.banks) {
    if (!bank.patches || !Array.isArray(bank.patches)) continue;

    if (modelId && bank.modelId !== modelId) continue;

    for (const patch of bank.patches) {
      if (category && patch.category !== category) continue;
      if (author && patch.author !== author) continue;
      if (tags && tags.length && !tags.some(t => (patch.tags || []).includes(t))) continue;
      if (favoritesOnly && !patch.isFavorite) continue;

      results.push(patch);
    }
  }

  results.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'date':
        cmp = new Date(a.modifiedDate) - new Date(b.modifiedDate);
        break;
      case 'category':
        cmp = a.category.localeCompare(b.category);
        break;
      case 'rating':
        cmp = a.rating - b.rating;
        break;
      default:
        cmp = a.name.localeCompare(b.name);
    }
    return sortOrder === 'desc' ? -cmp : cmp;
  });

  return results;
}

export function createSearcher() {
  return {
    searchPatches: (library, query) => searchPatches(library, query),
    getFilteredPatches: (library, filters) => getFilteredPatches(library, filters)
  };
}