/**
 * Fetch DX7 bulk dump from M-Wave FM-1 via Web MIDI API.
 *
 * The FM-1 is a DX7-compatible device that receives SysEx but may not
 * support bulk dump output. This script attempts to:
 * 1. Find the FM-1 MIDI port
 * 2. Send a DX7 bulk dump request (F0 43 00 09 20 00 F7)
 * 3. Wait for and save the response
 *
 * Usage: Open this in a browser with Web MIDI support, or run via Node.js
 * with a MIDI library. For now, this is a documentation script.
 *
 * DX7 Bulk Dump Request:
 *   F0 43 00 09 20 00 F7 (8 bytes)
 *   - F0: SysEx start
 *   - 43: Yamaha manufacturer ID
 *   - 00: Device number (group 0)
 *   - 09: High address byte (bulk)
 *   - 20: Mid address byte
 *   - 00: Low address byte
 *   - F7: SysEx end
 *
 * Expected response: 4104 bytes
 *   F0 43 00 09 20 00 [4096 bytes voice data] checksum F7
 */

// DX7 bulk dump request
const DX7_BULK_REQUEST = new Uint8Array([0xF0, 0x43, 0x00, 0x09, 0x20, 0x00, 0xF7]);

// DX7 single voice request (for firmware v14+ which supports single param SysEx)
const DX7_SINGLE_REQUEST = new Uint8Array([0xF0, 0x43, 0x00, 0x09, 0x20, 0x00, 0xF7]);

console.log('=== M-Wave FM-1 DX7 Dump Fetcher ===');
console.log('');
console.log('FM-1 MIDI SysEx capabilities (from research):');
console.log('  ✅ Receives DX7 SysEx patches (bulk + single)');
console.log('  ✅ Receives single parameter SysEx (firmware v14+)');
console.log('  ❓ Bulk dump output — NOT confirmed');
console.log('  ❓ Single voice dump output — NOT confirmed');
console.log('');
console.log('Known firmware versions:');
console.log('  v9  — Initial release');
console.log('  v14 — Single parameter SysEx receive');
console.log('  v15 — Latest (Aug 2026)');
console.log('');
console.log('To fetch a dump from the FM-1:');
console.log('  1. Connect FM-1 via USB');
console.log('  2. Open the WebUI and go to MIDI Connect');
console.log('  3. Select the FM-1 port');
console.log('  4. Click "Fetch" — the app will send a bulk dump request');
console.log('  5. If the FM-1 responds, the dump will be saved');
console.log('');
console.log('If the FM-1 does NOT respond to bulk dump requests:');
console.log('  - Use Dexed to send patches TO the FM-1');
console.log('  - Use the factory ROM dumps (rom1a-4b.syx) as reference');
console.log('  - The FM-1 factory presets are DX7-compatible');
console.log('');
console.log('Bulk dump request hex:');
console.log('  ' + Array.from(DX7_BULK_REQUEST).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
