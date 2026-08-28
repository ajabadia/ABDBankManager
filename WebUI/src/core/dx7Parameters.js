/**
 * Yamaha DX7 — Parameter Schema (VCED: Voice Element Data, 128 bytes)
 *
 * Real DX7 VCED layout:
 *   Bytes 0x00–0x6B: 6 operators × 18 bytes each = 108 bytes
 *   Bytes 0x6C–0x7F: Global parameters = 20 bytes
 *   Total: 128 bytes ✓
 *
 * Each operator (18 bytes):
 *   +0..+7:  EG Rate 1–4, Level 1–4
 *   +8:      Output Level (0–99)
 *   +9:      Keyboard Left Scale (0–99)
 *   +10:     Keyboard Scale Curve (0–3)
 *   +11:     Keyboard Rate Scaling (0–3)
 *   +12:     AM Sensitivity (0–3)
 *   +13:     Output on/off (0–1)
 *   +14:     Frequency Mode (0=ratio, 1=fixed)
 *   +15:     Frequency Coarse (0–31)
 *   +16:     Frequency Fine (0–99)
 *   +17:     Detune (0–14, 7=center)
 *
 * Global (20 bytes starting at offset 108):
 *   +108..+115: Pitch EG Rate 1–4, Level 1–4
 *   +116: Algorithm (0–31, displayed as 1–32)
 *   +117: Feedback (0–7)
 *   +118: Oscillator Sync (0–1)
 *   +119: LFO Speed (0–99)
 *   +120: LFO Delay (0–99)
 *   +121: LFO PM Depth (0–99)
 *   +122: LFO AM Depth (0–99)
 *   +123: LFO Waveform (0–4)
 *   +124: LFO Sync (0–1)
 *   +125: Pitch Mod Sensitivity (0–7)
 *   +126: Transpose (0–47)
 *   +127: Reserved
 */

const OP_SPACING = 18;
const GLOBAL_START = 108;

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
    { offset: base + 5,  size: 1, type: 'value', name: `OP${opNumber} EG Level 2`, description: `Operator ${opNumber} envelope level 2`, section: `OP${opNumber}` },
    { offset: base + 6,  size: 1, type: 'value', name: `OP${opNumber} EG Level 3`, description: `Operator ${opNumber} envelope level 3`, section: `OP${opNumber}` },
    { offset: base + 7,  size: 1, type: 'value', name: `OP${opNumber} EG Level 4`, description: `Operator ${opNumber} envelope level 4 (sustain)`, section: `OP${opNumber}` },
    // Output level
    { offset: base + 8,  size: 1, type: 'value', name: `OP${opNumber} Output Level`, description: `Operator ${opNumber} output level (0–99)`, section: `OP${opNumber}`, min: 0, max: 99 },
    // Keyboard scaling
    { offset: base + 9,  size: 1, type: 'value', name: `OP${opNumber} KBD Scale L`, description: `Operator ${opNumber} keyboard level scaling depth (left)`, section: `OP${opNumber}`, min: 0, max: 99 },
    { offset: base + 10, size: 1, type: 'enum',  name: `OP${opNumber} KBD Scale SC`, description: `Operator ${opNumber} keyboard level scaling curve`, section: `OP${opNumber}`,
      enum: { 0: 'Linear (-lin)', 1: 'Exponential (-exp)', 2: 'Linear (+lin)', 3: 'Exponential (+exp)' } },
    { offset: base + 11, size: 1, type: 'enum',  name: `OP${opNumber} KBD Rate Scale`, description: `Operator ${opNumber} keyboard rate scaling`, section: `OP${opNumber}`,
      enum: { 0: 'Off', 1: 'Light', 2: 'Medium', 3: 'Heavy' } },
    // AM sensitivity
    { offset: base + 12, size: 1, type: 'enum',  name: `OP${opNumber} AM Sensitivity`, description: `Operator ${opNumber} amplitude modulation sensitivity`, section: `OP${opNumber}`,
      enum: { 0: 'Off', 1: 'Low', 2: 'Medium', 3: 'High' } },
    // Output on/off
    { offset: base + 13, size: 1, type: 'enum',  name: `OP${opNumber} Output`, description: `Operator ${opNumber} on/off`, section: `OP${opNumber}`,
      enum: { 0: 'Off', 1: 'On' } },
    // Frequency
    { offset: base + 14, size: 1, type: 'enum',  name: `OP${opNumber} Freq Mode`, description: `Operator ${opNumber} frequency mode (ratio or fixed)`, section: `OP${opNumber}`,
      enum: { 0: 'Ratio', 1: 'Fixed' } },
    { offset: base + 15, size: 1, type: 'value', name: `OP${opNumber} Freq Coarse`, description: `Operator ${opNumber} frequency coarse`, section: `OP${opNumber}` },
    { offset: base + 16, size: 1, type: 'value', name: `OP${opNumber} Freq Fine`, description: `Operator ${opNumber} frequency fine (0–99)`, section: `OP${opNumber}`, min: 0, max: 99 },
    { offset: base + 17, size: 1, type: 'detune', name: `OP${opNumber} Detune`, description: `Operator ${opNumber} detune (0=−7, 7=0, 14=+7)`, section: `OP${opNumber}`, min: 0, max: 14 },
  ];
}

function allOpParams() {
  const params = [];
  for (const op of [6, 5, 4, 3, 2, 1]) {
    params.push(...opParams(op));
  }
  return params;
}

/** Global parameters at offsets 108–127 (20 bytes) */
const GLOBAL_PARAMS = [
  // Pitch EG (offsets 108–115)
  { offset: GLOBAL_START,     size: 1, type: 'value', name: 'Pitch EG Rate 1',  description: 'Pitch envelope rate 1 (attack)', section: 'Pitch EG' },
  { offset: GLOBAL_START + 1, size: 1, type: 'value', name: 'Pitch EG Rate 2',  description: 'Pitch envelope rate 2', section: 'Pitch EG' },
  { offset: GLOBAL_START + 2, size: 1, type: 'value', name: 'Pitch EG Rate 3',  description: 'Pitch envelope rate 3', section: 'Pitch EG' },
  { offset: GLOBAL_START + 3, size: 1, type: 'value', name: 'Pitch EG Rate 4',  description: 'Pitch envelope rate 4 (release)', section: 'Pitch EG' },
  { offset: GLOBAL_START + 4, size: 1, type: 'value', name: 'Pitch EG Level 1', description: 'Pitch envelope level 1 (attack)', section: 'Pitch EG' },
  { offset: GLOBAL_START + 5, size: 1, type: 'value', name: 'Pitch EG Level 2', description: 'Pitch envelope level 2', section: 'Pitch EG' },
  { offset: GLOBAL_START + 6, size: 1, type: 'value', name: 'Pitch EG Level 3', description: 'Pitch envelope level 3', section: 'Pitch EG' },
  { offset: GLOBAL_START + 7, size: 1, type: 'value', name: 'Pitch EG Level 4', description: 'Pitch envelope level 4 (sustain)', section: 'Pitch EG' },
  // Algorithm
  { offset: GLOBAL_START + 8,  size: 1, type: 'enum', name: 'Algorithm', description: 'FM algorithm (1–32)', section: 'Global',
    enum: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [i, `${i + 1}`])) },
  // Feedback
  { offset: GLOBAL_START + 9,  size: 1, type: 'enum', name: 'Feedback', description: 'Feedback level (0–7)', section: 'Global',
    enum: { 0: '0 (Off)', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' } },
  // Oscillator sync
  { offset: GLOBAL_START + 10, size: 1, type: 'enum', name: 'Oscillator Sync', description: 'Operator oscillator sync', section: 'Global',
    enum: { 0: 'Off', 1: 'On' } },
  // LFO
  { offset: GLOBAL_START + 11, size: 1, type: 'value', name: 'LFO Speed', description: 'LFO speed (0–99)', section: 'LFO', min: 0, max: 99 },
  { offset: GLOBAL_START + 12, size: 1, type: 'value', name: 'LFO Delay', description: 'LFO delay time (0–99)', section: 'LFO', min: 0, max: 99 },
  { offset: GLOBAL_START + 13, size: 1, type: 'value', name: 'LFO PM Depth', description: 'LFO pitch modulation depth (0–99)', section: 'LFO', min: 0, max: 99 },
  { offset: GLOBAL_START + 14, size: 1, type: 'value', name: 'LFO AM Depth', description: 'LFO amplitude modulation depth (0–99)', section: 'LFO', min: 0, max: 99 },
  { offset: GLOBAL_START + 15, size: 1, type: 'enum', name: 'LFO Waveform', description: 'LFO waveform shape', section: 'LFO',
    enum: { 0: 'Triangle', 1: 'Saw Down', 2: 'Saw Up', 3: 'Square', 4: 'S&H (Random)' } },
  { offset: GLOBAL_START + 16, size: 1, type: 'enum', name: 'LFO Sync', description: 'LFO key sync (restart on key press)', section: 'LFO',
    enum: { 0: 'Off', 1: 'On' } },
  // Pitch mod sensitivity
  { offset: GLOBAL_START + 17, size: 1, type: 'enum', name: 'Pitch Mod Sens', description: 'Pitch modulation sensitivity (0–7)', section: 'Global',
    enum: { 0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7' } },
  // Transpose
  { offset: GLOBAL_START + 18, size: 1, type: 'enum', name: 'Transpose', description: 'Keyboard transpose (0=C2, 12=C3, 24=C4)', section: 'Global',
    enum: Object.fromEntries(Array.from({ length: 48 }, (_, i) => {
      const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(i / 12) + 2;
      return [i, `${notes[i % 12]}${octave}`];
    })) },
];

// Name is at bytes 0x09–0x12 (10 ASCII chars, null-padded)
const NAME_PARAM = { offset: 9, size: 10, type: 'name', name: 'Patch Name', description: 'Patch name (10 characters, ASCII)', section: 'Name' };

/** Complete DX7 parameter schema — 128 parameters (108 operator + 19 global + 1 name) */
export const DX7_PARAMETERS = [
  ...allOpParams(),
  ...GLOBAL_PARAMS,
  NAME_PARAM,
];

/**
 * Decode a DX7 VCED byte into a human-readable value.
 */
export function decodeDx7Parameter(value, param) {
  if (param.type === 'enum' && param.enum) {
    return param.enum[value] ?? `Unknown (${value})`;
  }
  if (param.type === 'detune') {
    return value - 7;
  }
  if (param.type === 'name') {
    return null;
  }
  return value;
}

/**
 * Extract patch name from DX7 VCED data.
 */
export function extractDx7Name(rawData) {
  if (!rawData || rawData.length < 19) return '';
  const slice = rawData.slice(9, 19);
  const decoder = new TextDecoder('ascii');
  let name = '';
  for (const byte of slice) {
    if (byte === 0) break;
    name += decoder.decode(new Uint8Array([byte]));
  }
  return name.trim();
}

/**
 * Decode all parameters from raw DX7 VCED data.
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
