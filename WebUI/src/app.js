/**
 * ABD Bank Manager — App Entry Point
 * Real bank manager: CRUD, import/export, persistence, bridge
 */

import { BUILD_VERSION } from './contracts/buildVersion.js';
import {
  createBank, getBank, getAllBanks, updateBank, deleteBank,
  createPatch, getPatchesForBank, getPatch, updatePatch, deletePatch,
  importBank, exportBank, getDatabaseStats, getAllPatches,
  runPreMigrationBackup
} from './store/persistence.js';
import { importFile } from './core/importEngine.js';
import { exportToFile, exportLibraryToFile } from './core/exportEngine.js';
import { getModelContract } from './contracts/modelContracts.js';
import {
  applyRenameTemplate, validateRenameTemplate,
  patchesToCsv, parseNamesCsv
} from './core/patchBulk.js';
import { decodePro800Parameters } from './core/pro800Parameters.js';
import { decodeDeepMindParameters } from './core/deepMindParameters.js';
import { hexDump, spacedHex } from './core/hexDump.js';
import { buildSysExViewInfo } from './core/patchSysEx.js';
import { requestMidiAccess, listMidiPorts, createBehringerMidiTransport, fetchBehringerBank } from './core/pro800Midi.js';

let midiAccess = null;
let behringerMidiTransport = null;

// ─── State ───
let activeBankId = null;
let activePatchId = null;
let selectedPatchIds = new Set();

// ─── Init ───
async function init() {
  console.log('[ABD Bank Manager] Starting...', BUILD_VERSION.version);

  document.getElementById('version').textContent = `v${BUILD_VERSION.version}`;

  setupButtons();
  await runPreMigrationBackup();
  await refreshBankList();
  await updateStats();

  setStatus('connected', 'Listo');
  console.log('[ABD Bank Manager] Ready');
}

// ─── Status bar ───
function setStatus(state, text) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if (dot) { dot.className = 'status-dot ' + state; }
  if (txt) { txt.textContent = text; }
}

async function updateStats() {
  const stats = await getDatabaseStats();
  const el = document.getElementById('db-stats');
  if (el) el.textContent = `${stats.bankCount} bancos · ${stats.patchCount} patches · ${stats.favCount} favs`;
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

// ─── Modal ───
function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}
function hideModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

// ─── Bank List ───
async function refreshBankList() {
  const banks = await getAllBanks();
  const list = document.getElementById('bank-list');
  list.innerHTML = '';

  if (banks.length === 0) {
    list.innerHTML = '<li class="list-empty">No hay bancos. Importa o crea uno.</li>';
    return;
  }

  for (const bank of banks) {
    const li = document.createElement('li');
    li.className = 'list-item' + (bank.id === activeBankId ? ' active' : '');
    const factoryBadge = bank.isFactory ? ' <span class="item-badge" style="color:var(--warning);border-color:var(--warning);">🔒 Fábrica</span>' : '';
    li.innerHTML = `
      <span class="item-name">${escHtml(bank.name)}${factoryBadge}</span>
      <span class="item-badge">${bank.modelId}</span>
      <span class="item-actions">
        <button class="btn btn-icon btn-sm" data-action="edit-bank" title="Editar"${bank.isFactory ? ' disabled' : ''}>&#9998;</button>
        <button class="btn btn-icon btn-sm" data-action="delete-bank" title="Borrar" style="color:var(--error);"${bank.isFactory ? ' disabled' : ''}>&#10005;</button>
      </span>`;
    li.querySelector('.item-name').onclick = () => selectBank(bank.id);
    li.querySelector('[data-action="edit-bank"]').onclick = (e) => { e.stopPropagation(); promptRenameBank(bank); };
    li.querySelector('[data-action="delete-bank"]').onclick = (e) => { e.stopPropagation(); confirmDeleteBank(bank); };
    list.appendChild(li);
  }
}

async function selectBank(bankId) {
  activeBankId = bankId;
  activePatchId = null;
  selectedPatchIds.clear();
  refreshBulkButtons();
  const bank = await getBank(bankId);
  document.getElementById('active-bank-text') && (document.getElementById('active-bank-text').textContent = bank?.name || '');
  await refreshBankList();
  await refreshPatchList();
  hidePatchInfo();
}

function promptRenameBank(bank) {
  if (bank.isFactory) { toast('Los bancos de fábrica no se pueden renombrar', 'error'); return; }
  showModal(`
    <h3>Renombrar Banco</h3>
    <input class="patch-info-input" id="modal-input" value="${escHtml(bank.name)}" style="width:100%;" autofocus>
    <div class="modal-actions">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
      <button class="btn btn-primary" id="modal-confirm">Aceptar</button>
    </div>`);
  document.getElementById('modal-confirm').onclick = async () => {
    const name = document.getElementById('modal-input').value.trim();
    if (name) {
      await updateBank(bank.id, { name });
      await refreshBankList();
      toast('Banco renombrado', 'success');
    }
    hideModal();
  };
}

async function confirmDeleteBank(bank) {
  if (bank.isFactory) { toast('Los bancos de fábrica no se pueden eliminar', 'error'); return; }
  showModal(`
    <h3>Eliminar Banco</h3>
    <p style="margin-bottom:1rem;color:var(--text-secondary);">Eliminar "${escHtml(bank.name)}" y todos sus patches?</p>
    <div class="modal-actions">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
      <button class="btn" style="color:var(--error);border-color:var(--error);" id="modal-confirm">Eliminar</button>
    </div>`);
  document.getElementById('modal-confirm').onclick = async () => {
    await deleteBank(bank.id);
    if (activeBankId === bank.id) { activeBankId = null; activePatchId = null; hidePatchInfo(); }
    await refreshBankList();
    await refreshPatchList();
    await updateStats();
    toast('Banco eliminado', 'success');
    hideModal();
  };
}

// ─── Patch List ───
async function refreshPatchList() {
  const list = document.getElementById('patch-list');
  list.innerHTML = '';

  if (!activeBankId) {
    list.innerHTML = '<li class="list-empty">Selecciona un banco primero</li>';
    return;
  }

  const patches = await getPatchesForBank(activeBankId);
  if (patches.length === 0) {
    list.innerHTML = '<li class="list-empty">Banco vacio. Importa patches.</li>';
    return;
  }

  for (const patch of patches) {
    const li = document.createElement('li');
    li.className = 'list-item' + (patch.id === activePatchId ? ' active' : '');
    const checked = selectedPatchIds.has(patch.id) ? ' checked' : '';
    li.innerHTML = `
      <input type="checkbox" class="patch-check" data-patch-id="${patch.id}"${checked} title="Seleccionar para renombrado masivo">
      <span class="item-name">${escHtml(patch.name)}</span>
      <span class="item-badge">${patch.category}</span>`;
    li.querySelector('.patch-check').onclick = (e) => {
      e.stopPropagation();
      togglePatchSelection(patch.id, e.target.checked);
    };
    li.onclick = () => selectPatch(patch.id);
    list.appendChild(li);
  }
}

function togglePatchSelection(patchId, checked) {
  if (checked) selectedPatchIds.add(patchId);
  else selectedPatchIds.delete(patchId);
  refreshBulkButtons();
}

function refreshBulkButtons() {
  const btn = document.getElementById('btn-bulk-rename');
  if (btn) {
    btn.disabled = false;
    btn.textContent = selectedPatchIds.size > 0
      ? `Renombrar ${selectedPatchIds.size}`
      : 'Renombrar';
  }
}

async function selectPatch(patchId) {
  activePatchId = patchId;
  await refreshPatchList();
  await loadPatchInfo();
}

// ─── Patch Info ───
async function loadPatchInfo() {
  if (!activePatchId) { hidePatchInfo(); return; }

  const patch = await getPatch(activePatchId);
  if (!patch) { hidePatchInfo(); return; }

  const bank = await getBank(patch.bankId);
  const isFactory = bank?.isFactory;

  document.getElementById('panel-patch-info').style.display = '';
  document.getElementById('panel-empty').style.display = 'none';

  document.getElementById('patch-name').value = patch.name || '';
  document.getElementById('patch-category').value = patch.category || 'Other';
  document.getElementById('patch-author').value = patch.author || '';
  document.getElementById('patch-notes').value = patch.notes || '';
  renderInterpretedParameters(patch, bank);

  // Factory patches: read-only fields
  const fields = ['patch-name', 'patch-category', 'patch-author', 'patch-notes'];
  for (const id of fields) {
    const el = document.getElementById(id);
    if (el) el.disabled = isFactory;
  }
  const delBtn = document.getElementById('btn-delete-patch');
  if (delBtn) delBtn.disabled = isFactory;

  const favBtn = document.getElementById('btn-fav');
  favBtn.textContent = patch.isFavorite ? '★ Favorito' : '☆ Favorito';
  favBtn.style.color = patch.isFavorite ? 'var(--warning)' : '';
  favBtn.onclick = async () => {
    await updatePatch(patch.id, { isFavorite: !patch.isFavorite });
    await loadPatchInfo();
    await updateStats();
    toast(patch.isFavorite ? 'Eliminado de favoritos' : 'Añadido a favoritos', 'success');
  };

  document.getElementById('btn-delete-patch').onclick = async () => {
    await deletePatch(activePatchId);
    activePatchId = null;
    hidePatchInfo();
    await refreshPatchList();
    await updateStats();
    toast('Patch eliminado', 'success');
  };

  // Patch field change handlers
  document.getElementById('patch-name').onchange = (e) => updatePatch(activePatchId, { name: e.target.value });
  document.getElementById('patch-category').onchange = (e) => updatePatch(activePatchId, { category: e.target.value });
  document.getElementById('patch-author').onchange = (e) => updatePatch(activePatchId, { author: e.target.value });
  document.getElementById('patch-notes').onchange = (e) => updatePatch(activePatchId, { notes: e.target.value });

  renderSysExViewer(patch, bank);
}

function renderInterpretedParameters(patch, bank) {
  const section = document.getElementById('interpreted-parameters');
  const body = document.getElementById('parameter-table-body');
  const format = document.getElementById('parameter-format');
  if (!section || !body || !format) return;
  body.replaceChildren();
  const modelId = bank?.modelId;
  if (!['behringer-pro800', 'behringer-deepmind12', 'behringer-dm12'].includes(modelId) || !patch.rawData) {
    section.hidden = true;
    return;
  }
  const rawData = patch.rawData instanceof Uint8Array ? patch.rawData : new Uint8Array(patch.rawData);
  if (modelId === 'behringer-pro800') {
    const version = rawData[4] || 111;
    format.textContent = `Pro-800 · Formato v${version}`;
    for (const parameter of decodePro800Parameters(rawData)) {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = parameter.name;
      const value = document.createElement('td');
      value.className = 'parameter-value';
      const selected = parameter.options?.[parameter.value];
      value.textContent = selected || (Array.isArray(parameter.value) ? parameter.value.join(', ') : String(parameter.value ?? '—'));
      const offset = document.createElement('td');
      offset.textContent = `${parameter.offset}–${parameter.offset + parameter.length - 1}`;
      const description = document.createElement('td');
      description.textContent = parameter.description;
      row.append(name, value, offset, description);
      body.appendChild(row);
    }
  } else if (modelId === 'behringer-deepmind12' || modelId === 'behringer-dm12') {
    format.textContent = `DeepMind 12 · 242 bytes`;
    for (const parameter of decodeDeepMindParameters(rawData)) {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = parameter.name;
      const value = document.createElement('td');
      value.className = 'parameter-value';
      if (parameter.kind === 'name') {
        value.textContent = parameter.displayValue || '—';
      } else if (parameter.kind === 'enum') {
        value.textContent = parameter.displayValue;
      } else if (parameter.kind === 'bipolar') {
        const bipolar = ((parameter.rawByte ?? 0) - 128);
        value.textContent = `${bipolar >= 0 ? '+' : ''}${bipolar}`;
      } else {
        value.textContent = parameter.rawByte != null ? String(parameter.rawByte) : '—';
      }
      const offset = document.createElement('td');
      const len = parameter.length || 1;
      offset.textContent = len > 1 ? `${parameter.offset}–${parameter.offset + len - 1}` : `${parameter.offset}`;
      const description = document.createElement('td');
      description.textContent = parameter.description;
      row.append(name, value, offset, description);
      body.appendChild(row);
    }
  }
  section.hidden = false;
}

function hidePatchInfo() {
  const sysexViewer = document.getElementById('sysex-viewer');
  if (sysexViewer) sysexViewer.hidden = true;
  document.getElementById('panel-patch-info').style.display = 'none';
  document.getElementById('panel-empty').style.display = 'flex';
}

// ─── SysEx detail viewer ───
let sysExShowMessage = false;

function renderSysExViewer(patch, bank) {
  const viewer = document.getElementById('sysex-viewer');
  if (!viewer) return;
  viewer.hidden = true;

  const info = buildSysExViewInfo(patch, bank);
  if (!info) return;

  const messageBtn = document.getElementById('btn-hex-message');
  if (messageBtn) messageBtn.hidden = !info.canMessage;

  const meta = document.getElementById('sysex-meta');
  if (meta) meta.textContent = info.meta;

  viewer.hidden = false;
  sysExShowMessage = false;
  updateSysExView(info);

  const btns = {
    decoded: document.getElementById('btn-hex-decoded'),
    message: messageBtn,
  };
  for (const [key, el] of Object.entries(btns)) {
    if (!el) continue;
    el.classList.toggle('active', (key === 'message') === sysExShowMessage);
    el.onclick = () => {
      sysExShowMessage = key === 'message';
      updateSysExView(info);
      for (const [k2, el2] of Object.entries(btns)) if (el2) el2.classList.toggle('active', (k2 === 'message') === sysExShowMessage);
    };
  }
}

function updateSysExView(info) {
  const bytes = sysExShowMessage && info.message ? info.message : info.rawData;
  const dump = document.getElementById('sysex-hex');
  if (dump) dump.textContent = hexDump(bytes);

  const copyBtn = document.getElementById('btn-copy-hex');
  const downloadBtn = document.getElementById('btn-download-syx');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const ok = await copyToClipboard(spacedHex(bytes));
      toast(ok ? `${bytes.length} B copiados` : 'No se pudo copiar', ok ? 'success' : 'error');
    };
  }
  if (downloadBtn) {
    const isMessage = sysExShowMessage && info.message;
    downloadBtn.disabled = !isMessage;
    downloadBtn.title = isMessage ? 'Descargar como fichero MIDI .syx' : 'Solo el mensaje F0…F7 se puede exportar como .syx';
    downloadBtn.onclick = isMessage
      ? () => downloadBytes(info.message, `${info.baseName}.syx`)
      : null;
  }
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Buttons ───
function setupButtons() {
  document.getElementById('btn-new-bank').onclick = () => {
    showModal(`
      <h3>Nuevo Banco</h3>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <div class="patch-info-field">
          <span class="patch-info-label">Nombre</span>
          <input class="patch-info-input" id="modal-bank-name" placeholder="Mi Banco" autofocus>
        </div>
        <div class="patch-info-field">
          <span class="patch-info-label">Modelo</span>
          <select class="param-select" id="modal-bank-model">
            <option value="generic">Generico</option>
            <option value="casio-cz101">Casio CZ-101</option>
            <option value="roland-juno106">Roland Juno-106</option>
            <option value="korg-ms2000">Korg MS2000</option>
            <option value="behringer-dm12">Behringer DeepMind 12</option>
            <option value="yamaha-dx7">Yamaha DX7</option>
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
        <button class="btn btn-primary" id="modal-confirm">Crear</button>
      </div>`);
    document.getElementById('modal-confirm').onclick = async () => {
      const name = document.getElementById('modal-bank-name').value.trim() || 'Nuevo Banco';
      const modelId = document.getElementById('modal-bank-model').value;
      const bank = await createBank({ name, modelId, manufacturer: '' });
      await refreshBankList();
      await selectBank(bank.id);
      await updateStats();
      toast(`Banco "${name}" creado`, 'success');
      hideModal();
    };
  };

  document.getElementById('btn-import').onclick = () => document.getElementById('file-input').click();
  document.getElementById('file-input').onchange = handleFileImport;

  document.getElementById('btn-export').onclick = handleExport;
  document.getElementById('btn-export-library').onclick = handleExportLibrary;
  document.getElementById('btn-bulk-rename').onclick = promptBulkRename;
  document.getElementById('btn-export-csv').onclick = handleExportCsv;
  document.getElementById('btn-import-csv').onclick = () => document.getElementById('csv-input').click();
  document.getElementById('btn-midi-connect').onclick = handleMidiConnect;
  document.getElementById('btn-midi-fetch').onclick = handleMidiFetch;
  document.getElementById('csv-input').onchange = handleImportCsv;

  document.getElementById('modal-overlay').onclick = (e) => {
    if (e.target === e.currentTarget) hideModal();
  };
}

async function handleMidiConnect() {
  try {
    midiAccess = await requestMidiAccess();
    const { inputs, outputs } = listMidiPorts(midiAccess);
    const output = outputs.find(port => /deep.?mind|dm.?12|pro.?800/i.test(port.name || '')) || outputs[0];
    const input = inputs.find(port => /deep.?mind|dm.?12|pro.?800/i.test(port.name || '')) || inputs[0];
    if (!output) throw new Error('No se encontró una salida MIDI');
    behringerMidiTransport?.close();
    behringerMidiTransport = createBehringerMidiTransport({ modelId: 'behringer-deepmind12', input, output });
    setStatus('connected', `MIDI conectado: ${output.name || 'salida MIDI'}`);
    toast('MIDI DeepMind 12 conectado', 'success');
  } catch (error) {
    setStatus('error', error.message);
    toast(error.message, 'error');
  }
}

async function handleMidiFetch() {
  if (!behringerMidiTransport) { toast('Conecta primero una salida MIDI', 'error'); return; }
  const isDeepMindModel = id => id && (id === 'behringer-deepmind12' || id === 'behringer-dm12');
  let bank = activeBankId ? await getBank(activeBankId) : null;
  if (!bank || !isDeepMindModel(bank.modelId)) {
    // Buscar un banco DeepMind existente o crear uno nuevo
    const allBanks = await getAllBanks();
    bank = allBanks.find(b => isDeepMindModel(b.modelId));
    if (!bank) {
      bank = await createBank({ name: 'DeepMind 12', modelId: 'behringer-deepmind12', manufacturer: 'Behringer' });
      await refreshBankList();
    }
    await selectBank(bank.id);
  }
  const controller = new AbortController();
  const button = document.getElementById('btn-midi-fetch');
  button.disabled = true;
  try {
    const patches = await fetchBehringerBank(behringerMidiTransport, { count: 128, signal: controller.signal, onProgress: ({ completed, total }) => setStatus('connecting', `Fetch DeepMind 12 ${completed}/${total}`) });
    for (const patch of patches) {
      const existing = (await getPatchesForBank(bank.id)).find(candidate => candidate.index === patch.slot);
      if (existing) await updatePatch(existing.id, { rawData: patch.rawData, name: getModelContract(bank.modelId)?.extractPatchName?.(patch.rawData) || existing.name });
      else await createPatch(bank.id, { index: patch.slot, rawData: patch.rawData, name: getModelContract(bank.modelId)?.extractPatchName?.(patch.rawData) || `P${patch.slot + 1}` });
    }
    await refreshPatchList(); await updateStats(); setStatus('connected', 'Listo'); toast('Fetch DeepMind 12 completado', 'success');
  } catch (error) { setStatus('error', error.message); toast(error.message, 'error'); }  finally { button.disabled = false; }
}

// ─── Bulk rename ───
// Ámbitos del renombrado masivo: selección actual, banco activo o toda la
// librería. Cada patch se resuelve con el contrato y el nombre de su propio
// banco (un patch de CZ y otro de MS2000 reciben su dirección correspondiente).
async function resolveBulkEntries(scopeId, allPatches, bankPatches, bankById) {
  let patches;
  if (scopeId === 'selection') patches = allPatches.filter(p => selectedPatchIds.has(p.id));
  else if (scopeId === 'bank') patches = bankPatches;
  else patches = allPatches;

  return patches.map(p => {
    const bank = bankById.get(p.bankId);
    return {
      patch: p,
      bank,
      contract: bank ? getModelContract(bank.modelId) || null : null
    };
  }).sort((a, b) =>
    (a.bank?.name || '').localeCompare(b.bank?.name || '') || a.patch.index - b.patch.index
  );
}

async function promptBulkRename() {
  const banks = await getAllBanks();
  const bankById = new Map(banks.map(b => [b.id, b]));
  const bankPatches = activeBankId ? await getPatchesForBank(activeBankId) : [];
  const allPatches = await getAllPatches();

  if (allPatches.length === 0) {
    toast('No hay parches para renombrar', 'error');
    return;
  }

  const scopes = [];
  if (selectedPatchIds.size > 0) scopes.push({ id: 'selection', label: `Selección (${selectedPatchIds.size})` });
  if (activeBankId) scopes.push({ id: 'bank', label: `Banco activo (${bankPatches.length})` });
  scopes.push({ id: 'library', label: `Toda la librería (${allPatches.length})` });

  const defaultScope = selectedPatchIds.size > 0 ? 'selection' : (activeBankId ? 'bank' : 'library');
  const defaultTemplate = defaultScope === 'library' ? '{bank} {address}' : 'BRASS {address}';

  showModal(`
    <h3>Renombrar parches</h3>
    <div style="display:flex;flex-direction:column;gap:0.75rem;">
      <div class="patch-info-field">
        <span class="patch-info-label">Ámbito</span>
        <select class="param-select" id="modal-scope">
          ${scopes.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="patch-info-field">
        <span class="patch-info-label">Plantilla</span>
        <input class="patch-info-input" id="modal-template" value="${defaultTemplate}" autofocus>
        <span style="font-size:0.7rem;color:var(--text-secondary);">
          Placeholders: {name} {index} {address} {model} {bank}
        </span>
      </div>
      <div class="patch-info-field">
        <span class="patch-info-label">Vista previa</span>
        <div id="modal-preview" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text-secondary);"></div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancelar</button>
      <button class="btn btn-primary" id="modal-confirm">Renombrar</button>
    </div>`);

  const scopeId = () => document.getElementById('modal-scope')?.value || defaultScope;
  const entriesForScope = (id) => resolveBulkEntries(id, allPatches, bankPatches, bankById);

  const preview = async () => {
    const template = document.getElementById('modal-template').value;
    const entries = await entriesForScope(scopeId());
    const sample = entries.slice(0, 3).map(e =>
      applyRenameTemplate(template, {
        name: e.patch.name, index: e.patch.index,
        contract: e.contract, bankName: e.bank?.name || ''
      })
    );
    const info = document.getElementById('modal-preview');
    info.textContent = sample.length ? sample.join(' · ') : '(sin parches en este ámbito)';
  };

  document.getElementById('modal-scope').onchange = preview;
  document.getElementById('modal-template').oninput = preview;
  preview();

  document.getElementById('modal-confirm').onclick = async () => {
    const template = document.getElementById('modal-template').value;
    const entries = await entriesForScope(scopeId());
    if (entries.length === 0) {
      toast('No hay parches en el ámbito seleccionado', 'error');
      return;
    }
    const validation = validateRenameTemplate(template, entries.length);
    if (!validation.valid) {
      toast(validation.reason, 'error');
      return;
    }
    let updated = 0;
    for (const e of entries) {
      const name = applyRenameTemplate(template, {
        name: e.patch.name, index: e.patch.index,
        contract: e.contract, bankName: e.bank?.name || ''
      });
      await updatePatch(e.patch.id, { name });
      updated++;
    }
    selectedPatchIds.clear();
    refreshBulkButtons();
    await refreshBankList();
    await refreshPatchList();
    if (activePatchId) await loadPatchInfo();
    toast(`${updated} parches renombrados`, 'success');
    hideModal();
  };
}

// ─── CSV names ───
function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleExportCsv() {
  const banks = await getAllBanks();
  const patches = await getAllPatches();
  if (patches.length === 0) {
    toast('No hay parches para exportar', 'error');
    return;
  }
  const bankById = new Map(banks.map(b => [b.id, b]));
  const rows = patches.map(p => {
    const bank = bankById.get(p.bankId);
    const contract = getModelContract(bank?.modelId) || null;
    return {
      bankId: p.bankId,
      bankName: bank?.name || '',
      index: p.index,
      name: p.name,
      contract
    };
  });
  downloadText(`abd-patch-names-${new Date().toISOString().slice(0, 10)}.csv`, patchesToCsv(rows));
  toast(`Exportados ${rows.length} nombres a CSV`, 'success');
}

async function handleImportCsv(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const text = await file.text();
  const { rows, errors } = parseNamesCsv(text);
  errors.forEach(err => toast(err, 'warning'));

  if (rows.length === 0) {
    toast('No se encontraron filas válidas en el CSV', 'error');
    return;
  }

  const banks = await getAllBanks();
  const bankById = new Map(banks.map(b => [b.id, b]));
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const bank = bankById.get(row.bankId);
    if (!bank) { skipped++; continue; }
    const patches = await getPatchesForBank(bank.id);
    const patch = patches.find(p => p.index === row.index);
    if (!patch || !row.name) { skipped++; continue; }
    await updatePatch(patch.id, { name: row.name });
    updated++;
  }

  if (updated > 0) {
    await refreshPatchList();
    if (activePatchId) await loadPatchInfo();
  }
  toast(skipped > 0
    ? `${updated} nombres actualizados (${skipped} ignorados: fila sin patch o nombre vacío)`
    : `${updated} nombres actualizados`, 'success');
}

async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  setStatus('connecting', `Importando ${file.name}...`);

  const result = await importFile(file);
  if (!result.success) {
    setStatus('error', result.error);
    toast(result.error, 'error');
    return;
  }

  // Librería multi-banco (manifest v3) o banco único (v1/v2)
  let bankId = null;
  if (result.banks && result.banks.length > 0) {
    let total = 0;
    for (const { bank, patches } of result.banks) {
      const importResult = await importBank(bank, patches, { deduplication: 'skip' });
      total += importResult.importedCount;
      if (!bankId) bankId = importResult.bankId;
    }
    await refreshBankList();
    await selectBank(bankId);
    await updateStats();
    setStatus('connected', 'Listo');
    toast(`Librería importada: ${result.banks.length} bancos, ${total} patches`, 'success');
  } else {
    const importResult = await importBank(result.bank, result.patches, { deduplication: 'skip' });
    bankId = importResult.bankId;
    await refreshBankList();
    if (bankId) await selectBank(bankId);
    await updateStats();
    setStatus('connected', 'Listo');
    const duplicateText = importResult.duplicateCount > 0
      ? ` (${importResult.duplicateCount} duplicados omitidos)`
      : '';
    toast(`Importado: ${importResult.importedCount} patches${duplicateText}`, 'success');
  }

  if (result.warnings && result.warnings.length > 0) {
    result.warnings.forEach(w => toast(w, 'warning'));
  }
}

async function handleExport() {
  if (!activeBankId) {
    toast('Selecciona un banco para exportar', 'error');
    return;
  }

  setStatus('connecting', 'Exportando...');
  const { bank, patches } = await exportBank(activeBankId);
  const result = await exportToFile(bank, patches, 'abdbank');

  if (result.success) {
    setStatus('connected', 'Listo');
    toast(`Exportado: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`, 'success');
  } else {
    setStatus('error', result.error);
    toast(result.error, 'error');
  }
}

async function handleExportLibrary() {
  const banks = await getAllBanks();
  if (banks.length === 0) {
    toast('No hay bancos para exportar', 'error');
    return;
  }

  setStatus('connecting', 'Exportando librería...');
  const library = [];
  for (const bank of banks) {
    const patches = await getPatchesForBank(bank.id);
    library.push({ bank, patches });
  }

  const result = await exportLibraryToFile(library);

  if (result.success) {
    setStatus('connected', 'Listo');
    toast(`Librería exportada: ${result.bankCount} bancos (${(result.size / 1024).toFixed(1)} KB)`, 'success');
  } else {
    setStatus('error', result.error);
    toast(result.error, 'error');
  }
}

// ─── Utils ───
function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ─── Global functions for HTML onclick ───
window.toggleSection = (toggleEl) => {
  const section = toggleEl.closest('.sidebar-section');
  const icon = toggleEl.querySelector('span');
  section.classList.toggle('collapsed');
  icon.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
};

// ─── Start ───
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
