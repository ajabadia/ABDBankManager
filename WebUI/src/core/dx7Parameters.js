/**
 * Yamaha DX7 — Parameter Schema (VMEM: Voice Memory, 128 bytes)
 *
 * The 128-byte bulk dump uses the VMEM (compressed) format, NOT VCED.
 * VCED is the 155-byte uncompressed single voice format.
 *
 * Reference: Dexed packProgram/unpackProgram (asb2m10/dexed)
 * Verified against real ROM1A.syx dump.
 *
 * VMEM layout (128 bytes):
 *   Bytes 0–101:   6 operators × 17 bytes each (compressed from VCED's 21 bytes)
 *   Bytes 102–109: Pitch EG Rate 1–4, Level 1–4
 *   Byte 110:      Algorithm (0–31, bits 0–4)
 *   Byte 111:      Feedback (bits 0–2) + Oscillator Key Sync (bit 3)
 *   Byte 112:      LFO Speed (0–99)
 *   Byte 113:      LFO Delay (0–99)
 *   Byte 114:      LFO PM Depth (0–99)
 *   Byte 115:      LFO AM Depth (0–99)
 *   Byte 116:      LFO Key Sync (bit 0) + LFO Waveform (bits 1–3) + Pitch Mod Sens (bits 4–6)
 *   Byte 117:      Transpose (0–47, 24=C4)
 *   Bytes 118–127: Voice Name (10 ASCII chars)
 *
 * Each operator (17 bytes, compressed from VCED's 21 bytes):
 *   +0..+3:  EG Rate 1–4
 *   +4..+7:  EG Level 1–4
 *   +8:      Keyboard Left Scale (0–99)
 *   +9:      Keyboard Scale Curves L/R (packed: bits 0–1 = L curve, bits 2–3 = R curve)
 *   +10:     Rate Scaling (bits 0–2) + AM Sensitivity (bits 3–4)
 *   +11:     Detune (bits 0–3) + (unused bits 4–6)
 *   +12:     (reserved)
 *   +13:     (reserved)
 *   +14:     Output Level (0–99)
 *   +15:     Frequency Coarse (bits 1–5) + Frequency Mode (bit 0: 0=ratio, 1=fixed)
 *   +16:     Frequency Fine (0–99)
 */

const OP_SPACING = 17; // VMEM compressed operator size
const GLOBAL_START = 102;

/** @typedef {{ offset: number, size: number, type: string, name: string, description: string, section: string, enum?: Record<number, string>, min?: number, max?: number }} Dx7Param */

function opParams(opNumber) {
  const base = (6 - opNumber) * OP_SPACING;
  return [
    // EG rates (4 bytes)
    { offset: base,      size: 1, type: 'value', name: `OP${opNumber} EG Rate 1`,  description: `Operator ${opNumber} envelope rate 1 (attack)`, section: `OP${opNumber}` },
    { offset: base + 1,  size: 1, type: 'value', name: `OP${opNumber} EG Rate 2`,  description: `Operator ${opNumber} envelope rate 2 (decay 1)`, section: `OP${opNumber}` },
    { offset: base + 2,  size: 1, type: 'value', name: `OP${opNumber} EG Rate 3`,  description: `Operator ${opNumber} envelope rate 3 (decay 2)`, section: `OP${opNumber}` },
    { offset: base + 3,  size: 1, type: 'value', name: `OP${opNumber} EG Rate 4`,  description: `Operator ${opNumber} envelope rate 4 (release)`, section: `OP${opNumber}` },

    // EG levels (4 bytes)
    { offset: base + 4,  size: 1, type: 'value', name: `OP${opNumber} EG Level 1`, description: `Operator ${opNumber} envelope level 1 (attack)`, section: `OP${opNumber}` },
    { offset: base + 5,  size: 1, type: 'value', name: `OP${opNumber} EG Level 2`, description: `Operator ${opNumber} envelope level 2 (decay 1)`, section: `OP${opNumber}` },
    { offset: base + 6,  size: 1, type: 'value', name: `OP${opNumber} EG Level 3`, description: `Operator ${opNumber} envelope level 3 (decay 2)`, section: `OP${opNumber}` },
    { offset: base + 7,  size: 1, type: 'value', name: `OP${opNumber} EG Level 4`, description: `Operator ${opNumber} envelope level 4 (sustain)`, section: `OP${opNumber}` },

    // Keyboard scaling
    { offset: base + 8,  size: 1, type: 'value', name: `OP${opNumber} Kbd Scale`,  description: `Operator ${opNumber} keyboard left scale break point (0–99)`, section: `OP${opNumber}` },
    { offset: base + 9,  size: 1, type: 'packed', name: `OP${opNumber} Scale Curve`, description: `Operator ${opNumber} scale curves L/R (packed)`, section: `OP${opNumber}` },
    { offset: base + 10, size: 1, type: 'packed', name: `OP${opNumber} Rate Sc/AM`, description: `Operator ${opNumber} rate scaling + AM sensitivity (packed)`, section: `OP${opNumber}` },

    // Detune and reserved
    { offset: base + 11, size: 1, type: 'detune', name: `OP${opNumber} Detune`,    description: `Operator ${opNumber} detune (0–14, 7=center)`, section: `OP${opNumber}` },

    // Output
    { offset: base + 14, size: 1, type: 'value', name: `OP${opNumber} Output Level`, description: `Operator ${opNumber} output level (0–99)`, section: `OP${opNumber}` },

    // Frequency
    { offset: base + 15, size: 1, type: 'packed', name: `OP${opNumber} Freq Coarse/Mode`, description: `Operator ${opNumber} frequency coarse + mode (packed)`, section: `OP${opNumber}` },
    { offset: base + 16, size: 1, type: 'value', name: `OP${opNumber} Freq Fine`,  description: `Operator ${opNumber} frequency fine (0–99)`, section: `OP${opNumber}` },
  ];
}

function allOpParams() {
  const params = [];
  for (let op = 6; op >= 1; op--) {
    params.push(...opParams(op));
  }
  return params;
}

/**
 * Extract a packed field from a byte.
 * @param {number} value - The raw byte value
 * @param {number} mask - Bitmask (e.g., 0x07 for 3 bits)
 * @param {number} shift - Number of bits to shift right
 * @returns {number} The extracted field value
 */
function unpack(value, mask, shift) {
  return (value >> shift) & mask;
}

/** Global parameters at offsets 102–127 (VMEM format) */
const GLOBAL_PARAMS = [
  // Pitch EG (offsets 102–109)
  { offset: GLOBAL_START,     size: 1, type: 'value', name: 'Pitch EG Rate 1',  description: 'Pitch envelope rate 1 (attack)', section: 'Pitch EG' },
  { offset: GLOBAL_START + 1, size: 1, type: 'value', name: 'Pitch EG Rate 2',  description: 'Pitch envelope rate 2', section: 'Pitch EG' },
  { offset: GLOBAL_START + 2, size: 1, type: 'value', name: 'Pitch EG Rate 3',  description: 'Pitch envelope rate 3', section: 'Pitch EG' },
  { offset: GLOBAL_START + 3, size: 1, type: 'value', name: 'Pitch EG Rate 4',  description: 'Pitch envelope rate 4 (release)', section: 'Pitch EG' },
  { offset: GLOBAL_START + 4, size: 1, type: 'value', name: 'Pitch EG Level 1', description: 'Pitch envelope level 1 (attack)', section: 'Pitch EG' },
  { offset: GLOBAL_START + 5, size: 1, type: 'value', name: 'Pitch EG Level 2', description: 'Pitch envelope level 2', section: 'Pitch EG' },
  { offset: GLOBAL_START + 6, size: 1, type: 'value', name: 'Pitch EG Level 3', description: 'Pitch envelope level 3', section: 'Pitch EG' },
  { offset: GLOBAL_START + 7, size: 1, type: 'value', name: 'Pitch EG Level 4', description: 'Pitch envelope level 4 (sustain)', section: 'Pitch EG' },

  // Algorithm (offset 110, bits 0–4)
  { offset: GLOBAL_START + 8,  size: 1, type: 'enum', name: 'Algorithm', description: 'FM algorithm (1–32)', section: 'Global',
    enum: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [i, `${i + 1}`])) },

  // Feedback (offset 111, bits 0–2) + Oscillator Key Sync (bit 3)
  { offset: GLOBAL_START + 9,  size: 1, type: 'enum', name: 'Feedback', description: 'Feedback level (0–7)', section: 'Global',
    enum: { 0: '0 (Off)', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' },
    mask: 0x07, shift: 0 },

  // LFO (offsets 112–115)
  { offset: GLOBAL_START + 10, size: 1, type: 'value', name: 'LFO Speed', description: 'LFO speed (0–99)', section: 'LFO', min: 0, max: 99 },
  { offset: GLOBAL_START + 11, size: 1, type: 'value', name: 'LFO Delay', description: 'LFO delay time (0–99)', section: 'LFO', min: 0, max: 99 },
  { offset: GLOBAL_START + 12, size: 1, type: 'value', name: 'LFO PM Depth', description: 'LFO pitch modulation depth (0–99)', section: 'LFO', min: 0, max: 99 },
  { offset: GLOBAL_START + 13, size: 1, type: 'value', name: 'LFO AM Depth', description: 'LFO amplitude modulation depth (0–99)', section: 'LFO', min: 0, max: 99 },

  // LFO Waveform (offset 116, bits 1–3)
  { offset: GLOBAL_START + 14, size: 1, type: 'enum', name: 'LFO Waveform', description: 'LFO waveform shape', section: 'LFO',
    enum: { 0: 'Triangle', 1: 'Saw Down', 2: 'Saw Up', 3: 'Square', 4: 'S&H (Random)' },
    mask: 0x07, shift: 1 },

  // Pitch Mod Sensitivity (offset 116, bits 4–6)
  { offset: GLOBAL_START + 14, size: 1, type: 'enum', name: 'Pitch Mod Sens', description: 'Pitch modulation sensitivity (0–7)', section: 'Global',
    enum: { 0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' },
    mask: 0x07, shift: 4 },

  // Transpose (offset 117)
  { offset: GLOBAL_START + 15, size: 1, type: 'enum', name: 'Transpose', description: 'Keyboard transpose (0=C2, 12=C3, 24=C4)', section: 'Global',
    enum: Object.fromEntries(Array.from({ length: 48 }, (_, i) => {
      const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(i / 12) + 2;
      return [i, `${notes[i % 12]}${octave}`];
    })) },
];

// Name is at bytes 118–127 (10 ASCII chars)
const NAME_PARAM = { offset: 118, size: 10, type: 'name', name: 'Patch Name', description: 'Patch name (10 characters, ASCII)', section: 'Name' };

/** Complete DX7 VMEM parameter schema — 128 parameters (102 operator + 16 global + 1 name) */
export const DX7_PARAMETERS = [
  ...allOpParams(),
  ...GLOBAL_PARAMS,
  NAME_PARAM,
];

/**
 * Decode a DX7 VMEM byte into a human-readable value.
 */
export function decodeDx7Parameter(value, param) {
  // Apply bit masking for packed parameters (e.g., Feedback in byte 111)
  if (param.mask !== undefined) {
    value = unpack(value, param.mask, param.shift || 0);
  }
  if (param.type === 'enum' && param.enum) {
    return param.enum[value] ?? `Unknown (${value})`;
  }
  if (param.type === 'detune') {
    return value - 7;
  }
  if (param.type === 'name' || param.type === 'packed') {
    return null;
  }
  return value;
}

/**
 * Extract patch name from DX7 VMEM data (offset 118–127, ASCII).
 */
export function extractDx7Name(rawData) {
  if (!rawData || rawData.length < 128) return '';
  const nameBytes = rawData.slice(118, 128);
  let name = '';
  for (const byte of nameBytes) {
    if (byte === 0) break;
    if (byte >= 0x20 && byte <= 0x7E) name += String.fromCharCode(byte);
  }
  return name.trim();
}

/**
 * Decode all parameters from raw DX7 VMEM data (128 bytes).
 */
export function decodeDx7Parameters(rawData) {
  if (!rawData || rawData.length < 128) return [];

  return DX7_PARAMETERS.filter(p => p.type !== 'name').map(param => {
    const rawValue = rawData[param.offset] ?? 0;
    const decoded = decodeDx7Parameter(rawValue, param);
    const range = param.type === 'enum'
      ? `0–${Math.max(...Object.keys(param.enum).map(Number))}`
      : `${param.min ?? 0}–${param.max ?? 127}`;
    return {
      name: param.name,
      value: decoded,
      rawValue,
      offset: param.offset,
      range,
      description: param.description,
      section: param.section,
    };
  });
}

/**
 * Get parameters as a table for the UI.
 */
export function getDx7TableParameters(rawData) {
  return decodeDx7Parameters(rawData).map(p => ({
    ...p,
    offset: `0x${p.offset.toString(16).toUpperCase().padStart(2, '0')} (${p.offset})`,
  }));
}

export default DX7_PARAMETERS;
