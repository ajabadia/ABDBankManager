// ABDBankManager — Project Scaffold Generator (CommonJS)
// Usage: node scaffold.js (run from D:\desarrollos\ABDSynths\ABDBankManager)

const fs = require('fs');
const path = require('path');

const root = process.cwd();

console.log('🎹 ABDBankManager — Scaffolding project via Node.js...');

const dirs = [
  'DOCS',
  'packages/core/src/models',
  'packages/core/src/operations',
  'packages/core/src/search',
  'packages/core/src/persistence',
  'packages/core/tests',
  'packages/contracts/src',
  'packages/contracts/tests',
  'packages/adapters/src/models',
  'packages/adapters/src/importers',
  'packages/adapters/src/exporters',
  'packages/adapters/src/hardware',
  'packages/adapters/assets/thumbnails',
  'packages/adapters/tests',
  'packages/ui/src/components',
  'packages/ui/src/styles',
  'packages/ui/tests',
  'apps/standalone/src',
  'cpp',
  'scripts'
];

for (const d of dirs) {
  fs.mkdirSync(path.join(root, d), { recursive: true });
}
console.log('  ✅ Directories created');

function writeFile(relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.writeFileSync(fullPath, content.trimStart(), 'utf-8');
}

// 1. Root package.json
writeFile('package.json', JSON.stringify({
  name: "@abdsynths/bank-manager",
  version: "0.1.0",
  description: "Universal Bank Manager for ABDSynths — cross-project synthesizer patch library, SysEx management, and hardware communication",
  private: true,
  type: "module",
  workspaces: [
    "packages/core",
    "packages/contracts",
    "packages/adapters",
    "packages/ui"
  ],
  scripts: {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  devDependencies: {
    "vitest": "^3.0.0"
  }
}, null, 2));

// 2. .gitignore
writeFile('.gitignore', `
node_modules/
dist/
.DS_Store
*.log
.env
coverage/
.vitest/
packages/*/node_modules/
`);

// 3. packages/contracts/package.json
writeFile('packages/contracts/package.json', JSON.stringify({
  name: "@abdsynths/bank-manager-contracts",
  version: "0.1.0",
  description: "Contract interfaces for the ABD Universal Bank Manager",
  type: "module",
  main: "src/index.js",
  exports: { ".": "./src/index.js" },
  scripts: { "test": "vitest run" }
}, null, 2));

// 4. packages/core/package.json
writeFile('packages/core/package.json', JSON.stringify({
  name: "@abdsynths/bank-manager-core",
  version: "0.1.0",
  description: "Core library — pure CRUD, search, persistence, fingerprinting",
  type: "module",
  main: "src/index.js",
  exports: { ".": "./src/index.js" },
  scripts: { "test": "vitest run" },
  dependencies: {
    "@abdsynths/bank-manager-contracts": "*",
    "dexie": "^4.0.0"
  }
}, null, 2));

// 5. packages/adapters/package.json
writeFile('packages/adapters/package.json', JSON.stringify({
  name: "@abdsynths/bank-manager-adapters",
  version: "0.1.0",
  description: "Import/Export adapters and ModelContract implementations per synthesizer",
  type: "module",
  main: "src/index.js",
  exports: { ".": "./src/index.js" },
  scripts: { "test": "vitest run" },
  dependencies: {
    "@abdsynths/bank-manager-contracts": "*"
  }
}, null, 2));

// 6. packages/ui/package.json
writeFile('packages/ui/package.json', JSON.stringify({
  name: "@abdsynths/bank-manager-ui",
  version: "0.1.0",
  description: "Reusable UI components — BankManagerModal, PatchList, SearchBar",
  type: "module",
  main: "src/index.js",
  exports: { ".": "./src/index.js" },
  scripts: { "test": "vitest run" },
  dependencies: {
    "@abdsynths/bank-manager-core": "*",
    "@abdsynths/bank-manager-contracts": "*"
  }
}, null, 2));

// 7. packages/contracts/src/ModelContract.js
writeFile('packages/contracts/src/ModelContract.js', `
/**
 * ModelContract — Defines a synthesizer's identity and capabilities.
 */

export function validateContract(contract) {
  const errors = [];
  const required = [
    'modelId', 'displayName', 'manufacturer', 'bankCapacity',
    'banksCount', 'programsPerBank', 'getProgramAddress',
    'patchDataSize', 'categories', 'sysexManufacturerId'
  ];

  for (const field of required) {
    if (contract[field] === undefined || contract[field] === null) {
      errors.push(\`Missing required field: \${field}\`);
    }
  }

  if (typeof contract.getProgramAddress !== 'function') {
    errors.push('getProgramAddress must be a function');
  }

  if (contract.bankCapacity !== contract.banksCount * contract.programsPerBank) {
    errors.push(\`bankCapacity (\${contract.bankCapacity}) !== banksCount * programsPerBank (\${contract.banksCount * contract.programsPerBank})\`);
  }

  return { valid: errors.length === 0, errors };
}

export function areModelsCompatible(source, target) {
  if (source.modelId === target.modelId) return true;
  return (source.compatibleModels || []).includes(target.modelId);
}
`);

// 8. packages/contracts/src/ImportAdapter.js
writeFile('packages/contracts/src/ImportAdapter.js', `
export function detectAdapter(data, filename, adapters) {
  for (const adapter of adapters) {
    try {
      if (adapter.canParse(data, filename)) {
        if (adapter.verifyChecksum && !adapter.verifyChecksum(data)) {
          console.warn(\`Adapter \${adapter.adapterId}: checksum failed for \${filename}\`);
          continue;
        }
        return adapter;
      }
    } catch (e) {
      console.warn(\`Adapter \${adapter.adapterId} threw during canParse:\`, e);
    }
  }
  return null;
}
`);

// 9. packages/contracts/src/ExportAdapter.js
writeFile('packages/contracts/src/ExportAdapter.js', `
// ExportAdapter interface reference
export const EXPORT_FORMATS = {
  SINGLE: 'single',
  BANK: 'bank'
};
`);

// 10. packages/contracts/src/HardwareLinkContract.js
writeFile('packages/contracts/src/HardwareLinkContract.js', `
// HardwareLinkContract interface reference
export const DEFAULT_MIDI_DELAYS = {
  MS2000: 20,
  JUNO106: 50,
  CZ101: 100,
  DEEPMIND: 10,
  DX7: 20
};
`);

// 11. packages/contracts/src/index.js
writeFile('packages/contracts/src/index.js', `
export { validateContract, areModelsCompatible } from './ModelContract.js';
export { detectAdapter } from './ImportAdapter.js';
export { EXPORT_FORMATS } from './ExportAdapter.js';
export { DEFAULT_MIDI_DELAYS } from './HardwareLinkContract.js';
`);

// 12. packages/core/src/models/Patch.js
writeFile('packages/core/src/models/Patch.js', `
export function createPatch(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name || 'Init',
    category: overrides.category || 'Other',
    author: overrides.author || '',
    tags: overrides.tags || [],
    notes: overrides.notes || '',
    isFavorite: overrides.isFavorite || false,
    rating: overrides.rating || 0,
    creationDate: overrides.creationDate || new Date().toISOString(),
    modifiedDate: overrides.modifiedDate || new Date().toISOString(),
    originModel: overrides.originModel || '',
    originAddress: overrides.originAddress || '',
    originBank: overrides.originBank || '',
    rawData: overrides.rawData || null,
    parameters: overrides.parameters || null,
    fingerprint: overrides.fingerprint || '',
    previousVersionId: overrides.previousVersionId || undefined,
    versionNumber: overrides.versionNumber || 1,
    importSource: overrides.importSource || '',
    importDate: overrides.importDate || new Date().toISOString(),
  };
}
`);

// 13. packages/core/src/models/Bank.js
writeFile('packages/core/src/models/Bank.js', `
export function createBank(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name || 'New Bank',
    modelId: overrides.modelId || '',
    isFactory: overrides.isFactory || false,
    isLocked: overrides.isLocked || false,
    patches: overrides.patches || [],
    source: overrides.source || null,
    creationDate: overrides.creationDate || new Date().toISOString(),
    modifiedDate: overrides.modifiedDate || new Date().toISOString(),
  };
}
`);

// 14. packages/core/src/operations/fingerprint.js
writeFile('packages/core/src/operations/fingerprint.js', `
export async function calculateFingerprint(rawData, contract) {
  if (!rawData || rawData.length === 0) return '';

  const soundBytes = contract?.extractSoundBytes
    ? contract.extractSoundBytes(rawData)
    : rawData;

  const hashBuffer = await crypto.subtle.digest('SHA-256', soundBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function checkDuplicate(fingerprint, existingPatches) {
  if (!fingerprint) return { isDuplicate: false, existingPatch: null };
  const match = existingPatches.find(p => p.fingerprint === fingerprint);
  return { isDuplicate: !!match, existingPatch: match || null };
}
`);

// 15. packages/core/src/index.js
writeFile('packages/core/src/index.js', `
export { createPatch } from './models/Patch.js';
export { createBank } from './models/Bank.js';
export { calculateFingerprint, checkDuplicate } from './operations/fingerprint.js';
`);

// 16. packages/core/tests/fingerprint.test.js
writeFile('packages/core/tests/fingerprint.test.js', `
import { describe, it, expect } from 'vitest';
import { calculateFingerprint, checkDuplicate } from '../src/operations/fingerprint.js';

describe('calculateFingerprint', () => {
  it('should return empty string for null or empty data', async () => {
    expect(await calculateFingerprint(null)).toBe('');
    expect(await calculateFingerprint(new Uint8Array([]))).toBe('');
  });

  it('should return consistent SHA-256 hex hash', async () => {
    const data = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, 0x00, 0xF7]);
    const h1 = await calculateFingerprint(data);
    const h2 = await calculateFingerprint(data);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('should distinguish different sound data', async () => {
    const d1 = new Uint8Array([0xF0, 0x42, 0x30, 0xF7]);
    const d2 = new Uint8Array([0xF0, 0x42, 0x31, 0xF7]);
    expect(await calculateFingerprint(d1)).not.toBe(await calculateFingerprint(d2));
  });
});

describe('checkDuplicate', () => {
  const patches = [
    { id: '1', name: 'Bass', fingerprint: 'hash_a' },
    { id: '2', name: 'Lead', fingerprint: 'hash_b' },
  ];

  it('detects existing duplicate', () => {
    const res = checkDuplicate('hash_a', patches);
    expect(res.isDuplicate).toBe(true);
    expect(res.existingPatch.name).toBe('Bass');
  });

  it('returns false for new hash', () => {
    const res = checkDuplicate('hash_c', patches);
    expect(res.isDuplicate).toBe(false);
    expect(res.existingPatch).toBeNull();
  });
});
`);

// 17. packages/contracts/tests/ModelContract.test.js
writeFile('packages/contracts/tests/ModelContract.test.js', `
import { describe, it, expect } from 'vitest';
import { validateContract, areModelsCompatible } from '../src/ModelContract.js';

describe('validateContract', () => {
  const validContract = {
    modelId: 'korg-ms2000',
    displayName: 'Korg MS2000',
    manufacturer: 'Korg',
    bankCapacity: 128,
    banksCount: 8,
    programsPerBank: 16,
    getProgramAddress: (i) => \`\${'ABCDEFGH'[Math.floor(i/16)]}.\${String((i%16)+1).padStart(2,'0')}\`,
    patchDataSize: 288,
    categories: ['Bass','Lead','Pad','FX','Keys'],
    sysexManufacturerId: [0x42],
    formatVersion: 1,
  };

  it('validates a correct contract', () => {
    const res = validateContract(validContract);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('catches missing fields', () => {
    const { modelId, ...incomplete } = validContract;
    const res = validateContract(incomplete);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Missing required field: modelId');
  });
});

describe('areModelsCompatible', () => {
  const ms2000 = { modelId: 'korg-ms2000', compatibleModels: ['korg-microkorg'] };
  const microkorg = { modelId: 'korg-microkorg', compatibleModels: ['korg-ms2000'] };
  const cz101 = { modelId: 'casio-cz101', compatibleModels: ['casio-cz1000'] };

  it('handles self compatibility', () => {
    expect(areModelsCompatible(ms2000, ms2000)).toBe(true);
  });

  it('detects compatible model pair', () => {
    expect(areModelsCompatible(ms2000, microkorg)).toBe(true);
  });

  it('blocks incompatible models', () => {
    expect(areModelsCompatible(ms2000, cz101)).toBe(false);
  });
});
`);

// 18. vitest.config.js
writeFile('vitest.config.js', `
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.js'],
  },
});
`);

// 19. README.md
writeFile('README.md', `
# ABD Universal Bank Manager

Universal synthesizer patch library, SysEx management, and hardware communication for all ABDSynths projects.

## Architecture

\`\`\`
@abdsynths/bank-manager (monorepo)
├── packages/contracts   ← ModelContract, ImportAdapter, ExportAdapter, HardwareLinkContract
├── packages/core        ← Pure CRUD, search, fingerprinting, persistence (Dexie.js)
├── packages/adapters    ← Per-synth implementations (CZ-101, Juno-106, MS2000, DM12, DX7...)
├── packages/ui          ← Reusable UI components (BankManagerModal, PatchList, SearchBar)
├── apps/standalone      ← Tauri desktop + Vite SPA
└── cpp/                 ← C++ integration for JUCE plugins (CMake add_subdirectory)
\`\`\`

## Quick Start

\`\`\`bash
npm install
npm test
\`\`\`

## License
MIT — ABD Synths
`);

console.log('🎉 ABDBankManager scaffolded successfully!');
console.log('👉 Next: npm install && npm test');
