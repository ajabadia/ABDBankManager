# ABDBankManager — Project Scaffold Script
# Run from: D:\desarrollos\ABDSynths\ABDBankManager\
# Usage: .\scaffold.ps1

Write-Host "🎹 ABDBankManager — Scaffolding project..." -ForegroundColor Cyan

# ─── Directory Structure ───
$dirs = @(
    "DOCS",
    "packages\core\src\models",
    "packages\core\src\operations",
    "packages\core\src\search",
    "packages\core\src\persistence",
    "packages\core\tests",
    "packages\contracts\src",
    "packages\contracts\tests",
    "packages\adapters\src\models",
    "packages\adapters\src\importers",
    "packages\adapters\src\exporters",
    "packages\adapters\src\hardware",
    "packages\adapters\assets\thumbnails",
    "packages\adapters\tests",
    "packages\ui\src\components",
    "packages\ui\src\styles",
    "packages\ui\tests",
    "apps\standalone\src",
    "cpp",
    "scripts"
)

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Write-Host "  ✅ Directory structure created" -ForegroundColor Green

# ─── Root package.json ───
@'
{
  "name": "@abdsynths/bank-manager",
  "version": "0.1.0",
  "description": "Universal Bank Manager for ABDSynths — cross-project synthesizer patch library, SysEx management, and hardware communication",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/core",
    "packages/contracts",
    "packages/adapters",
    "packages/ui"
  ],
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint packages/",
    "build": "npm run build --workspaces --if-present",
    "clean": "node -e \"['core','contracts','adapters','ui'].forEach(p=>require('fs').rmSync('packages/'+p+'/dist',{recursive:true,force:true}))\""
  },
  "keywords": ["synthesizer", "sysex", "midi", "patch-manager", "bank-manager", "preset-library"],
  "author": "ABD Synths",
  "license": "MIT",
  "engines": { "node": ">=18.0.0" },
  "devDependencies": {
    "vitest": "^3.0.0",
    "eslint": "^9.0.0"
  }
}
'@ | Set-Content -Path "package.json" -Encoding UTF8

# ─── .gitignore ───
@'
node_modules/
dist/
.DS_Store
*.log
.env
coverage/
.vitest/
packages/*/node_modules/
'@ | Set-Content -Path ".gitignore" -Encoding UTF8

# ─── packages/contracts/package.json ───
@'
{
  "name": "@abdsynths/bank-manager-contracts",
  "version": "0.1.0",
  "description": "Contract interfaces for the ABD Universal Bank Manager",
  "type": "module",
  "main": "src/index.js",
  "exports": { ".": "./src/index.js" },
  "scripts": { "test": "vitest" }
}
'@ | Set-Content -Path "packages\contracts\package.json" -Encoding UTF8

# ─── packages/core/package.json ───
@'
{
  "name": "@abdsynths/bank-manager-core",
  "version": "0.1.0",
  "description": "Core library — pure CRUD, search, persistence, fingerprinting",
  "type": "module",
  "main": "src/index.js",
  "exports": { ".": "./src/index.js" },
  "scripts": { "test": "vitest" },
  "dependencies": {
    "@abdsynths/bank-manager-contracts": "*",
    "dexie": "^4.0.0",
    "uuid": "^11.0.0"
  }
}
'@ | Set-Content -Path "packages\core\package.json" -Encoding UTF8

# ─── packages/adapters/package.json ───
@'
{
  "name": "@abdsynths/bank-manager-adapters",
  "version": "0.1.0",
  "description": "Import/Export adapters and ModelContract implementations per synthesizer",
  "type": "module",
  "main": "src/index.js",
  "exports": { ".": "./src/index.js" },
  "scripts": { "test": "vitest" },
  "dependencies": {
    "@abdsynths/bank-manager-contracts": "*"
  }
}
'@ | Set-Content -Path "packages\adapters\package.json" -Encoding UTF8

# ─── packages/ui/package.json ───
@'
{
  "name": "@abdsynths/bank-manager-ui",
  "version": "0.1.0",
  "description": "Reusable UI components — BankManagerModal, PatchList, SearchBar",
  "type": "module",
  "main": "src/index.js",
  "exports": { ".": "./src/index.js" },
  "scripts": { "test": "vitest" },
  "dependencies": {
    "@abdsynths/bank-manager-core": "*",
    "@abdsynths/bank-manager-contracts": "*"
  }
}
'@ | Set-Content -Path "packages\ui\package.json" -Encoding UTF8

# ─── packages/contracts/src/ModelContract.js ───
@'
/**
 * ModelContract — Defines a synthesizer's identity and capabilities.
 * Each project registers one contract to scope the Bank Manager to its hardware.
 *
 * @typedef {Object} ModelContract
 * @property {string}   modelId              - Unique ID: 'casio-cz101', 'korg-ms2000', etc.
 * @property {string}   displayName          - Human-readable: 'Casio CZ-101'
 * @property {string}   manufacturer         - 'Casio', 'Roland', 'Korg', 'Behringer', 'Yamaha'
 * @property {string}   [icon]               - SVG or URL for logo
 * @property {string}   [thumbnail]          - Path to hardware photo (~200x120px WebP)
 * @property {number}   bankCapacity         - Total patches (e.g., 128)
 * @property {number}   banksCount           - Logical banks (e.g., 8)
 * @property {number}   programsPerBank      - Patches per bank (e.g., 16)
 * @property {function} getProgramAddress    - (globalIndex: number) => string  e.g. "A.01"
 * @property {function} [parseProgramAddress] - (address: string) => number|null
 * @property {number}   patchDataSize        - Bytes per patch blob
 * @property {number}   patchNameMaxLength   - Chars in patch name (0 if format has no names)
 * @property {function} [extractPatchName]   - (data: Uint8Array) => string
 * @property {function} [extractSoundBytes]  - (data: Uint8Array) => Uint8Array  (for fingerprint)
 * @property {string[]} categories           - ['Bass','Lead','Pad','FX','Keys','Perc','Synth','Other']
 * @property {string}   defaultCategory      - 'Other'
 * @property {string[]} [compatibleModels]   - Models with identical patch format
 * @property {number[]} sysexManufacturerId  - e.g. [0x42] for Korg
 * @property {number}   formatVersion        - Contract schema version
 */

/**
 * Validates a ModelContract object.
 * @param {Object} contract
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateContract(contract) {
  const errors = [];
  const required = ['modelId', 'displayName', 'manufacturer', 'bankCapacity',
                     'banksCount', 'programsPerBank', 'getProgramAddress',
                     'patchDataSize', 'categories', 'sysexManufacturerId'];

  for (const field of required) {
    if (contract[field] === undefined || contract[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof contract.getProgramAddress !== 'function') {
    errors.push('getProgramAddress must be a function');
  }

  if (contract.bankCapacity !== contract.banksCount * contract.programsPerBank) {
    errors.push(`bankCapacity (${contract.bankCapacity}) !== banksCount * programsPerBank (${contract.banksCount * contract.programsPerBank})`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if two models are patch-compatible (safe to transfer patches).
 * @param {ModelContract} source
 * @param {ModelContract} target
 * @returns {boolean}
 */
export function areModelsCompatible(source, target) {
  if (source.modelId === target.modelId) return true;
  return (source.compatibleModels || []).includes(target.modelId);
}
'@ | Set-Content -Path "packages\contracts\src\ModelContract.js" -Encoding UTF8

# ─── packages/contracts/src/ImportAdapter.js ───
@'
/**
 * ImportAdapter — Parses external format files into patches.
 *
 * @typedef {Object} ImportAdapter
 * @property {string}   adapterId
 * @property {string}   displayName
 * @property {string[]} supportedExtensions
 * @property {string[]} targetModelIds
 * @property {function} canParse          - (data: Uint8Array, filename: string) => boolean
 * @property {function} [verifyChecksum]  - (data: Uint8Array) => boolean
 * @property {function} parse             - (data: Uint8Array, filename: string) => ImportResult
 */

/**
 * @typedef {Object} ImportResult
 * @property {boolean}   success
 * @property {string}    modelId
 * @property {string}    bankName
 * @property {PatchData[]} patches
 * @property {string[]}  warnings
 * @property {string}    [error]
 */

/**
 * @typedef {Object} PatchData
 * @property {string}     name
 * @property {string}     category
 * @property {string}     author
 * @property {string[]}   tags
 * @property {string}     notes
 * @property {string}     originAddress
 * @property {Uint8Array} rawData
 * @property {Object}     [parameters]
 * @property {boolean}    isFavorite
 * @property {string}     creationDate
 */

/**
 * Auto-detect which adapter can parse the given data.
 * @param {Uint8Array} data
 * @param {string} filename
 * @param {ImportAdapter[]} adapters
 * @returns {ImportAdapter|null}
 */
export function detectAdapter(data, filename, adapters) {
  for (const adapter of adapters) {
    try {
      if (adapter.canParse(data, filename)) {
        // If adapter has checksum verification, run it
        if (adapter.verifyChecksum && !adapter.verifyChecksum(data)) {
          console.warn(`Adapter ${adapter.adapterId}: checksum failed for ${filename}`);
          continue;
        }
        return adapter;
      }
    } catch (e) {
      console.warn(`Adapter ${adapter.adapterId} threw during canParse:`, e);
    }
  }
  return null;
}
'@ | Set-Content -Path "packages\contracts\src\ImportAdapter.js" -Encoding UTF8

# ─── packages/contracts/src/ExportAdapter.js ───
@'
/**
 * ExportAdapter — Serializes patches to external format.
 *
 * @typedef {Object} ExportAdapter
 * @property {string}   adapterId
 * @property {string}   displayName
 * @property {string}   fileExtension
 * @property {string[]} targetModelIds
 * @property {function} serialize  - (patches, bankName, options?) => Uint8Array
 */

/**
 * @typedef {Object} ExportOptions
 * @property {boolean} includeRawData
 * @property {boolean} includeParameters
 * @property {number}  midiChannel
 * @property {number}  deviceId
 * @property {'single'|'bank'} format
 */
'@ | Set-Content -Path "packages\contracts\src\ExportAdapter.js" -Encoding UTF8

# ─── packages/contracts/src/HardwareLinkContract.js ───
@'
/**
 * HardwareLinkContract — Bidirectional MIDI communication with hardware.
 *
 * @typedef {Object} HardwareLinkContract
 * @property {string}   modelId
 * @property {boolean}  supportsEditBuffer
 * @property {function} [detectHardware]       - (outputs) => device|null
 * @property {function} buildPatchDump         - (patch, slot, channel) => Uint8Array[]
 * @property {function} [buildBankDump]        - (patches, channel) => Uint8Array[]
 * @property {function} [buildEditBufferDump]  - (patch, channel) => Uint8Array[]
 * @property {function} buildDumpRequest       - (slot|'all', channel) => Uint8Array
 * @property {function} parseDumpResponse      - (data) => ImportResult
 * @property {number}   interMessageDelayMs
 * @property {number}   dumpTimeoutMs
 */
'@ | Set-Content -Path "packages\contracts\src\HardwareLinkContract.js" -Encoding UTF8

# ─── packages/contracts/src/index.js ───
@'
export { validateContract, areModelsCompatible } from './ModelContract.js';
export { detectAdapter } from './ImportAdapter.js';
'@ | Set-Content -Path "packages\contracts\src\index.js" -Encoding UTF8

# ─── packages/core/src/models/Patch.js ───
@'
/**
 * Patch — Core data model for a synthesizer patch.
 */

/**
 * Creates a new Patch with defaults.
 * @param {Partial<import('./types').Patch>} overrides
 * @returns {import('./types').Patch}
 */
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
'@ | Set-Content -Path "packages\core\src\models\Patch.js" -Encoding UTF8

# ─── packages/core/src/models/Bank.js ───
@'
/**
 * Bank — A named collection of patches for a specific synthesizer model.
 */

/**
 * Creates a new Bank with defaults.
 * @param {Partial<import('./types').Bank>} overrides
 * @returns {import('./types').Bank}
 */
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
'@ | Set-Content -Path "packages\core\src\models\Bank.js" -Encoding UTF8

# ─── packages/core/src/operations/fingerprint.js ───
@'
/**
 * Patch Fingerprinting — SHA-256 hash of sound-relevant bytes.
 * Inspired by KnobKraft Orm's duplicate detection system.
 */

/**
 * Calculate a fingerprint (SHA-256 hex) for a patch's sound data.
 * @param {Uint8Array} rawData    - Full patch data blob
 * @param {Object} [contract]     - ModelContract (optional, for extractSoundBytes)
 * @returns {Promise<string>}     - Hex-encoded SHA-256 hash
 */
export async function calculateFingerprint(rawData, contract) {
  if (!rawData || rawData.length === 0) return '';

  // If contract provides extractSoundBytes, use it to strip name/metadata
  const soundBytes = contract?.extractSoundBytes
    ? contract.extractSoundBytes(rawData)
    : rawData;

  const hashBuffer = await crypto.subtle.digest('SHA-256', soundBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if a patch with the same fingerprint already exists.
 * @param {string} fingerprint
 * @param {Array} existingPatches
 * @returns {{ isDuplicate: boolean, existingPatch: Object|null }}
 */
export function checkDuplicate(fingerprint, existingPatches) {
  if (!fingerprint) return { isDuplicate: false, existingPatch: null };
  const match = existingPatches.find(p => p.fingerprint === fingerprint);
  return { isDuplicate: !!match, existingPatch: match || null };
}
'@ | Set-Content -Path "packages\core\src\operations\fingerprint.js" -Encoding UTF8

# ─── packages/core/src/index.js ───
@'
// Core Library — public API
export { createPatch } from './models/Patch.js';
export { createBank } from './models/Bank.js';
export { calculateFingerprint, checkDuplicate } from './operations/fingerprint.js';
'@ | Set-Content -Path "packages\core\src\index.js" -Encoding UTF8

# ─── packages/core/tests/fingerprint.test.js ───
@'
import { describe, it, expect } from 'vitest';
import { calculateFingerprint, checkDuplicate } from '../src/operations/fingerprint.js';

describe('calculateFingerprint', () => {
  it('should return empty string for null data', async () => {
    expect(await calculateFingerprint(null)).toBe('');
  });

  it('should return empty string for empty array', async () => {
    expect(await calculateFingerprint(new Uint8Array([]))).toBe('');
  });

  it('should return consistent hash for same data', async () => {
    const data = new Uint8Array([0xF0, 0x42, 0x30, 0x58, 0x40, 0x00, 0xF7]);
    const hash1 = await calculateFingerprint(data);
    const hash2 = await calculateFingerprint(data);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
  });

  it('should return different hash for different data', async () => {
    const data1 = new Uint8Array([0xF0, 0x42, 0x30, 0xF7]);
    const data2 = new Uint8Array([0xF0, 0x42, 0x31, 0xF7]);
    const hash1 = await calculateFingerprint(data1);
    const hash2 = await calculateFingerprint(data2);
    expect(hash1).not.toBe(hash2);
  });

  it('should use extractSoundBytes from contract if provided', async () => {
    const fullData = new Uint8Array([0x41, 0x42, 0x43, 0x00, 0x01, 0x02]); // "ABC" + sound
    const contract = {
      extractSoundBytes: (data) => data.slice(3), // Strip first 3 bytes (name)
    };
    const hashFull = await calculateFingerprint(fullData);
    const hashSound = await calculateFingerprint(fullData, contract);
    expect(hashFull).not.toBe(hashSound);
  });
});

describe('checkDuplicate', () => {
  const patches = [
    { id: '1', name: 'Bass', fingerprint: 'aaa' },
    { id: '2', name: 'Lead', fingerprint: 'bbb' },
  ];

  it('should detect existing duplicate', () => {
    const result = checkDuplicate('aaa', patches);
    expect(result.isDuplicate).toBe(true);
    expect(result.existingPatch.name).toBe('Bass');
  });

  it('should return false for new fingerprint', () => {
    const result = checkDuplicate('ccc', patches);
    expect(result.isDuplicate).toBe(false);
    expect(result.existingPatch).toBeNull();
  });

  it('should return false for empty fingerprint', () => {
    const result = checkDuplicate('', patches);
    expect(result.isDuplicate).toBe(false);
  });
});
'@ | Set-Content -Path "packages\core\tests\fingerprint.test.js" -Encoding UTF8

# ─── packages/contracts/tests/ModelContract.test.js ───
@'
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
    getProgramAddress: (i) => `${'ABCDEFGH'[Math.floor(i/16)]}.${String((i%16)+1).padStart(2,'0')}`,
    patchDataSize: 288,
    categories: ['Bass','Lead','Pad','FX','Keys'],
    sysexManufacturerId: [0x42],
    formatVersion: 1,
  };

  it('should validate a correct contract', () => {
    const result = validateContract(validContract);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing fields', () => {
    const { modelId, ...incomplete } = validContract;
    const result = validateContract(incomplete);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: modelId');
  });

  it('should reject capacity mismatch', () => {
    const bad = { ...validContract, bankCapacity: 100 };
    const result = validateContract(bad);
    expect(result.valid).toBe(false);
  });
});

describe('areModelsCompatible', () => {
  const ms2000 = { modelId: 'korg-ms2000', compatibleModels: ['korg-microkorg'] };
  const microkorg = { modelId: 'korg-microkorg', compatibleModels: ['korg-ms2000'] };
  const cz101 = { modelId: 'casio-cz101', compatibleModels: ['casio-cz1000'] };

  it('should be compatible with self', () => {
    expect(areModelsCompatible(ms2000, ms2000)).toBe(true);
  });

  it('should detect compatible models', () => {
    expect(areModelsCompatible(ms2000, microkorg)).toBe(true);
  });

  it('should block incompatible models', () => {
    expect(areModelsCompatible(ms2000, cz101)).toBe(false);
  });
});
'@ | Set-Content -Path "packages\contracts\tests\ModelContract.test.js" -Encoding UTF8

# ─── vitest.config.js ───
@'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.js'],
  },
});
'@ | Set-Content -Path "vitest.config.js" -Encoding UTF8

# ─── README.md ───
@'
# ABD Universal Bank Manager

> Universal synthesizer patch library, SysEx management, and hardware communication for all ABDSynths projects.

## Architecture

```
@abdsynths/bank-manager (monorepo)
├── packages/contracts   ← ModelContract, ImportAdapter, ExportAdapter, HardwareLinkContract
├── packages/core        ← Pure CRUD, search, fingerprinting, persistence (Dexie.js)
├── packages/adapters    ← Per-synth implementations (CZ-101, Juno-106, MS2000, DM12, DX7...)
├── packages/ui          ← Reusable UI components (BankManagerModal, PatchList, SearchBar)
├── apps/standalone      ← Tauri desktop + Vite SPA
└── cpp/                 ← C++ integration for JUCE plugins (CMake add_subdirectory)
```

## Supported Synthesizers

| Manufacturer | Models | Import | Export | Hardware Link |
|---|---|---|---|---|
| Casio | CZ-101, CZ-5000, CZ-1 | ✅ | ✅ | ✅ |
| Roland | Juno-106, Juno-60, Juno-6 | ✅ | ✅ | ✅ |
| Korg | MS2000, microKORG, Prophecy | ✅ | ✅ | ✅ |
| Behringer | DeepMind 12, Pro-800 | ✅ | ✅ | ✅ |
| Yamaha | DX7, DX7II | ✅ | ✅ | ✅ |

## Quick Start

```bash
npm install
npm test
```

## License

MIT — ABD Synths
'@ | Set-Content -Path "README.md" -Encoding UTF8

Write-Host ""
Write-Host "  ✅ Project scaffolded successfully!" -ForegroundColor Green
Write-Host "  📁 Directory: $PWD" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "    1. cd D:\desarrollos\ABDSynths\ABDBankManager" -ForegroundColor White
Write-Host "    2. .\scaffold.ps1" -ForegroundColor White
Write-Host "    3. npm install" -ForegroundColor White
Write-Host "    4. npm test" -ForegroundColor White
Write-Host "    5. git init && git add -A && git commit -m 'Initial scaffold'" -ForegroundColor White
Write-Host ""
