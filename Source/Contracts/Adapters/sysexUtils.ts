/**
 * SysEx utilities shared across adapters
 * 7-to-8 packing, nibble encoding, checksum algorithms
 */

// ─── 7-to-8 Bit Packing (Korg, Behringer) ───

/**
 * Unpack 7-bit encoded data to 8-bit.
 * Every 7 input bytes produce 8 output bytes.
 * Input bytes have 7 significant bits; the MSB of each input byte
 * carries 1 bit of each of the next7 output bytes.
 */
export function unpack7to8(packed: Uint8Array): Uint8Array {
  const unpacked: number[] = [];
  for (let i = 0; i < packed.length; i += 8) {
    if (i + 8 > packed.length) break;
    const group = packed.slice(i, i + 8);
    const control = group[0];
    for (let j = 0; j < 7; j++) {
      const highBit = (control >> (6 - j)) & 1;
      unpacked.push(((highBit << 7) | (group[j + 1] & 0x7F)) & 0xFF);
    }
  }
  return new Uint8Array(unpacked);
}

/**
 * Pack 8-bit data to 7-bit encoding.
 * Every 7 input bytes produce 8 output bytes.
 * The first byte of each group is the control byte whose bits
 * indicate the MSB of each subsequent byte.
 * The last group is zero-padded to a full 7 bytes, so the output
 * length is always a multiple of 8 (required by unpack7to8 and
 * by devices, which always transmit complete groups).
 */
export function pack8to7(data: Uint8Array): Uint8Array {
  const packed: number[] = [];
  for (let i = 0; i < data.length; i += 7) {
    const group = data.slice(i, Math.min(i + 7, data.length));
    let control = 0;
    for (let j = 0; j < 7; j++) {
      const byte = j < group.length ? group[j] : 0;
      control |= ((byte >> 7) & 1) << (6 - j);
    }
    packed.push(control);
    for (let j = 0; j < 7; j++) {
      packed.push((j < group.length ? group[j] : 0) & 0x7F);
    }
  }
  return new Uint8Array(packed);
}

// ─── Nibble Encoding (Casio CZ) ───

/**
 * Decode Casio CZ nibble format.
 * Each pair of input bytes encodes one output byte:
 *   high nibble = (byte0 & 0x0F) << 4
 *   low nibble  = byte1 & 0x0F
 */
export function decodeNibble(nibbles: Uint8Array): Uint8Array {
  const decoded: number[] = [];
  for (let i = 0; i + 1 < nibbles.length; i += 2) {
    const high = (nibbles[i] & 0x0F) << 4;
    const low = nibbles[i + 1] & 0x0F;
    decoded.push((high | low) & 0xFF);
  }
  return new Uint8Array(decoded);
}

/**
 * Encode data to Casio CZ nibble format.
 * Each input byte produces two output bytes (high nibble, low nibble).
 */
export function encodeNibble(data: Uint8Array): Uint8Array {
  const nibbles: number[] = [];
  for (const byte of data) {
    nibbles.push((byte >> 4) & 0x0F);
    nibbles.push(byte & 0x0F);
  }
  return new Uint8Array(nibbles);
}

// ─── Checksums ───

/** Roland: XOR all bytes, invert, AND 0x7F */
export function rolandChecksum(bytes: Uint8Array): number {
  let xor = 0;
  for (const b of bytes) xor ^= b;
  return (~xor) & 0x7F;
}

/** Yamaha: sum all bytes, AND 0x7F, two's complement (negate mod128) */
export function yamahaChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const b of bytes) sum += b;
  return (128 - (sum % 128)) & 0x7F;
}

/** Casio: sum all bytes, AND 0x7F */
export function casioChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const b of bytes) sum += b;
  return sum & 0x7F;
}

// ─── SysEx Header Helpers ───

/** Extract data between F0...F7, stripping checksum byte before F7 */
export function extractSysexData(sysex: Uint8Array, headerLen: number): Uint8Array {
  if (sysex.length < headerLen + 2) return new Uint8Array(0);
  // Last byte before F7 is checksum — exclude it
  return sysex.slice(headerLen, sysex.length - 2);
}

/** Find all F0...F7 messages in raw bytes */
export function splitSysexMessages(raw: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = [];
  let inSysex = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0xF0 && !inSysex) {
      inSysex = true;
      start = i;
    } else if (raw[i] === 0xF7 && inSysex) {
      messages.push(raw.slice(start, i + 1));
      inSysex = false;
    }
  }
  return messages;
}
