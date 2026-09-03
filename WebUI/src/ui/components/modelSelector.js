/**
 * ABD Bank Manager â€” Model Selector Component
 *
 * Reusable model selector with manufacturer filtering and auto-configuration display.
 * Uses contractRegistryData for data, no hardcoded model lists.
 */
import { contractRegistryData } from '../../contracts/modelContracts.js';

let currentFilter = '';
let selectedModelId = null;
let onSelectCallback = null;

export function initModelSelector(options = {}) {
  onSelectCallback = options.onSelect || null;
  selectedModelId = options.initialModelId || null;
}

export function renderModelSelector(container, options = {}) {
  const { manufacturerFilter = null, showAutoConfig = true, onSelect = null } = options;
  
  if (onSelect) onSelectCallback = onSelect;

  const models = getFilteredModels(manufacturerFilter);
  const manufacturers = getManufacturers(models);

  container.innerHTML = `
    <div class="model-selector">
      <div class="model-selector__filter">
        <label for="model-search">Search model</label>
        <input type="search" id="model-search" placeholder="Filter by name..." 
          value="${currentFilter}" style="width:100%;padding:0.4rem;border:1px solid var(--border);border-radius:4px;">
      </div>
      
      <div class="model-selector__manufacturers">
        ${Object.keys(manufacturers).map(mfr => `
          <details class="model-selector__mfr" ${manufacturers[mfr].some(m => m.modelId === selectedModelId) ? 'open' : ''}>
            <summary class="model-selector__mfr-summary">
              <span class="model-selector__mfr-name">${escHtml(mfr)}</summary>
              <span class="model-selector__mfr-count">${manufacturers[mfr].length} model${manufacturers[mfr].length > 1 ? 's' : ''}</span>
            </summary>
            <ul class="model-selector__models">
              ${manufacturers[mfr].map(model => `
                <li class="model-selector__model ${model.modelId === selectedModelId ? 'selected' : ''}" 
                    data-model-id="${model.modelId}" data-mfr="${mfr}">
                  <img class="model-selector__thumb" src="${getModelThumbnail(model.modelId)}" alt="" loading="lazy" onerror="this.src='./vendor/images/models/thumbs/placeholder-synth.svg'">
                  <span class="model-selector__name">${escHtml(model.displayName)}</span>
                  <span class="model-selector__badge">${model.programsPerBank} patches/bank</span>
                </li>
              `).join('')}
            </ul>
          </details>
        `).join('')}
      </div>
      
      ${showAutoConfig && selectedModelId ? renderAutoConfig(selectedModelId) : ''}
    </div>
  `;

  // Event listeners
  const searchInput = container.querySelector('#model-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilter = e.target.value.trim();
      renderModelSelector(container, { manufacturerFilter, showAutoConfig, onSelect: onSelectCallback });
    });
  }

  container.querySelectorAll('.model-selector__model').forEach(li => {
    li.addEventListener('click', () => {
      selectedModelId = li.dataset.modelId;
      if (onSelectCallback) onSelectCallback(selectedModelId, getModelMetadata(selectedModelId));
      renderModelSelector(container, { manufacturerFilter, showAutoConfig, onSelect: onSelectCallback });
    });
  });
}

function getFilteredModels(mfrFilter) {
  let models = contractRegistryData.registeredModelIds.map(id => contractRegistryData.modelMetadata[id]);
  if (mfrFilter) {
    models = models.filter(m => m.manufacturer === mfrFilter);
  }
  if (currentFilter) {
    const q = currentFilter.toLowerCase();
    models = models.filter(m => m.displayName.toLowerCase().includes(q));
  }
  return models;
}

function getManufacturers(models) {
  const mfrs = {};
  for (const model of models) {
    const mfr = model.manufacturer || 'Otros';
    if (!mfrs[mfr]) mfrs[mfr] = [];
    mfrs[mfr].push(model);
  }
  // Sort manufacturers alphabetically, then models by displayName
  const sorted = {};
  Object.keys(mfrs).sort().forEach(k => {
    sorted[k] = mfrs[k].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });
  return sorted;
}

function getModelMetadata(modelId) {
  return contractRegistryData.modelMetadata[modelId] || null;
}

function getModelThumbnail(modelId) {
  const meta = contractRegistryData.modelMetadata[modelId];
  if (meta?.thumbnail) return `./vendor/images/models/thumbs/${meta.thumbnail}`;
  return './vendor/images/models/thumbs/placeholder-synth.svg';
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&apos;' }[c]));
}

function renderAutoConfig(modelId) {
  const meta = contractRegistryData.modelMetadata[modelId];
  if (!meta) return '';

  const midiConfig = getMidiConfig(modelId);
  
  return `
    <div class="model-selector__autoconfig">
      <h4>Auto-configuration for ${escHtml(meta.displayName)}</h4>
      <div class="autoconfig__grid">
        <div class="autoconfig__item">
          <label>Manufacturer</label>
          <span>${escHtml(meta.manufacturer)}</span>
        </div>
        <div class="autoconfig__item">
          <label>Bank capacity</label>
          <span>${meta.bankCapacity} patches (${meta.programsPerBank} per bank)</span>
        </div>
        <div class="autoconfig__item">
          <label>Patch size</label>
          <span>${meta.patchDataSize} bytes</span>
        </div>
        <div class="autoconfig__item">
          <label>Default MIDI channel</label>
          <span>${midiConfig?.channel || 1}</span>
        </div>
        <div class="autoconfig__item">
          <label>MIDI device ID</label>
          <span>${midiConfig?.deviceId || 'N/A'}</span>
        </div>
        <div class="autoconfig__item">
          <label>Inter-message delay</label>
          <span>${midiConfig?.interMessageDelayMs || 0} ms</span>
        </div>
        <div class="autoconfig__item">
          <label>Dump timeout</label>
          <span>${midiConfig?.dumpTimeoutMs || 3000} ms</span>
        </div>
        <div class="autoconfig__item">
          <label>Categories</label>
          <span>${meta.categories?.join(', ') || '—'}</span>
        </div>
        <div class="autoconfig__item">
          <label>Compatible models</label>
          <span>${meta.compatibleModels?.join(', ') || '—'}</span>
        </div>
      </div>
    </div>
  `;
}

function getMidiConfig(modelId) {
  const meta = contractRegistryData.modelMetadata[modelId];
  if (!meta) return {};
  // Derive MIDI config from metadata (same logic as getMidiConfig in modelContracts)
  return {
    channel: 1,
    deviceId: meta.manufacturer === 'Korg' ? 16 : 16,
    interMessageDelayMs: 20,
    dumpTimeoutMs: 3000
  };
}

export function getSelectedModelId() {
  return selectedModelId;
}

export function setSelectedModelId(modelId) {
  selectedModelId = modelId;
}

export function resetFilter() {
  currentFilter = '';
}
