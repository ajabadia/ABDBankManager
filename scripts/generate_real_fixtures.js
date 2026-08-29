#!/usr/bin/env node
/**
 * Genera fixtures SysEx reales (válidos) para Casio CZ, Roland Juno, Korg MS2000
 * usando los contratos canónicos. Cada archivo .syx contiene un banco completo.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Importar contratos desde el bundle generado
const modelContractsUrl = 'file://' + path.join(ROOT, 'WebUI', 'src', 'contracts', 'gen', 'modelContracts.gen.js').replace(/\\/g, '/');

async function main() {
  const { modelContractMap } = await import(modelContractsUrl);

  const fixtures = [
    // Casio CZ
    { modelId: 'casio-cz101', bankCount: 1, outDir: 'fixtures/sysex/casio-cz/factory', prefix: 'CZ101' },
    { modelId: 'casio-cz1000', bankCount: 1, outDir: 'fixtures/sysex/casio-cz/factory', prefix: 'CZ1000' },
    { modelId: 'casio-cz5000', bankCount: 2, outDir: 'fixtures/sysex/casio-cz/factory', prefix: 'CZ5000' },
    { modelId: 'casio-cz1', bankCount: 4, outDir: 'fixtures/sysex/casio-cz/factory', prefix: 'CZ1' },

    // Roland Juno
    { modelId: 'roland-juno106', bankCount: 2, outDir: 'fixtures/sysex/roland-juno/factory', prefix: 'Juno106' },
    { modelId: 'roland-juno60', bankCount: 2, outDir: 'fixtures/sysex/roland-juno/factory', prefix: 'Juno60' },
    { modelId: 'roland-juno6', bankCount: 2, outDir: 'fixtures/sysex/roland-juno/factory', prefix: 'Juno6' },
    { modelId: 'roland-hs60', bankCount: 2, outDir: 'fixtures/sysex/roland-juno/factory', prefix: 'HS60' },

    // Korg
    { modelId: 'korg-ms2000', bankCount: 8, outDir: 'fixtures/sysex/korg-ms2000/factory', prefix: 'MS2000' },
    { modelId: 'korg-microkorg', bankCount: 8, outDir: 'fixtures/sysex/korg-microkorg/factory', prefix: 'MicroKORG' },
    { modelId: 'korg-prophecy', bankCount: 8, outDir: 'fixtures/sysex/korg-prophecy/factory', prefix: 'Prophecy' },
  ];

  for (const { modelId, bankCount, outDir, prefix } of fixtures) {
    const contract = modelContractMap.get(modelId);
    if (!contract) {
      console.warn(`⚠️  ${modelId}: contrato no encontrado`);
      continue;
    }

    const fullOutDir = path.join(process.cwd(), outDir);
    fs.mkdirSync(fullOutDir, { recursive: true });

    for (let bank = 0; bank < bankCount; bank++) {
      const messages = [];
      for (let slot = 0; slot < contract.programsPerBank; slot++) {
        const globalIndex = bank * contract.programsPerBank + slot;
        const rawData = generateDeterministicPatch(contract.patchDataSize, globalIndex);
        const sysex = contract.buildPatchSysEx(rawData, globalIndex, 0);
        messages.push(sysex);
      }

      // Concatenate all messages into a single bank file
      const totalLength = messages.reduce((sum, m) => sum + m.length, 0);
      const bankData = new Uint8Array(totalLength);
      let offset = 0;
      for (const msg of messages) {
        bankData.set(msg, offset);
        offset += msg.length;
      }

      const bankName = `${prefix}_Bank_${String.fromCharCode(65 + bank)}.syx`;
      const outPath = path.join(fullOutDir, bankName);
      fs.writeFileSync(outPath, bankData);
      console.log(`✅ ${outPath} (${bankData.length} bytes, ${messages.length} patches)`);
    }
  }

  console.log('\n✅ Fixtures generados');
}

function generateDeterministicPatch(size, index) {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = (i * 37 + index * 13 + 7) & 0xFF;
  }
  return data;
}

main().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});