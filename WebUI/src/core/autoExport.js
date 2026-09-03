/**
 * ABD Bank Manager — Auto-export module
 *
 * Tracks library changes and periodically saves a .abdlibrary backup
 * to disk via the JUCE native bridge (saveBackup action).
 *
 * - Every CHANGE_THRESHOLD changes → auto-export
 * - On beforeunload (app close) → auto-export if pending changes
 * - Exports are capped at MAX_BACKUPS on disk (JUCE side keeps last 10)
 */

import { buildLibraryZip } from './exportEngine.js';
import { getAllBanks, getPatchesForBank } from '../store/persistence.js';

const CHANGE_THRESHOLD = 30;        // auto-export every N changes
const DEBOUNCE_MS = 2000;           // debounce rapid changes
const BACKUP_PREFIX = 'abd-auto-';

let changeCount = 0;
let lastExportTime = 0;
let debounceTimer = null;
let isExporting = false;
let bridgeRef = null;

/**
 * Initialize auto-export with a reference to the bridge manager.
 * @param {import('../bridge/bridgeManager.js').default} bridge
 */
export function initAutoExport(bridge) {
  bridgeRef = bridge;

  // Listen for backupSaved responses from native
  bridge.on('backupSaved', (payload) => {
    if (payload?.success) {
      lastExportTime = Date.now();
      console.log('[AutoExport] Backup saved to disk');
    } else {
      console.warn('[AutoExport] Backup failed:', payload?.error);
    }
    isExporting = false;
  });

  // Auto-export on app close
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (changeCount > 0 && !isExporting) {
        // Synchronous attempt — best effort on close
        triggerImmediateExport();
      }
    });
  }
}

/**
 * Call this after every library mutation (create, update, delete, move).
 */
export function recordChange() {
  changeCount++;

  if (changeCount >= CHANGE_THRESHOLD && !isExporting) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      triggerAutoExport();
    }, DEBOUNCE_MS);
  }
}

/**
 * Force an immediate export (used on close or manual trigger).
 */
function triggerImmediateExport() {
  if (isExporting || !bridgeRef) return;
  isExporting = true;

  buildBackupZip()
    .then((result) => {
      if (result) sendBackupToNative(result.filename, result.data);
      else isExporting = false;
    })
    .catch(() => { isExporting = false; });
}

/**
 * Auto-export after reaching the change threshold.
 */
async function triggerAutoExport() {
  if (isExporting || !bridgeRef) return;
  isExporting = true;

  try {
    const result = await buildBackupZip();
    if (result) {
      sendBackupToNative(result.filename, result.data);
    } else {
      isExporting = false;
    }
  } catch (err) {
    console.warn('[AutoExport] Export failed:', err);
    isExporting = false;
  }
}

/**
 * Build the .abdlibrary ZIP and return as base64.
 */
async function buildBackupZip() {
  const allBanks = await getAllBanks();
  if (!allBanks || allBanks.length === 0) return null;

  const banksData = [];
  for (const bank of allBanks) {
    const patches = await getPatchesForBank(bank.id);
    banksData.push({ bank, patches });
  }

  const zip = await buildLibraryZip(banksData);
  const blob = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // Convert to base64
  let binary = '';
  for (let i = 0; i < blob.length; i++) {
    binary += String.fromCharCode(blob[i]);
  }
  const base64 = btoa(binary);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${BACKUP_PREFIX}${ts}.abdlibrary`;

  return { filename, data: base64 };
}

/**
 * Send backup data to JUCE native for disk persistence.
 */
function sendBackupToNative(filename, base64Data) {
  if (!bridgeRef) return;

  bridgeRef.send('saveBackup', { filename, data: base64Data });
  changeCount = 0;
}

/**
 * Get stats about auto-export state.
 */
export function getAutoExportStats() {
  return {
    pendingChanges: changeCount,
    threshold: CHANGE_THRESHOLD,
    lastExportTime,
    isExporting
  };
}

/**
 * Reset the change counter (e.g., after a manual export).
 */
export function resetChangeCounter() {
  changeCount = 0;
  clearTimeout(debounceTimer);
}
