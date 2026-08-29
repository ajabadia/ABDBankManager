/**
 * MF.7 — Bank Data Sheet Panel
 *
 * Expandible panel showing bank metadata: description, author, source,
 * license, tags, notes, firmware compatibility, known issues, and history.
 * All fields are editable inline.
 */
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

const TAG_SUGGESTIONS = [
  'factory', 'user', 'community', 'commercial', 'free',
  'pads', 'leads', 'bass', 'keys', 'strings', 'brass',
  'arps', 'sequences', 'drums', 'perc', 'fx', 'atmos',
  'classic', 'vintage', 'modern', 'experimental',
];

/**
 * Render the bank data sheet panel HTML.
 * @param {object} bank - Bank data object
 * @returns {string} HTML string
 */
export function renderBankDataSheet(bank) {
  const tags = bank.tags || [];
  const tagsHtml = tags.map(t =>
    `<span class="bank-tag">${escHtml(t)} <button class="bank-tag-remove" data-tag="${escHtml(t)}">×</button></span>`
  ).join('');

  const historyRows = [];
  if (bank.lastImportDate) historyRows.push({ label: 'Última importación', value: formatDate(bank.lastImportDate) });
  if (bank.lastModifiedDate) historyRows.push({ label: 'Última modificación', value: formatDate(bank.lastModifiedDate) });
  if (bank.lastSentDate) historyRows.push({ label: 'Último envío', value: `${formatDate(bank.lastSentDate)}${bank.lastSentTarget ? ` → ${bank.lastSentTarget}` : ''}` });
  if (bank.creationDate) historyRows.push({ label: 'Creación', value: formatDate(bank.creationDate) });

  const historyHtml = historyRows.length > 0
    ? historyRows.map(r => `<div class="spec-field"><span class="spec-label">${r.label}</span><span class="spec-value">${escHtml(r.value)}</span></div>`).join('')
    : '<span class="spec-empty">Sin historial</span>';

  return `
    <div class="bank-datasheet" id="bank-datasheet">
      <div class="datasheet-header" id="datasheet-toggle">
        <span class="datasheet-title">📄 Ficha del banco</span>
        <span class="datasheet-arrow">▶</span>
      </div>
      <div class="datasheet-body collapsed" id="datasheet-body">
        <div class="datasheet-grid">
          <div class="datasheet-section">
            <div class="datasheet-section-title">Información</div>
            <div class="patch-info-field">
              <span class="patch-info-label">Descripción</span>
              <textarea class="patch-info-input datasheet-textarea" id="ds-description" placeholder="Describe este banco..." rows="2">${escHtml(bank.description || '')}</textarea>
            </div>
            <div class="patch-info-field">
              <span class="patch-info-label">Autor / Creador</span>
              <input class="patch-info-input" id="ds-bankAuthor" value="${escHtml(bank.bankAuthor || '')}" placeholder="Nombre del autor">
            </div>
            <div class="patch-info-field">
              <span class="patch-info-label">Fuente / Procedencia</span>
              <input class="patch-info-input" id="ds-source" value="${escHtml(bank.source || '')}" placeholder="Ej: Factory ROM, Importado de...">
            </div>
            <div class="patch-info-field">
              <span class="patch-info-label">Licencia</span>
              <input class="patch-info-input" id="ds-license" value="${escHtml(bank.license || '')}" placeholder="Ej: Freeware, MIT, Propietaria">
            </div>
          </div>

          <div class="datasheet-section">
            <div class="datasheet-section-title">Técnico</div>
            <div class="patch-info-field">
              <span class="patch-info-label">Firmware compatible</span>
              <input class="patch-info-input" id="ds-firmwareCompat" value="${escHtml(bank.firmwareCompat || '')}" placeholder="Ej: v1.4.4+, 2.0.7+">
            </div>
            <div class="patch-info-field">
              <span class="patch-info-label">Known issues</span>
              <textarea class="patch-info-input datasheet-textarea" id="ds-knownIssues" placeholder="Problemas conocidos..." rows="2">${escHtml(bank.knownIssues || '')}</textarea>
            </div>
          </div>

          <div class="datasheet-section">
            <div class="datasheet-section-title">Etiquetas</div>
            <div class="bank-tags" id="bank-tags">
              ${tagsHtml || '<span class="bank-tags-empty">Sin etiquetas</span>'}
            </div>
            <div class="bank-tags-add">
              <input class="patch-info-input" id="ds-new-tag" placeholder="Añadir tag..." style="width:120px;">
              <button class="btn btn-sm" id="ds-add-tag">+ Añadir</button>
            </div>
            <div class="bank-tag-suggestions" id="bank-tag-suggestions">
              ${TAG_SUGGESTIONS.filter(t => !tags.includes(t)).slice(0, 12).map(t =>
                `<button class="bank-tag-suggestion" data-tag="${t}">${t}</button>`
              ).join('')}
            </div>
          </div>

          <div class="datasheet-section">
            <div class="datasheet-section-title">Notas</div>
            <textarea class="patch-info-input datasheet-textarea" id="ds-bankNotes" placeholder="Notas libres del usuario..." rows="3">${escHtml(bank.bankNotes || '')}</textarea>
          </div>

          <div class="datasheet-section">
            <div class="datasheet-section-title">Historial</div>
            <div class="datasheet-history">${historyHtml}</div>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * Initialize data sheet event handlers after rendering.
 * @param {HTMLElement} container - The bank content element
 * @param {object} bank - Bank data
 * @param {function} updateFn - async (changes) => void to persist updates
 */
export function initDataSheetHandlers(container, bank, updateFn) {
  const toggle = container.querySelector('#datasheet-toggle');
  const body = container.querySelector('#datasheet-body');
  if (toggle && body) {
    toggle.onclick = () => {
      body.classList.toggle('collapsed');
      toggle.querySelector('.datasheet-arrow').textContent =
        body.classList.contains('collapsed') ? '▶' : '▼';
    };
  }

  // Auto-save on change for text fields
  const textFields = ['ds-description', 'ds-bankAuthor', 'ds-source', 'ds-license', 'ds-firmwareCompat', 'ds-knownIssues', 'ds-bankNotes'];
  for (const fieldId of textFields) {
    const el = container.querySelector(`#${fieldId}`);
    if (el) {
      el.onchange = () => {
        const key = fieldId.replace('ds-', '').replace('bank', 'bank');
        const dbKey = fieldId === 'ds-bankAuthor' ? 'bankAuthor'
          : fieldId === 'ds-bankNotes' ? 'bankNotes'
          : fieldId.replace('ds-', '');
        updateFn({ [dbKey]: el.value });
      };
    }
  }

  // Tags: add
  const addTagBtn = container.querySelector('#ds-add-tag');
  const tagInput = container.querySelector('#ds-new-tag');
  if (addTagBtn && tagInput) {
    const doAddTag = () => {
      const tag = tagInput.value.trim().toLowerCase();
      if (!tag) return;
      const currentTags = bank.tags || [];
      if (currentTags.includes(tag)) { tagInput.value = ''; return; }
      const newTags = [...currentTags, tag];
      bank.tags = newTags;
      updateFn({ tags: newTags });
      tagInput.value = '';
      refreshTagSuggestions(container, bank);
      refreshTagList(container, bank);
    };
    addTagBtn.onclick = doAddTag;
    tagInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doAddTag(); } };
  }

  // Tags: suggestion clicks
  container.querySelectorAll('.bank-tag-suggestion').forEach(btn => {
    btn.onclick = () => {
      const tag = btn.dataset.tag;
      const currentTags = bank.tags || [];
      if (currentTags.includes(tag)) return;
      const newTags = [...currentTags, tag];
      bank.tags = newTags;
      updateFn({ tags: newTags });
      refreshTagSuggestions(container, bank);
      refreshTagList(container, bank);
    };
  });

  // Tags: remove
  container.querySelectorAll('.bank-tag-remove').forEach(btn => {
    btn.onclick = () => {
      const tag = btn.dataset.tag;
      const newTags = (bank.tags || []).filter(t => t !== tag);
      bank.tags = newTags;
      updateFn({ tags: newTags });
      refreshTagSuggestions(container, bank);
      refreshTagList(container, bank);
    };
  });
}

function refreshTagList(container, bank) {
  const tagContainer = container.querySelector('#bank-tags');
  if (!tagContainer) return;
  const tags = bank.tags || [];
  tagContainer.innerHTML = tags.length > 0
    ? tags.map(t => `<span class="bank-tag">${escHtml(t)} <button class="bank-tag-remove" data-tag="${escHtml(t)}">×</button></span>`).join('')
    : '<span class="bank-tags-empty">Sin etiquetas</span>';
  // Rebind remove handlers
  tagContainer.querySelectorAll('.bank-tag-remove').forEach(btn => {
    btn.onclick = () => {
      const newTags = (bank.tags || []).filter(t => t !== btn.dataset.tag);
      bank.tags = newTags;
      // Trigger update through the existing handler pattern
      const event = new CustomEvent('tags-changed', { detail: { tags: newTags } });
      container.dispatchEvent(event);
      refreshTagList(container, bank);
      refreshTagSuggestions(container, bank);
    };
  });
}

function refreshTagSuggestions(container, bank) {
  const sugContainer = container.querySelector('#bank-tag-suggestions');
  if (!sugContainer) return;
  const currentTags = bank.tags || [];
  const remaining = TAG_SUGGESTIONS.filter(t => !currentTags.includes(t)).slice(0, 12);
  sugContainer.innerHTML = remaining.map(t =>
    `<button class="bank-tag-suggestion" data-tag="${t}">${t}</button>`
  ).join('');
  sugContainer.querySelectorAll('.bank-tag-suggestion').forEach(btn => {
    btn.onclick = () => {
      const tag = btn.dataset.tag;
      if (currentTags.includes(tag)) return;
      const newTags = [...currentTags, tag];
      bank.tags = newTags;
      const event = new CustomEvent('tags-changed', { detail: { tags: newTags } });
      container.dispatchEvent(event);
      refreshTagSuggestions(container, bank);
      refreshTagList(container, bank);
    };
  });
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
