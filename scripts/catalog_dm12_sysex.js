import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve('DOCS/LIBRERÍAS-dm12-borrar');
const rows = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filePath);
    else if (entry.name.toLowerCase().endsWith('.syx')) {
      const bytes = fs.readFileSync(filePath);
      const messages = [];
      let start = -1;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0xF0 && start < 0) start = i;
        if (bytes[i] === 0xF7 && start >= 0) {
          messages.push(bytes.subarray(start, i + 1));
          start = -1;
        }
      }
      const headers = [...new Set(messages.map(message => Array.from(message.slice(0, 10)).map(byte => byte.toString(16).padStart(2, '0')).join(' ')))];
      rows.push({
        file: path.relative(process.cwd(), filePath).replaceAll('\\', '/'),
        bytes: bytes.length,
        messages: messages.length,
        lengths: [...new Set(messages.map(message => message.length))].sort((a, b) => a - b),
        headers,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex')
      });
    }
  }
}

walk(root);
rows.sort((a, b) => a.file.localeCompare(b.file));
fs.writeFileSync('DOCS/dm12-library-catalog.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, files: rows }, null, 2)}\n`);
console.log(`Catalogados ${rows.length} archivos SysEx DeepMind 12`);
