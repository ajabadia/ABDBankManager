export const PRO800_PARAMETER_SCHEMA = [
  ...[
    ['osc-a-frequency', 'Osc A Frequency', 5], ['osc-a-level', 'Osc A Level', 7], ['osc-a-pulse-width', 'Osc A Pulse Width', 9],
    ['osc-b-frequency', 'Osc B Frequency', 11], ['osc-b-level', 'Osc B Level', 13], ['osc-b-pulse-width', 'Osc B Pulse Width', 15],
    ['filter-cutoff', 'Filter Cutoff', 19], ['filter-resonance', 'Filter Resonance', 21], ['filter-envelope-amount', 'Filter Envelope Amount', 23],
    ['filter-release', 'Filter Release', 25], ['filter-sustain', 'Filter Sustain', 27], ['filter-decay', 'Filter Decay', 29],
    ['filter-attack', 'Filter Attack', 31], ['amp-release', 'Amp Release', 33], ['amp-sustain', 'Amp Sustain', 35],
    ['amp-decay', 'Amp Decay', 37], ['amp-attack', 'Amp Attack', 39], ['lfo-frequency', 'LFO Frequency', 45],
    ['lfo-amount', 'LFO Amount', 47], ['glide-amount', 'Glide Amount', 49], ['amp-velocity', 'Amp Velocity', 51],
    ['filter-velocity', 'Filter Velocity', 53], ['modulation-delay', 'Modulation Delay', 76], ['vibrato-speed', 'Vibrato Speed', 78],
    ['vibrato-amount', 'Vibrato Amount', 80], ['unison-detune', 'Unison Detune', 82], ['noise-amount', 'Noise Amount', 142],
    ['amp-aftertouch', 'Amp Aftertouch Amount', 144], ['filter-aftertouch', 'Filter Aftertouch Amount', 146]
  ].map(([id, name, offset]) => ({ id, name, description: `${name} (16-bit little-endian)`, offset, length: 2, kind: 'u16le' })),
  { id: 'osc-a-saw', name: 'Osc A Saw', description: 'Oscillator A saw waveform', offset: 55, length: 1, kind: 'u8' },
  { id: 'osc-a-tri', name: 'Osc A Tri', description: 'Oscillator A triangle waveform', offset: 56, length: 1, kind: 'u8' },
  { id: 'osc-a-rect', name: 'Osc A Rect', description: 'Oscillator A rectangle waveform', offset: 57, length: 1, kind: 'u8' },
  { id: 'osc-b-saw', name: 'Osc B Saw', description: 'Oscillator B saw waveform', offset: 58, length: 1, kind: 'u8' },
  { id: 'osc-b-tri', name: 'Osc B Tri', description: 'Oscillator B triangle waveform', offset: 59, length: 1, kind: 'u8' },
  { id: 'osc-b-rect', name: 'Osc B Rect', description: 'Oscillator B rectangle waveform', offset: 60, length: 1, kind: 'u8' },
  { id: 'osc-a-sync', name: 'Osc A Sync', description: 'Oscillator sync', offset: 61, length: 1, kind: 'u8' },
  { id: 'lfo-shape', name: 'LFO Shape', description: 'LFO waveform', offset: 64, length: 1, kind: 'u8', options: { 0: 'Pulse', 1: 'Tri', 2: 'Rand', 3: 'Sin', 4: 'Noise', 5: 'Saw' } },
  { id: 'lfo-speed', name: 'LFO Speed', description: 'LFO speed', offset: 65, length: 1, kind: 'u8', options: { 0: 'Slow', 1: 'Fast' } },
  { id: 'lfo-destination', name: 'LFO Destination', description: 'LFO destination bitmask', offset: 66, length: 1, kind: 'bitmask' },
  { id: 'filter-keyboard-tracking', name: 'Filter Keyboard Tracking', description: 'Filter keyboard tracking', offset: 67, length: 1, kind: 'u8', options: { 0: 'Off', 1: 'Half', 2: 'Full' } },
  { id: 'filter-envelope-shape', name: 'Filter Envelope Shape', description: 'Filter envelope shape', offset: 68, length: 1, kind: 'u8', options: { 0: 'Linear', 1: 'Exponential' } },
  { id: 'amp-envelope-shape', name: 'Amp Envelope Shape', description: 'Amp envelope shape', offset: 70, length: 1, kind: 'u8', options: { 0: 'Linear', 1: 'Exponential' } },
  { id: 'unison', name: 'Unison', description: 'Unison enabled', offset: 71, length: 1, kind: 'u8', options: { 0: 'Off', 1: 'On' } },
  { id: 'pitchbend-target', name: 'Pitchbend Target', description: 'Pitchbend destination', offset: 72, length: 1, kind: 'u8', options: { 0: 'Off', 1: 'VCO', 2: 'VCF', 3: 'Volume' } },
  { id: 'amp-envelope-speed', name: 'Amp Envelope Speed', description: 'Amp envelope speed', offset: 148, length: 1, kind: 'u8' },
  { id: 'arp-mode', name: 'Arpeggiator Mode', description: 'Arpeggiator mode', offset: 149, length: 1, kind: 'u8' },
  { id: 'voice-spread', name: 'Voice Spread Enable', description: 'Voice spread enabled', offset: 168, length: 1, kind: 'u8', sinceFormatVersion: 111 },
  { id: 'key-tracking-reference', name: 'Key Tracking Reference Note', description: 'Key tracking reference note', offset: 169, length: 1, kind: 'u8', sinceFormatVersion: 111 },
  { id: 'glide-mode', name: 'Glide Mode', description: 'Glide mode', offset: 170, length: 1, kind: 'u8', sinceFormatVersion: 111 },
  ...Array.from({ length: 8 }, (_, index) => ({ id: `chord-note-${index + 1}`, name: `Chord Note ${index + 1}`, description: 'Chord interval in semitones; 255 means no note', offset: 86 + index, length: 1, kind: 'u8' })),
  ...Array.from({ length: 12 }, (_, index) => ({ id: `tuning-${index}`, name: `Tune Per Note ${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][index]}`, description: 'Per-note tuning float32 little-endian', offset: 94 + index * 4, length: 4, kind: 'float32le' })),
  { id: 'lfo-aftertouch', name: 'LFO Aftertouch Amount', description: 'LFO aftertouch amount (format v110+)', offset: 166, length: 2, kind: 'u16le', sinceFormatVersion: 110 },
  { id: 'pitchbend-range', name: 'Pitchbend Range', description: 'Pitchbend range (format v111+)', offset: 171, length: 2, kind: 'u16le', sinceFormatVersion: 111 },
  { id: 'patch-name', name: 'Patch Name', description: 'Patch display name', offset: 150, length: 16, kind: 'name' }
];

export function getPro800ParametersForFormat(formatVersion = 111) {
  return PRO800_PARAMETER_SCHEMA.filter(parameter => !parameter.sinceFormatVersion || formatVersion >= parameter.sinceFormatVersion);
}

export function decodePro800Parameter(parameter, rawData) {
  if (parameter.offset + parameter.length > rawData.length) return null;
  if (parameter.kind === 'name') return new TextDecoder().decode(rawData.slice(parameter.offset, parameter.offset + parameter.length)).replace(/[\0\x80\x7F].*$/s, '').trim();
  if (parameter.kind === 'u16le') return rawData[parameter.offset] | (rawData[parameter.offset + 1] << 8);
  if (parameter.kind === 'float32le') return new DataView(rawData.buffer, rawData.byteOffset + parameter.offset, 4).getFloat32(0, true);
  if (parameter.kind === 'bitmask') return Array.from({ length: 7 }, (_, bit) => bit).filter(bit => rawData[parameter.offset] & (1 << bit));
  return rawData[parameter.offset];
}

export function decodePro800Parameters(rawData) {
  const formatVersion = rawData[4] || 111;
  return getPro800ParametersForFormat(formatVersion).map(parameter => ({ ...parameter, value: decodePro800Parameter(parameter, rawData) }));
}
