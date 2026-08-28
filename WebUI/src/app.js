/**
 * ABD Bank Manager — App Entry Point (MF.8 cascade navigation)
 * Navigation: Manufacturer → Model → Bank → Patch
 */

import { BUILD_VERSION } from './contracts/buildVersion.js';
import {
  createBank, getBank, getAllBanks, updateBank, deleteBank,
  createPatch, getPatchesForBank, getPatch, updatePatch, deletePatch,
  importBank, exportBank, getDatabaseStats, getAllPatches,
  runPreMigrationBackup, getFilteredPatches
} from './store/persistence.js';
import { importFile } from './core/importEngine.js';
import { exportToFile, exportLibraryToFile } from './core/exportEngine.js';
import { getModelContract, MODEL_CONTRACTS } from './contracts/modelContracts.js';
import { applyRenameTemplate, validateRenameTemplate, patchesToCsv, parseNamesCsv } from './core/patchBulk.js';
import { getParameterSchema, hasParameterSchema, detectModelFromPortName, getModelDisplayName, getModelThumbnail, getAllModels, getManufacturer } from './core/modelRegistry.js';
import { hexDump, spacedHex } from './core/hexDump.js';
import { buildSysExViewInfo } from './core/patchSysEx.js';
import { requestMidiAccess, listMidiPorts, createMidiTransport, fetchBank } from './core/pro800Midi.js';

let midiAccess = null;
let activeMidiTransport = null;
let activeMidiModelId = null;

// ─── Navigation state ───
let navLevel = 'manufacturers'; // 'manufacturers' | 'models' | 'banks' | 'patches'
let selectedManufacturer = null;
let selectedModelId = null;
let selectedBankId = null;
let selectedPatchId = null;

// Group contracts by manufacturer
const manufacturers = {};
for (const c of MODEL_CONTRACTS) {
  if (!manufacturers[c.manufacturer]) manufacturers[c.manufacturer] = [];
  manufacturers[c.manufacturer].push(c);
}

// ─── Init ───
async function init() {
  console.log('[ABD Bank Manager] Starting...', BUILD_VERSION.version);
  document.getElementById('version').textContent = `v${BUILD_VERSION.version}`;
  await runPreMigrationBackup();
  renderNav();
  setStatus('connected', 'Listo');

  // Search
  document.getElementById('global-search').addEventListener('input', (e) => {
    renderNav(e.target.value.trim());
  });

  // MIDI status button
  document.getElementById('midi-status').onclick = handleMidiConnect;

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);

  console.log('[ABD Bank Manager] Ready');
}

// ─── Status bar ───
function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if (dot) dot.className = 'status-dot ' + state;
  if (txt) txt.textContent = text;
}

// ─── Toast ───
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ─── MIDI Activity LED ───
let midiActivityTimer = null;
function flashMidiActivity({ direction, bytes, label }) {
  const dot = document.querySelector('#midi-status .midi-dot');
  const statusEl = document.getElementById('midi-status');
  if (!dot || !statusEl) return;
  // Flash color based on direction
  dot.style.background = direction === 'out' ? 'var(--accent)' : 'var(--success)';
  dot.style.boxShadow = direction === 'out' ? '0 0 6px var(--accent)' : '0 0 6px var(--success)';
  // Tooltip with details
  statusEl.title = `${direction === 'out' ? '→' : '←'} ${label} · ${bytes?.length || 0} bytes`;
  // Reset after flash
  clearTimeout(midiActivityTimer);
  midiActivityTimer = setTimeout(() => {
    dot.style.background = '';
    dot.style.boxShadow = '';
    statusEl.title = 'Conectar MIDI';
  }, 400);
}

// ─── Modal ───
function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}
function hideModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ─── Navigation rendering ───
function renderNav(filter = '') {
  const list = document.getElementById('nav-list');
  list.innerHTML = '';

  if (navLevel === 'manufacturers') {
    renderManufacturerNav(list, filter);
  } else if (navLevel === 'models') {
    renderModelNav(list, filter);
  } else if (navLevel === 'banks') {
    renderBankNav(list, filter);
  } else if (navLevel === 'patches') {
    renderPatchNav(list, filter);
  }
}

function renderManufacturerNav(list, filter) {
  const mfrs = Object.keys(manufacturers).sort();
  const filtered = filter ? mfrs.filter(m => m.toLowerCase().includes(filter.toLowerCase())) : mfrs;

  if (filtered.length === 0) {
    list.innerHTML = '<li class="list-empty">Sin resultados</li>';
    return;
  }

  for (const mfr of filtered) {
    const li = document.createElement('li');
    li.className = 'list-item';
    const modelCount = manufacturers[mfr].length;
    li.innerHTML = `
      <span class="item-name">${escHtml(mfr)}</span>
      <span class="item-badge">${modelCount} modelo${modelCount > 1 ? 's' : ''}</span>`;
    li.onclick = () => selectManufacturer(mfr);
    list.appendChild(li);
  }
}

function renderModelNav(list, filter) {
  // Back button
  const back = document.createElement('li');
  back.className = 'list-item';
  back.innerHTML = '<span class="item-name" style="color:var(--accent);">← Fabricantes</span>';
  back.onclick = () => { navLevel = 'manufacturers'; selectedManufacturer = null; renderNav(); renderContent(); };
  list.appendChild(back);

  // Header
  const header = document.createElement('li');
  header.className = 'list-section-header';
  header.innerHTML = `<span class="arrow">▼</span> ${escHtml(selectedManufacturer)}`;
  list.appendChild(header);

  const models = manufacturers[selectedManufacturer] || [];
  const filtered = filter ? models.filter(c => c.displayName.toLowerCase().includes(filter.toLowerCase())) : models;

  for (const contract of filtered) {
    const li = document.createElement('li');
    li.className = 'list-item' + (contract.modelId === selectedModelId ? ' active' : '');
    const thumb = getModelThumbnail(contract.modelId);
    const thumbHtml = thumb ? `<img class="item-thumb" src="${thumb}" alt="" loading="lazy">` : '';
    li.innerHTML = `${thumbHtml}<span class="item-name">${escHtml(contract.displayName)}</span>`;
    li.onclick = () => selectModel(contract.modelId);
    list.appendChild(li);
  }
}

async function renderBankNav(list, filter) {
  // Back button
  const back = document.createElement('li');
  back.className = 'list-item';
  back.innerHTML = `<span class="item-name" style="color:var(--accent);">← ${escHtml(selectedManufacturer)}</span>`;
  back.onclick = () => { navLevel = 'models'; selectedModelId = null; selectedBankId = null; renderNav(); renderContent(); };
  list.appendChild(back);

  // Header
  const contract = getModelContract(selectedModelId);
  const header = document.createElement('li');
  header.className = 'list-section-header';
  header.innerHTML = `<span class="arrow">▼</span> ${escHtml(contract?.displayName || selectedModelId)}`;
  list.appendChild(header);

  const banks = await getAllBanks();
  const modelBanks = banks.filter(b => b.modelId === selectedModelId);
  const filtered = filter ? modelBanks.filter(b => b.name.toLowerCase().includes(filter.toLowerCase())) : modelBanks;

  for (const bank of filtered) {
    const li = document.createElement('li');
    li.className = 'list-item' + (bank.id === selectedBankId ? ' active' : '');
    const factoryBadge = bank.isFactory ? ' 🔒' : '';
    const patchCount = (await getPatchesForBank(bank.id)).length;
    li.innerHTML = `
      <span class="item-name">${escHtml(bank.name)}${factoryBadge}</span>
      <span class="item-badge">${patchCount}</span>`;
    li.onclick = () => selectBank(bank.id);
    list.appendChild(li);
  }
}

async function renderPatchNav(list, filter) {
  // Back button
  const back = document.createElement('li');
  back.className = 'list-item';
  const bank = await getBank(selectedBankId);
  back.innerHTML = `<span class="item-name" style="color:var(--accent);">← ${escHtml(bank?.name || 'Banco')}</span>`;
  back.onclick = () => { navLevel = 'banks'; selectedPatchId = null; renderNav(); renderContent(); };
  list.appendChild(back);

  const patches = await getPatchesForBank(selectedBankId);
  const filtered = filter ? patches.filter(p => p.name.toLowerCase().includes(filter.toLowerCase())) : patches;

  for (const patch of filtered) {
    const li = document.createElement('li');
    li.className = 'list-item' + (patch.id === selectedPatchId ? ' active' : '');
    const fav = patch.isFavorite ? ' ★' : '';
    li.innerHTML = `<span class="item-name">${escHtml(patch.name)}${fav}</span><span class="item-badge">${patch.category}</span>`;
    li.onclick = () => selectPatch(patch.id);
    list.appendChild(li);
  }
}

// ─── Selection handlers ───
function selectManufacturer(mfr) {
  selectedManufacturer = mfr;
  navLevel = 'models';
  selectedModelId = null;
  selectedBankId = null;
  selectedPatchId = null;
  renderNav();
  renderContent();
}

function selectModel(modelId) {
  selectedModelId = modelId;
  navLevel = 'banks';
  selectedBankId = null;
  selectedPatchId = null;
  renderNav();
  renderContent();
}

async function selectBank(bankId) {
  selectedBankId = bankId;
  navLevel = 'patches';
  selectedPatchId = null;
  renderNav();
  renderContent();
}

async function selectPatch(patchId) {
  selectedPatchId = patchId;
  renderNav();
  renderContent();
}

// ─── Content panel rendering ───
async function renderContent() {
  const welcome = document.getElementById('panel-welcome');
  const content = document.getElementById('panel-content');

  if (navLevel === 'manufacturers' || !selectedManufacturer) {
    welcome.style.display = '';
    content.style.display = 'none';
    return;
  }

  welcome.style.display = 'none';
  content.style.display = '';

  if (navLevel === 'models') {
    renderManufacturerContent(content);
  } else if (navLevel === 'banks') {
    await renderModelContent(content);
  } else if (navLevel === 'patches') {
    await renderBankContent(content);
  }
}

function renderManufacturerContent(el) {
  const mfrModels = manufacturers[selectedManufacturer] || [];
  const logoUrl = `/images/models/thumbs/logo-${selectedManufacturer.toLowerCase()}.svg`;

  el.innerHTML = `
    <div class="manufacturer-header">
      <img class="manufacturer-logo" src="${logoUrl}" alt="${escHtml(selectedManufacturer)}" onerror="this.style.display='none'">
    </div>
    <div class="model-grid" id="model-grid"></div>`;

  const grid = el.querySelector('#model-grid');
  for (const contract of mfrModels) {
    const card = document.createElement('div');
    card.className = 'model-card';
    const thumb = getModelThumbnail(contract.modelId);
    const thumbHtml = thumb ? `<img class="card-thumb" src="${thumb}" alt="" loading="lazy">` : '';
    const caps = [];
    if (contract.buildPatchSysEx) caps.push('Send');
    if (contract.buildDumpRequest) caps.push('Fetch');
    if (contract.buildBulkSysEx) caps.push('Bulk');
    card.innerHTML = `
      ${thumbHtml}
      <div class="card-name">${escHtml(contract.displayName)}</div>
      <div class="card-meta">${contract.bankCapacity} patches · ${contract.banksCount} bank${contract.banksCount > 1 ? 's' : ''}</div>
      <div class="card-badges">${caps.map(c => `<span class="item-badge">${c}</span>`).join('')}</div>`;
    card.onclick = () => selectModel(contract.modelId);
    grid.appendChild(card);
  }
}

async function renderModelContent(el) {
  const contract = getModelContract(selectedModelId);
  if (!contract) { el.innerHTML = '<p>Contrato no encontrado</p>'; return; }

  const thumbUrl = getModelThumbnail(selectedModelId);
  const logoUrl = `/images/models/thumbs/logo-${(contract.manufacturer || '').toLowerCase()}.svg`;
  const caps = [];
  if (contract.buildPatchSysEx) caps.push('Send');
  if (contract.buildDumpRequest) caps.push('Fetch');
  if (contract.buildBulkSysEx) caps.push('Bulk');

  el.innerHTML = `
    <div class="hardware-header">
      <img class="hardware-logo" src="${logoUrl}" alt="" onerror="this.style.display='none'">
      ${thumbUrl ? `<img class="hardware-thumb" src="${thumbUrl}" alt="">` : ''}
      <div class="hardware-info">
        <h2>${escHtml(contract.displayName)}</h2>
        <div class="hw-meta">${escHtml(contract.manufacturer)} · ${contract.bankCapacity} patches · ${contract.programsPerBank}/bank</div>
        <div class="hw-badges">${caps.map(c => `<span class="item-badge">${c}</span>`).join('')}</div>
      </div>
    </div>
    <div class="action-bar">
      <button class="btn btn-primary" id="btn-new-bank-m">+ Nuevo Banco</button>
      <button class="btn" id="btn-midi-fetch-m">Fetch del hardware</button>
    </div>
    <div class="bank-grid" id="bank-grid"></div>`;

  // New bank button
  el.querySelector('#btn-new-bank-m').onclick = () => promptNewBank(selectedModelId);

  // Fetch button
  el.querySelector('#btn-midi-fetch-m').onclick = () => handleMidiFetch();

  // Render bank grid
  const grid = el.querySelector('#bank-grid');
  const banks = await getAllBanks();
  const modelBanks = banks.filter(b => b.modelId === selectedModelId);

  for (const bank of modelBanks) {
    const card = document.createElement('div');
    card.className = 'bank-card' + (bank.id === selectedBankId ? ' active' : '');
    const patchCount = (await getPatchesForBank(bank.id)).length;
    const factoryLabel = bank.isFactory ? '🔒 Fábrica' : '👤 Usuario';
    card.innerHTML = `
      <div class="bank-name">${escHtml(bank.name)}</div>
      <div class="bank-meta">${patchCount} patches · ${factoryLabel}</div>`;
    card.onclick = () => selectBank(bank.id);
    grid.appendChild(card);
  }

  // New bank card
  const newCard = document.createElement('div');
  newCard.className = 'bank-card bank-card-new';
  newCard.innerHTML = '+ Nuevo Banco';
  newCard.onclick = () => promptNewBank(selectedModelId);
  grid.appendChild(newCard);
}

async function renderBankContent(el) {
  const bank = await getBank(selectedBankId);
  if (!bank) { el.innerHTML = '<p>Banco no encontrado</p>'; return; }

  const contract = getModelContract(bank.modelId);
  const thumbUrl = getModelThumbnail(bank.modelId);
  const patches = await getPatchesForBank(bank.id);

  el.innerHTML = `
    <div class="bank-header">
      ${thumbUrl ? `<img class="bank-thumb-lg" src="${thumbUrl}" alt="">` : ''}
      <div class="bank-info">
        <h2>${escHtml(bank.name)}</h2>
        <div class="bk-meta">${escHtml(contract?.displayName || bank.modelId)} · ${patches.length} patches · ${bank.isFactory ? '🔒 Fábrica' : '👤 Usuario'}</div>
      </div>
    </div>
    <div class="action-bar">
      <button class="btn" id="btn-fetch-bank">📥 Fetch</button>
      <button class="btn" id="btn-send-bank">📤 Enviar banco</button>
      <button class="btn" id="btn-import-bank">📂 Importar .syx</button>
      <button class="btn" id="btn-export-bank">💾 Exportar .syx</button>
      <button class="btn" id="btn-rename-bank">✏️ Renombrar</button>
      <button class="btn" id="btn-export-csv-bank">📋 CSV</button>
      <button class="btn" id="btn-import-csv-bank">📋 Importar CSV</button>
      ${!bank.isFactory ? '<button class="btn" style="color:var(--error);" id="btn-delete-bank">🗑️ Eliminar</button>' : ''}
    </div>
    <div class="patch-grid" id="patch-grid"></div>
    <div id="patch-detail-container"></div>`;

  // Action handlers
  el.querySelector('#btn-fetch-bank').onclick = () => handleMidiFetch();
  el.querySelector('#btn-send-bank').onclick = () => handleMidiSendBank();
  el.querySelector('#btn-import-bank').onclick = () => document.getElementById('file-input').click();
  el.querySelector('#btn-export-bank').onclick = () => handleExport();
  el.querySelector('#btn-rename-bank').onclick = () => promptRenameBank(bank);
  el.querySelector('#btn-export-csv-bank').onclick = () => handleExportCsv();
  el.querySelector('#btn-import-csv-bank').onclick = () => document.getElementById('csv-input').click();
  const delBtn = el.querySelector('#btn-delete-bank');
  if (delBtn) delBtn.onclick = () => confirmDeleteBank(bank);

  // Render patch grid
  const grid = el.querySelector('#patch-grid');
  for (const patch of patches) {
    const chip = document.createElement('div');
    chip.className = 'patch-chip' + (patch.id === selectedPatchId ? ' active' : '');
    const fav = patch.isFavorite ? ' ★' : '';
    chip.innerHTML = `<span>${escHtml(patch.name)}${fav}</span><span class="patch-cat">${patch.category}</span>`;
    chip.onclick = () => selectPatch(patch.id);
    grid.appendChild(chip);
  }

  // Render patch detail if selected
  if (selectedPatchId) {
    await renderPatchDetail(el.querySelector('#patch-detail-container'));
  }
}

async function renderPatchDetail(container) {
  const patch = await getPatch(selectedPatchId);
  if (!patch) { container.innerHTML = ''; return; }

  const bank = await getBank(patch.bankId);
  const contract = getModelContract(bank?.modelId);
  const rawData = patch.rawData instanceof Uint8Array ? patch.rawData : new Uint8Array(patch.rawData);

  let paramsHtml = '';
  if (hasParameterSchema(bank?.modelId)) {
    const schema = getParameterSchema(bank.modelId);
    const rows = schema.getTable(rawData);
    paramsHtml = `
      <section class="interpreted-parameters">
        <div class="panel-header" style="padding-left:0;padding-right:0;">
          <span class="panel-title">Parámetros interpretados</span>
          <span class="item-badge">${schema.formatLabel(rawData)}</span>
        </div>
        <div class="parameter-table-wrap">
          <table class="parameter-table">
            <thead><tr><th>Parámetro</th><th>Valor</th><th>Offset</th><th>Descripción</th></tr></thead>
            <tbody>${rows.map(p => {
              let val = p.displayValue ?? p.value ?? p.rawByte ?? '—';
              if (p.options?.[p.value]) val = p.options[p.value];
              return `<tr><td>${escHtml(p.name)}</td><td class="parameter-value">${escHtml(String(val))}</td><td>${p.offset}</td><td>${escHtml(p.description)}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </section>`;
  }

  let sysExHtml = '';
  const info = buildSysExViewInfo(patch, bank);
  if (info) {
    sysExHtml = `
      <div class="sysex-viewer">
        <div class="panel-header" style="padding-left:0;padding-right:0;">
          <span class="panel-title">SysEx</span>
          <span class="item-badge">${info.meta}</span>
        </div>
        <div class="sysex-hex">${hexDump(info.rawData)}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="patch-detail">
      <div class="patch-info">
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <div class="patch-info-field" style="flex:1;">
            <span class="patch-info-label">Nombre</span>
            <input class="patch-info-input" id="patch-name" value="${escHtml(patch.name)}" maxlength="64">
          </div>
          <button class="btn btn-sm" id="btn-fav">${patch.isFavorite ? '★' : '☆'} Favorito</button>
          <button class="btn btn-sm" style="color:var(--error);" id="btn-delete-patch">Borrar</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
          <div class="patch-info-field">
            <span class="patch-info-label">Categoría</span>
            <select class="param-select" id="patch-category">
              ${['Bass','Lead','Pad','Keys','FX','Perc','Synth','Other'].map(c => `<option${c === patch.category ? ' selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="patch-info-field">
            <span class="patch-info-label">Autor</span>
            <input class="patch-info-input" id="patch-author" value="${escHtml(patch.author || '')}" maxlength="64">
          </div>
        </div>
        <div class="patch-info-field">
          <span class="patch-info-label">Notas</span>
          <input class="patch-info-input" id="patch-notes" value="${escHtml(patch.notes || '')}">
        </div>
      </div>
      ${sysExHtml}
      ${paramsHtml}
    </div>`;

  // Patch detail event handlers
  document.getElementById('patch-name').onchange = (e) => updatePatch(patch.id, { name: e.target.value });
  document.getElementById('patch-category').onchange = (e) => updatePatch(patch.id, { category: e.target.value });
  document.getElementById('patch-author').onchange = (e) => updatePatch(patch.id, { author: e.target.value });
  document.getElementById('patch-notes').onchange = (e) => updatePatch(patch.id, { notes: e.target.value });
  document.getElementById('btn-fav').onclick = async () => {
    await updatePatch(patch.id, { isFavorite: !patch.isFavorite });
    await selectPatch(patch.id);
  };
  document.getElementById('btn-delete-patch').onclick = async () => {
    await deletePatch(patch.id);
    selectedPatchId = null;
    renderNav();
    renderContent();
    toast('Patch eliminado', 'success');
  };
}

// ─── MIDI ───
function findMatchingInput(outputName, inputs) {
  if (!outputName || inputs.length === 0) return null;
  const n = outputName.toLowerCase();
  return inputs.find(p => {
    const inp = (p.name || '').toLowerCase();
    return inp === n || inp.includes(n) || n.includes(inp);
  }) || null;
}

const ALL_MODELS = getAllModels().map(m => ({ id: m.id, name: m.name }));
const detectModelFromName = detectModelFromPortName;

async function handleMidiConnect() {
  try {
    midiAccess = await requestMidiAccess();
    const { inputs, outputs } = listMidiPorts(midiAccess);
    if (outputs.length === 0) throw new Error('No se encontró una salida MIDI');

    const classified = outputs.map((port, idx) => ({ port, idx, model: detectModelFromName(port.name) }));
    const known = classified.filter(c => c.model);

    if (known.length === 1) {
      connectMidiDevice(known[0].port, findMatchingInput(known[0].port.name, inputs), known[0].model.modelId);
    } else if (known.length > 1) {
      showKnownDevicePicker(known, inputs);
    } else {
      showManualSelector(outputs, inputs);
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

function showKnownDevicePicker(known, inputs) {
  const rows = known.map((c, i) => {
    const inPort = findMatchingInput(c.port.name, inputs);
    return `<div style="padding:0.5rem 0.7rem;border:1px solid var(--border);border-radius:6px;margin-bottom:0.4rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:var(--bg-tertiary);" class="midi-device-row" data-idx="${i}">
      <div><strong>${escHtml(c.model.displayName)}</strong><br><small style="color:var(--text-secondary);">Out: ${escHtml(c.port.name || '?')} · In: ${escHtml(inPort?.name || 'Ninguna')}</small></div>
      <span style="color:var(--text-secondary);">▶</span>
    </div>`;
  }).join('');

  showModal(`<div style="padding:1rem;">
    <h3 style="margin:0 0 0.6rem;">Varios dispositivos detectados</h3>
    <p style="margin:0 0 0.8rem;color:var(--text-secondary);font-size:0.85rem;">Selecciona cuál conectar:</p>
    ${rows}
    <div class="modal-actions" style="margin-top:0.8rem;">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
    </div>
  </div>`);

  document.querySelectorAll('.midi-device-row').forEach((el, i) => {
    el.onclick = () => {
      const c = known[i];
      hideModal();
      connectMidiDevice(c.port, findMatchingInput(c.port.name, inputs), c.model.modelId);
    };
  });
}

function showManualSelector(outputs, inputs) {
  const outOpts = outputs.map((p, i) => `<option value="${i}">${escHtml(p.name || 'Sin nombre')}</option>`).join('');
  const inOpts = inputs.map((p, i) => `<option value="${i}">${escHtml(p.name || 'Sin nombre')}</option>`).join('');

  showModal(`<div style="padding:1rem;">
    <h3 style="margin:0 0 0.6rem;">Conexión MIDI</h3>
    <p style="margin:0 0 0.8rem;color:var(--text-secondary);font-size:0.85rem;">Selecciona los puertos:</p>
    <div class="patch-info-field">
      <span class="patch-info-label">Salida MIDI</span>
      <select class="param-select" id="midi-out" style="width:100%">${outOpts}</select>
    </div>
    <div class="patch-info-field" style="margin-top:0.5rem;">
      <span class="patch-info-label">Entrada MIDI</span>
      <select class="param-select" id="midi-in" style="width:100%"><option value="-1">— No conectar entrada —</option>${inOpts}</select>
    </div>
    <button class="btn" id="midi-detect-btn" style="margin-top:0.6rem;width:100%;">🔍 Detectar modelo</button>
    <div id="midi-detect-result"></div>
    <div id="midi-model-manual" style="display:none;margin-top:0.5rem;" class="patch-info-field">
      <span class="patch-info-label">Modelo</span>
      <select class="param-select" id="midi-port-model" style="width:100%">${ALL_MODELS.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.name)}</option>`).join('')}</select>
    </div>
    <div class="modal-actions" style="margin-top:1rem;">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
      <button class="btn btn-primary" id="midi-confirm" style="display:none;">Conectar</button>
    </div>
  </div>`);

  let detectedId = null;
  document.getElementById('midi-detect-btn').onclick = () => {
    const outIdx = parseInt(document.getElementById('midi-out').value);
    const port = outputs[outIdx];
    const found = detectModelFromName(port?.name);
    const result = document.getElementById('midi-detect-result');
    const manualDiv = document.getElementById('midi-model-manual');
    const confirmBtn = document.getElementById('midi-confirm');
    if (found) {
      detectedId = found.modelId;
      result.innerHTML = `<div style="margin-top:0.6rem;padding:0.5rem 0.7rem;border-radius:6px;background:rgba(63,185,80,0.15);border:1px solid rgba(63,185,80,0.3);color:var(--success);font-weight:600;">✔ Detectado: <strong>${escHtml(found.displayName)}</strong></div>`;
      manualDiv.style.display = 'none';
      confirmBtn.style.display = '';
    } else {
      detectedId = null;
      result.innerHTML = `<div style="margin-top:0.6rem;padding:0.5rem 0.7rem;border-radius:6px;background:rgba(248,81,73,0.15);border:1px solid rgba(248,81,73,0.3);color:var(--error);">✘ No reconocido. Selecciona uno:</div>`;
      manualDiv.style.display = '';
      confirmBtn.style.display = '';
    }
  };
  document.getElementById('midi-confirm').onclick = () => {
    const outIdx = parseInt(document.getElementById('midi-out').value);
    const inIdx = parseInt(document.getElementById('midi-in').value);
    const modelId = detectedId || document.getElementById('midi-port-model').value;
    hideModal();
    connectMidiDevice(outputs[outIdx], inIdx === -1 ? null : inputs[inIdx], modelId);
  };
}

function connectMidiDevice(output, input, modelId) {
  activeMidiTransport?.close();
  activeMidiTransport = createMidiTransport({ modelId, input, output, onActivity: flashMidiActivity });
  activeMidiModelId = modelId;
  const displayName = getModelDisplayName(modelId);
  const statusEl = document.getElementById('midi-status');
  statusEl.classList.add('connected');
  document.getElementById('midi-label').textContent = `${displayName} ✓`;
  toast(`${displayName} conectado${input ? '' : ' (solo envío)'}`, 'success');
}

async function handleMidiFetch() {
  if (!activeMidiTransport) { toast('Conecta primero un hardware MIDI', 'error'); return; }
  const contract = getModelContract(activeMidiModelId);
  if (!contract) { toast('Contrato no encontrado', 'error'); return; }

  let bank = selectedBankId ? await getBank(selectedBankId) : null;
  const isCompatible = id => id && (id === activeMidiModelId || contract.compatibleModels?.includes(id));
  if (!bank || !isCompatible(bank.modelId)) {
    const allBanks = await getAllBanks();
    bank = allBanks.find(b => isCompatible(b.modelId));
    if (!bank) bank = await createBank({ name: contract.displayName, modelId: activeMidiModelId, manufacturer: contract.manufacturer || '' });
    selectedBankId = bank.id;
  }

  try {
    let patches;
    if (contract.parseDumpResponse) {
      patches = await activeMidiTransport.fetchAll();
    } else {
      patches = await fetchBank(activeMidiTransport, { count: contract.bankCapacity || 128 });
    }
    for (const patch of patches) {
      const existing = (await getPatchesForBank(bank.id)).find(c => c.index === patch.slot);
      const name = contract.extractPatchName?.(patch.rawData) || `P${patch.slot + 1}`;
      if (existing) await updatePatch(existing.id, { rawData: patch.rawData, name });
      else await createPatch(bank.id, { index: patch.slot, rawData: patch.rawData, name });
    }
    navLevel = 'patches';
    await renderNav();
    await renderContent();
    toast(`Fetch completado — ${patches.length} patches`, 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function handleMidiSendBank() {
  if (!activeMidiTransport) { toast('Conecta primero un hardware MIDI', 'error'); return; }
  if (!selectedBankId) { toast('Selecciona un banco', 'error'); return; }
  const bank = await getBank(selectedBankId);
  const contract = getModelContract(bank.modelId);
  const patches = await getPatchesForBank(selectedBankId);
  if (patches.length === 0) { toast('Banco vacío', 'error'); return; }

  try {
    const channel = contract.midi?.defaultChannel ?? 1;
    if (activeMidiTransport.capabilities?.bulk) {
      const bulkPatches = patches.map(p => ({ rawData: p.rawData instanceof Uint8Array ? p.rawData : new Uint8Array(p.rawData), slot: p.index }));
      activeMidiTransport.sendBulk(bulkPatches, channel);
    } else {
      const delay = contract.interMessageDelayMs || 50;
      for (let i = 0; i < patches.length; i++) {
        const p = patches[i];
        const rawData = p.rawData instanceof Uint8Array ? p.rawData : new Uint8Array(p.rawData);
        activeMidiTransport.sendPatch({ rawData }, p.index, channel);
        if (i < patches.length - 1) await new Promise(r => setTimeout(r, delay));
      }
    }
    toast(`Banco enviado (${patches.length} patches)`, 'success');
  } catch (error) { toast(error.message, 'error'); }
}

async function handleMidiSendPatch() {
  if (!activeMidiTransport) { toast('Conecta primero un hardware MIDI', 'error'); return; }
  if (!selectedPatchId) { toast('Selecciona un patch', 'error'); return; }
  const patch = await getPatch(selectedPatchId);
  const bank = await getBank(patch.bankId);
  const contract = getModelContract(bank.modelId);
  const rawData = patch.rawData instanceof Uint8Array ? patch.rawData : new Uint8Array(patch.rawData);
  try {
    activeMidiTransport.sendPatch({ rawData }, patch.index, contract.midi?.defaultChannel ?? 1);
    toast(`Patch "${patch.name}" enviado`, 'success');
  } catch (error) { toast(error.message, 'error'); }
}

// ─── Bank operations ───
function promptNewBank(modelId) {
  showModal(`
    <h3>Nuevo Banco</h3>
    <div class="patch-info-field">
      <span class="patch-info-label">Nombre</span>
      <input class="patch-info-input" id="modal-bank-name" placeholder="Mi Banco" autofocus>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
      <button class="btn btn-primary" id="modal-confirm">Crear</button>
    </div>`);
  document.getElementById('modal-confirm').onclick = async () => {
    const name = document.getElementById('modal-bank-name').value.trim() || 'Nuevo Banco';
    const contract = getModelContract(modelId);
    const bank = await createBank({ name, modelId, manufacturer: contract?.manufacturer || '' });
    selectedBankId = bank.id;
    navLevel = 'patches';
    await renderNav();
    await renderContent();
    toast(`Banco "${name}" creado`, 'success');
    hideModal();
  };
}

function promptRenameBank(bank) {
  if (bank.isFactory) { toast('Bancos de fábrica no se renombran', 'error'); return; }
  showModal(`
    <h3>Renombrar Banco</h3>
    <input class="patch-info-input" id="modal-input" value="${escHtml(bank.name)}" style="width:100%;" autofocus>
    <div class="modal-actions">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
      <button class="btn btn-primary" id="modal-confirm">Aceptar</button>
    </div>`);
  document.getElementById('modal-confirm').onclick = async () => {
    const name = document.getElementById('modal-input').value.trim();
    if (name) { await updateBank(bank.id, { name }); await renderNav(); toast('Banco renombrado', 'success'); }
    hideModal();
  };
}

async function confirmDeleteBank(bank) {
  if (bank.isFactory) { toast('No se pueden eliminar bancos de fábrica', 'error'); return; }
  showModal(`
    <h3>Eliminar Banco</h3>
    <p style="margin-bottom:1rem;color:var(--text-secondary);">Eliminar "${escHtml(bank.name)}" y todos sus patches?</p>
    <div class="modal-actions">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
      <button class="btn" style="color:var(--error);border-color:var(--error);" id="modal-confirm">Eliminar</button>
    </div>`);
  document.getElementById('modal-confirm').onclick = async () => {
    await deleteBank(bank.id);
    selectedBankId = null; selectedPatchId = null;
    navLevel = 'banks';
    await renderNav(); await renderContent();
    toast('Banco eliminado', 'success');
    hideModal();
  };
}

// ─── Import/Export ───
async function handleExport() {
  if (!selectedBankId) { toast('Selecciona un banco', 'error'); return; }
  const { bank, patches } = await exportBank(selectedBankId);
  const result = await exportToFile(bank, patches, 'abdbank');
  if (result.success) toast(`Exportado: ${result.filename}`, 'success');
  else toast(result.error, 'error');
}

async function handleExportCsv() {
  if (!selectedBankId) { toast('Selecciona un banco', 'error'); return; }
  const bank = await getBank(selectedBankId);
  const patches = await getPatchesForBank(selectedBankId);
  const contract = getModelContract(bank?.modelId);
  const rows = patches.map(p => ({ bankId: p.bankId, bankName: bank?.name || '', index: p.index, name: p.name, contract }));
  const blob = new Blob([patchesToCsv(rows)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${bank.name}-nombres.csv`;
  a.click();
  toast(`Exportados ${rows.length} nombres`, 'success');
}

async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  try {
    const result = await importFile(file);
    if (!result.success) { toast(result.error, 'error'); return; }
    let total = 0;
    if (result.banks) {
      for (const { bank, patches } of result.banks) {
        const r = await importBank(bank, patches, { deduplication: 'skip' });
        total += r.importedCount;
      }
    } else {
      const r = await importBank(result.bank, result.patches, { deduplication: 'skip' });
      total = r.importedCount;
      if (!selectedBankId && r.bankId) { selectedBankId = r.bankId; navLevel = 'patches'; }
    }
    await renderNav(); await renderContent();
    toast(`Importado: ${total} patches`, 'success');
  } catch (err) { toast(`Error: ${err.message}`, 'error'); }
}

async function handleImportCsv(e) {
  const file = e.target.files[0];
  if (!file || !selectedBankId) return;
  e.target.value = '';
  const text = await file.text();
  const { rows, errors } = parseNamesCsv(text);
  errors.forEach(err => toast(err, 'warning'));
  let updated = 0;
  const patches = await getPatchesForBank(selectedBankId);
  for (const row of rows) {
    const patch = patches.find(p => p.index === row.index);
    if (patch && row.name) { await updatePatch(patch.id, { name: row.name }); updated++; }
  }
  await renderNav(); await renderContent();
  toast(`${updated} nombres actualizados`, 'success');
}

// ─── Keyboard shortcuts ───
function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'i') { e.preventDefault(); document.getElementById('file-input')?.click(); }
    if (e.key === 'e') { e.preventDefault(); handleExport(); }
    if (e.key === 'm') { e.preventDefault(); handleMidiConnect(); }
    if (e.key === 'f') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
  }
  if (e.key === 'Escape') { hideModal(); }
}

// ─── Utils ───
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

window.toggleSection = (toggleEl) => {
  const section = toggleEl.closest('.sidebar-section');
  const icon = toggleEl.querySelector('span');
  section.classList.toggle('collapsed');
  if (icon) icon.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
};

// Hidden file inputs for import
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.id = 'file-input';
fileInput.accept = '.syx,.sysex,.abdlibrary';
fileInput.style.display = 'none';
fileInput.onchange = handleFileImport;
document.body.appendChild(fileInput);

const csvInput = document.createElement('input');
csvInput.type = 'file';
csvInput.id = 'csv-input';
csvInput.accept = '.csv';
csvInput.style.display = 'none';
csvInput.onchange = handleImportCsv;
document.body.appendChild(csvInput);

// ─── Start ───
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}