// GENERATED FILE — DO NOT EDIT
// Generator: Scripts/build_contracts_web.js
// Fuente canónica: Source/Contracts/Models/*.ts
// Source/Contracts/ModelContract.ts
function validateModelContract(contract) {
  const errors = [];
  if (!contract.modelId) errors.push("modelId is required");
  if (!contract.displayName) errors.push("displayName is required");
  if (!contract.manufacturer) errors.push("manufacturer is required");
  if (!Number.isInteger(contract.bankCapacity) || contract.bankCapacity <= 0) {
    errors.push("bankCapacity must be positive integer");
  }
  if (!Number.isInteger(contract.banksCount) || contract.banksCount <= 0) {
    errors.push("banksCount must be positive integer");
  }
  if (!Number.isInteger(contract.programsPerBank) || contract.programsPerBank <= 0) {
    errors.push("programsPerBank must be positive integer");
  }
  if (contract.banksCount * contract.programsPerBank !== contract.bankCapacity) {
    errors.push("banksCount * programsPerBank must equal bankCapacity");
  }
  if (typeof contract.getProgramAddress !== "function") {
    errors.push("getProgramAddress function required");
  }
  if (typeof contract.parseProgramAddress !== "function") {
    errors.push("parseProgramAddress function required");
  }
  if (!Number.isInteger(contract.patchDataSize) || contract.patchDataSize <= 0) {
    errors.push("patchDataSize must be positive integer");
  }
  if (!Number.isInteger(contract.patchNameMaxLength) || contract.patchNameMaxLength < 0) {
    errors.push("patchNameMaxLength must be non-negative integer");
  }
  if (!Array.isArray(contract.categories) || contract.categories.length === 0) {
    errors.push("categories must be non-empty array");
  }
  if (!contract.defaultCategory || !contract.categories.includes(contract.defaultCategory)) {
    errors.push("defaultCategory must be one of categories");
  }
  if (!Array.isArray(contract.sysexManufacturerId) || contract.sysexManufacturerId.length === 0) {
    errors.push("sysexManufacturerId must be non-empty array");
  }
  if (!Number.isInteger(contract.formatVersion) || contract.formatVersion < 1) {
    errors.push("formatVersion must be positive integer");
  }
  for (let i = 0; i < Math.min(10, contract.bankCapacity); i++) {
    const addr = contract.getProgramAddress(i);
    const parsed = contract.parseProgramAddress(addr);
    if (parsed !== i) {
      errors.push(`Address round-trip failed for index ${i}: ${addr} -> ${parsed}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Source/Contracts/Models/casio-cz.ts
var BANK_CAPACITY = 16;
var BANKS_COUNT = 1;
var PROGRAMS_PER_BANK = 16;
var PATCH_DATA_SIZE = 128;
var PATCH_NAME_MAX_LENGTH = 0;
var CATEGORIES = ["Bass", "Lead", "Pad", "FX", "Keys", "Perc", "Synth", "Other"];
var DEFAULT_CATEGORY = "Other";
var SYSEX_MANUFACTURER_ID = [68];
var FORMAT_VERSION = 1;
var CMD_DUMP = 16;
var CMD_REQUEST = 48;
var MODEL_IDS = {
  "casio-cz101": 18,
  "casio-cz1000": 19,
  "casio-cz5000": 20,
  "casio-cz1": 21
};
function casioChecksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum += b;
  return sum & 127;
}
function encodeNibble(data) {
  const nibbles = [];
  for (const byte of data) {
    nibbles.push(byte >> 4 & 15);
    nibbles.push(byte & 15);
  }
  return new Uint8Array(nibbles);
}
function decodeNibble(nibbles) {
  const decoded = [];
  for (let i = 0; i + 1 < nibbles.length; i += 2) {
    decoded.push((nibbles[i] & 15) << 4 | nibbles[i + 1] & 15);
  }
  return new Uint8Array(decoded);
}
function splitSysex(raw) {
  const msgs = [];
  let inSysex = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 240 && !inSysex) {
      inSysex = true;
      start = i;
    } else if (raw[i] === 247 && inSysex) {
      msgs.push(raw.slice(start, i + 1));
      inSysex = false;
    }
  }
  return msgs;
}
function isCasioSysEx(msg, modelId) {
  return msg.length >= 9 && msg[0] === 240 && msg[1] === 68 && msg[2] === 0 && msg[3] === 0 && msg[4] === modelId && msg[5] === CMD_DUMP && msg[msg.length - 1] === 247;
}
function getBankLetter(index) {
  return String.fromCharCode(65 + Math.floor(index / 16));
}
function getProgramNumber(index) {
  return index % 16 + 1;
}
var casioCzContract = {
  modelId: "casio-cz101",
  displayName: "Casio CZ-101",
  manufacturer: "Casio",
  icon: "casio-logo.svg",
  thumbnail: "casio-cz101.jpg",
  bankCapacity: BANK_CAPACITY,
  banksCount: BANKS_COUNT,
  programsPerBank: PROGRAMS_PER_BANK,
  getProgramAddress(globalIndex) {
    return `${getBankLetter(globalIndex)}${getProgramNumber(globalIndex)}`;
  },
  parseProgramAddress(address) {
    const match = address.match(/^([A-P])(\d+)$/i);
    if (!match) return null;
    const bankIdx = match[1].toUpperCase().charCodeAt(0) - 65;
    const progNum = parseInt(match[2], 10);
    if (bankIdx < 0 || bankIdx >= BANKS_COUNT) return null;
    if (progNum < 1 || progNum > PROGRAMS_PER_BANK) return null;
    return bankIdx * PROGRAMS_PER_BANK + (progNum - 1);
  },
  patchDataSize: PATCH_DATA_SIZE,
  patchNameMaxLength: PATCH_NAME_MAX_LENGTH,
  extractPatchName: () => "",
  categories: CATEGORIES,
  defaultCategory: DEFAULT_CATEGORY,
  compatibleModels: ["casio-cz1000", "casio-cz5000", "casio-cz1"],
  sysexManufacturerId: SYSEX_MANUFACTURER_ID,
  formatVersion: FORMAT_VERSION,
  sysexModelId: { offset: 4, values: [18] },
  midiDetection: { portPattern: /casio|cz.?101/i, displayName: "Casio CZ-101" },
  midi: { defaultChannel: 1, defaultDeviceId: 16 },
  supportsEditBuffer: false,
  interMessageDelayMs: 30,
  dumpTimeoutMs: 3e3,
  computeChecksum(data) {
    return casioChecksum(data);
  },
  verifyChecksum(sysex) {
    if (sysex.length < 9) return false;
    if (sysex[0] !== 240 || sysex[1] !== 68) return false;
    if (sysex[sysex.length - 1] !== 247) return false;
    const nibbles = sysex.slice(7, sysex.length - 2);
    return sysex[sysex.length - 2] === casioChecksum(nibbles);
  },
  buildPatchSysEx(rawData, _slot, channel) {
    const modelId = MODEL_IDS[this.modelId] || 18;
    const data = rawData.slice(0, PATCH_DATA_SIZE);
    const padded = new Uint8Array(PATCH_DATA_SIZE);
    padded.set(data);
    const nibbles = encodeNibble(padded);
    const checksum = casioChecksum(nibbles);
    const result = new Uint8Array(7 + nibbles.length + 2);
    result[0] = 240;
    result[1] = 68;
    result[2] = 0;
    result[3] = 0;
    result[4] = modelId;
    result[5] = CMD_DUMP;
    result[6] = channel & 15;
    result.set(nibbles, 7);
    result[7 + nibbles.length] = checksum;
    result[7 + nibbles.length + 1] = 247;
    return result;
  },
  parsePatchSysEx(sysex) {
    const modelId = MODEL_IDS[this.modelId] || 18;
    if (!isCasioSysEx(sysex, modelId)) return null;
    const nibbles = sysex.slice(7, sysex.length - 2);
    const decoded = decodeNibble(nibbles);
    return { rawData: new Uint8Array(decoded.slice(0, PATCH_DATA_SIZE)), slot: 0 };
  },
  buildDumpRequest(_slot, channel) {
    const modelId = MODEL_IDS[this.modelId] || 18;
    return new Uint8Array([240, 68, 0, 0, modelId, CMD_REQUEST, channel & 15, 247]);
  },
  parseDumpResponse(sysex) {
    const modelId = MODEL_IDS[this.modelId] || 18;
    const msgs = splitSysex(sysex);
    const results = [];
    for (const msg of msgs) {
      if (isCasioSysEx(msg, modelId)) {
        const nibbles = msg.slice(7, msg.length - 2);
        const decoded = decodeNibble(nibbles);
        results.push({ rawData: new Uint8Array(decoded.slice(0, PATCH_DATA_SIZE)), slot: results.length });
      }
    }
    return results;
  },
  legacySysEx: {
    modelIdByte: 18,
    buildDumpRequest: (ch) => new Uint8Array([240, 68, 0, 0, 18, 16, ch & 15, 247]),
    validateSysEx: (bytes) => bytes.length >= 8 && bytes[0] === 240 && bytes[1] === 68 && bytes[2] === 0 && bytes[3] === 0
  }
};
var casioCz1000Contract = {
  ...casioCzContract,
  modelId: "casio-cz1000",
  displayName: "Casio CZ-1000",
  thumbnail: "casio-cz1000.webp",
  legacySysEx: { ...casioCzContract.legacySysEx, modelIdByte: 19 }
};
var casioCz5000Contract = {
  ...casioCzContract,
  modelId: "casio-cz5000",
  displayName: "Casio CZ-5000",
  thumbnail: "casio-cz5000.webp",
  bankCapacity: 32,
  banksCount: 2,
  legacySysEx: { ...casioCzContract.legacySysEx, modelIdByte: 20 }
};
var casioCz1Contract = {
  ...casioCzContract,
  modelId: "casio-cz1",
  displayName: "Casio CZ-1",
  thumbnail: "casio-cz1.webp",
  bankCapacity: 64,
  banksCount: 4,
  legacySysEx: { ...casioCzContract.legacySysEx, modelIdByte: 21 }
};
var allCasioContracts = [
  casioCzContract,
  casioCz1000Contract,
  casioCz5000Contract,
  casioCz1Contract
];
allCasioContracts.forEach((c) => {
  const result = validateModelContract(c);
  if (!result.valid) {
    console.error(`\u274C ${c.modelId} validation failed:`, result.errors);
  }
});

// Source/Contracts/Models/roland-juno.ts
var BANK_CAPACITY2 = 128;
var BANKS_COUNT2 = 2;
var PROGRAMS_PER_BANK2 = 64;
var PATCH_DATA_SIZE2 = 18;
var PATCH_NAME_MAX_LENGTH2 = 0;
var CATEGORIES2 = ["Bass", "Lead", "Pad", "FX", "Keys", "Perc", "Synth", "Other"];
var DEFAULT_CATEGORY2 = "Other";
var SYSEX_MANUFACTURER_ID2 = [65];
var FORMAT_VERSION2 = 1;
var DEVICE_ID = 24;
var CMD_PATCH_DUMP = 48;
var CMD_BULK_FUNC = 1;
function bulkChecksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum += b;
  return -sum & 127;
}
function splitSysex2(raw) {
  const msgs = [];
  let inSysex = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 240 && !inSysex) {
      inSysex = true;
      start = i;
    } else if (raw[i] === 247 && inSysex) {
      msgs.push(raw.slice(start, i + 1));
      inSysex = false;
    }
  }
  return msgs;
}
function isJunoSinglePatch(msg) {
  return msg.length === 23 && msg[0] === 240 && msg[1] === 65 && msg[2] === CMD_PATCH_DUMP && msg[22] === 247;
}
function isJunoBulkDump(msg) {
  if (msg.length < 24 || msg[0] !== 240 || msg[1] !== 65) return false;
  if (msg[2] !== CMD_PATCH_DUMP || msg[3] !== 2 || msg[4] !== CMD_BULK_FUNC) return false;
  if (msg[msg.length - 1] !== 247) return false;
  const payload = msg.slice(5, msg.length - 2);
  return msg[msg.length - 2] === bulkChecksum(payload);
}
function getBankLetter2(index) {
  return index < 64 ? "A" : "B";
}
function getProgramNumber2(index) {
  return index % 64 + 1;
}
var rolandJuno106Contract = {
  modelId: "roland-juno106",
  displayName: "Roland Juno-106",
  manufacturer: "Roland",
  icon: "roland-logo.svg",
  thumbnail: "roland-juno106.jpg",
  bankCapacity: BANK_CAPACITY2,
  banksCount: BANKS_COUNT2,
  programsPerBank: PROGRAMS_PER_BANK2,
  getProgramAddress(globalIndex) {
    return `${getBankLetter2(globalIndex)}${getProgramNumber2(globalIndex)}`;
  },
  parseProgramAddress(address) {
    const match = address.match(/^([AB])(\d+)$/i);
    if (!match) return null;
    const bank = match[1].toUpperCase();
    const prog = parseInt(match[2], 10);
    if (prog < 1 || prog > 64) return null;
    return (bank === "A" ? 0 : 1) * 64 + (prog - 1);
  },
  patchDataSize: PATCH_DATA_SIZE2,
  patchNameMaxLength: PATCH_NAME_MAX_LENGTH2,
  extractPatchName: () => "",
  categories: CATEGORIES2,
  defaultCategory: DEFAULT_CATEGORY2,
  compatibleModels: ["roland-juno60", "roland-juno6", "roland-hs60"],
  sysexManufacturerId: SYSEX_MANUFACTURER_ID2,
  formatVersion: FORMAT_VERSION2,
  midiDetection: { portPattern: /juno.?106|juno/i, displayName: "Roland Juno-106" },
  midi: { defaultChannel: 1, defaultDeviceId: DEVICE_ID },
  supportsEditBuffer: false,
  interMessageDelayMs: 50,
  dumpTimeoutMs: 3e3,
  computeChecksum(data) {
    return bulkChecksum(data);
  },
  verifyChecksum(sysex) {
    if (sysex.length < 6) return false;
    if (sysex[0] !== 240 || sysex[1] !== 65) return false;
    if (sysex[sysex.length - 1] !== 247) return false;
    if (sysex.length === 23 && sysex[2] === CMD_PATCH_DUMP) return true;
    if (sysex.length < 24) return false;
    const payload = sysex.slice(5, sysex.length - 2);
    return sysex[sysex.length - 2] === bulkChecksum(payload);
  },
  buildPatchSysEx(rawData, _slot, channel) {
    const data = rawData.slice(0, PATCH_DATA_SIZE2);
    const padded = new Uint8Array(PATCH_DATA_SIZE2);
    padded.set(data);
    return new Uint8Array([240, 65, CMD_PATCH_DUMP, channel & 15, ...padded, 247]);
  },
  parsePatchSysEx(sysex) {
    if (!isJunoSinglePatch(sysex)) return null;
    return { rawData: new Uint8Array(sysex.slice(4, 4 + PATCH_DATA_SIZE2)), slot: 0 };
  },
  buildDumpRequest(_slot, channel) {
    return new Uint8Array([240, 65, channel & 15, 62, 17, 0, 247]);
  },
  parseDumpResponse(sysex) {
    const msgs = splitSysex2(sysex);
    const results = [];
    for (const msg of msgs) {
      if (isJunoSinglePatch(msg)) {
        results.push({ rawData: new Uint8Array(msg.slice(4, 4 + PATCH_DATA_SIZE2)), slot: results.length });
      } else if (isJunoBulkDump(msg)) {
        const patchData = msg.slice(5, msg.length - 2);
        const count = Math.floor(patchData.length / PATCH_DATA_SIZE2);
        for (let i = 0; i < count; i++) {
          const s = i * PATCH_DATA_SIZE2;
          results.push({ rawData: new Uint8Array(patchData.slice(s, s + PATCH_DATA_SIZE2)), slot: i });
        }
      }
    }
    return results;
  },
  legacySysEx: {
    modelIdByte: 62,
    buildDumpRequest: (ch) => new Uint8Array([240, 65, ch & 15, 62, 17, 0, 247]),
    validateSysEx: (bytes) => bytes.length >= 6 && bytes[0] === 240 && bytes[1] === 65 && bytes[2] === 48
  }
};
var rolandJuno60Contract = {
  ...rolandJuno106Contract,
  modelId: "roland-juno60",
  displayName: "Roland Juno-60",
  thumbnail: "roland-juno60.webp",
  legacySysEx: {
    ...rolandJuno106Contract.legacySysEx,
    modelIdByte: 61
  }
};
var rolandJuno6Contract = {
  ...rolandJuno106Contract,
  modelId: "roland-juno6",
  displayName: "Roland Juno-6",
  thumbnail: "roland-juno6.webp",
  legacySysEx: {
    ...rolandJuno106Contract.legacySysEx,
    modelIdByte: 60
  }
};
var rolandHs60Contract = {
  ...rolandJuno106Contract,
  modelId: "roland-hs60",
  displayName: "Roland HS-60",
  thumbnail: "roland-hs60.webp",
  legacySysEx: {
    ...rolandJuno106Contract.legacySysEx,
    modelIdByte: 62
  }
};
var allRolandJunoContracts = [
  rolandJuno106Contract,
  rolandJuno60Contract,
  rolandJuno6Contract,
  rolandHs60Contract
];
allRolandJunoContracts.forEach((c) => {
  const result = validateModelContract(c);
  if (!result.valid) {
    console.error(`\u274C ${c.modelId} validation failed:`, result.errors);
  }
});

// Source/Contracts/Models/korg-ms2000.ts
var BANK_CAPACITY3 = 128;
var BANKS_COUNT3 = 8;
var PROGRAMS_PER_BANK3 = 16;
var PATCH_DATA_SIZE3 = 128;
var PATCH_NAME_MAX_LENGTH3 = 12;
var CATEGORIES3 = ["Bass", "Lead", "Pad", "FX", "Keys", "Perc", "Synth", "Other"];
var DEFAULT_CATEGORY3 = "Other";
var SYSEX_MANUFACTURER_ID3 = [66];
var FORMAT_VERSION3 = 1;
var BANK_LETTERS = "ABCDEFGH";
var CMD_DUMP2 = 64;
var CMD_ALL_DUMP = 76;
var CMD_REQUEST2 = 16;
var CMD_ALL_REQUEST = 14;
var MODEL_IDS2 = {
  "korg-ms2000": 88,
  "korg-microkorg": 88,
  // identical SysEx format to MS2000
  "korg-prophecy": 90
};
function getBankLetter3(index) {
  return BANK_LETTERS[Math.floor(index / 16)];
}
function getProgramNumber3(index) {
  return index % 16 + 1;
}
function pack8to7(data) {
  const packed = [];
  for (let i = 0; i < data.length; i += 7) {
    const group = data.slice(i, Math.min(i + 7, data.length));
    let control = 0;
    for (let j = 0; j < 7; j++) {
      const byte = j < group.length ? group[j] : 0;
      control |= (byte >> 7 & 1) << 6 - j;
    }
    packed.push(control);
    for (let j = 0; j < 7; j++) packed.push((j < group.length ? group[j] : 0) & 127);
  }
  return new Uint8Array(packed);
}
function unpack7to8(packed) {
  const unpacked = [];
  for (let i = 0; i < packed.length; i += 8) {
    if (i + 8 > packed.length) break;
    const control = packed[i];
    for (let j = 0; j < 7; j++) {
      const highBit = control >> 6 - j & 1;
      unpacked.push((highBit << 7 | packed[i + 1 + j] & 127) & 255);
    }
  }
  return new Uint8Array(unpacked);
}
function isKorgSysEx(msg, modelIdByte) {
  return msg.length >= 5 && msg[0] === 240 && msg[1] === 66 && msg[3] === modelIdByte && (msg[4] === CMD_DUMP2 || msg[4] === CMD_ALL_DUMP);
}
function splitSysex3(raw) {
  const msgs = [];
  let inSysex = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 240 && !inSysex) {
      inSysex = true;
      start = i;
    } else if (raw[i] === 247 && inSysex) {
      msgs.push(raw.slice(start, i + 1));
      inSysex = false;
    }
  }
  return msgs;
}
var korgMs2000Contract = {
  modelId: "korg-ms2000",
  displayName: "Korg MS2000",
  manufacturer: "Korg",
  icon: "korg-logo.svg",
  thumbnail: "korg-ms2000.jpg",
  bankCapacity: BANK_CAPACITY3,
  banksCount: BANKS_COUNT3,
  programsPerBank: PROGRAMS_PER_BANK3,
  getProgramAddress(globalIndex) {
    return `${getBankLetter3(globalIndex)}.${String(getProgramNumber3(globalIndex)).padStart(2, "0")}`;
  },
  parseProgramAddress(address) {
    const match = address.match(/^([A-H])\.(\d{2})$/i);
    if (!match) return null;
    const bank = match[1].toUpperCase();
    const prog = parseInt(match[2], 10);
    const bankIdx = BANK_LETTERS.indexOf(bank);
    if (bankIdx === -1 || prog < 1 || prog > 16) return null;
    return bankIdx * 16 + (prog - 1);
  },
  patchDataSize: PATCH_DATA_SIZE3,
  patchNameMaxLength: PATCH_NAME_MAX_LENGTH3,
  extractPatchName(data) {
    const nameOffset = 28;
    if (data.length < nameOffset + PATCH_NAME_MAX_LENGTH3) return "";
    const nameBytes = data.slice(nameOffset, nameOffset + PATCH_NAME_MAX_LENGTH3);
    return new TextDecoder().decode(nameBytes).replace(/\0/g, "").trim();
  },
  categories: CATEGORIES3,
  defaultCategory: DEFAULT_CATEGORY3,
  compatibleModels: ["korg-microkorg"],
  sysexManufacturerId: SYSEX_MANUFACTURER_ID3,
  formatVersion: FORMAT_VERSION3,
  sysexModelId: { offset: 3, values: [88] },
  midiDetection: { portPattern: /ms.?2000|microkorg/i, displayName: "Korg MS2000" },
  midi: {
    defaultChannel: 1,
    defaultDeviceId: 88
  },
  supportsEditBuffer: false,
  interMessageDelayMs: 50,
  dumpTimeoutMs: 3e3,
  computeChecksum() {
    return 0;
  },
  // Korg uses 7-to-8 packing, no separate checksum
  verifyChecksum(sysex) {
    const modelId = MODEL_IDS2[this.modelId] || 88;
    if (sysex.length < 6) return false;
    if (sysex[0] !== 240 || sysex[1] !== 66 || sysex[3] !== modelId) return false;
    if (sysex[sysex.length - 1] !== 247) return false;
    const packed = sysex.slice(5, sysex.length - 1);
    if (packed.length % 8 !== 0) return false;
    return true;
  },
  buildPatchSysEx(rawData, slot, channel) {
    const modelId = MODEL_IDS2[this.modelId] || 88;
    const size = this.patchDataSize;
    const data = rawData.slice(0, size);
    const padded = new Uint8Array(size);
    padded.set(data);
    const packed = pack8to7(padded);
    return new Uint8Array([240, 66, 48 | channel & 15, modelId, CMD_DUMP2, ...packed, 247]);
  },
  parsePatchSysEx(sysex) {
    const modelId = MODEL_IDS2[this.modelId] || 88;
    if (!isKorgSysEx(sysex, modelId)) return null;
    if (sysex[sysex.length - 1] !== 247) return null;
    const packed = sysex.slice(5, sysex.length - 1);
    const unpacked = unpack7to8(packed);
    const rawData = unpacked.slice(0, this.patchDataSize);
    const slot = 0;
    return { rawData: new Uint8Array(rawData), slot };
  },
  buildDumpRequest(slot, channel) {
    const modelId = MODEL_IDS2[this.modelId] || 88;
    const cmd = slot === "all" ? CMD_ALL_REQUEST : CMD_REQUEST2;
    return new Uint8Array([240, 66, 48 | channel & 15, modelId, cmd, 247]);
  },
  parseDumpResponse(sysex) {
    const modelId = MODEL_IDS2[this.modelId] || 88;
    const msgs = splitSysex3(sysex).filter((m) => isKorgSysEx(m, modelId));
    const results = [];
    for (const msg of msgs) {
      const parsed = korgMs2000Contract.parsePatchSysEx?.call(this, msg);
      if (parsed) results.push(parsed);
    }
    return results;
  },
  legacySysEx: {
    modelIdByte: 88,
    buildDumpRequest: (ch) => new Uint8Array([240, 66, 48 | ch & 15, 88, CMD_REQUEST2, 247]),
    validateSysEx: (bytes) => bytes.length >= 5 && bytes[0] === 240 && bytes[1] === 66 && bytes[3] === 88
  }
};
var korgMicrokorgContract = {
  ...korgMs2000Contract,
  modelId: "korg-microkorg",
  displayName: "Korg microKORG",
  thumbnail: "korg-microkorg.jpg"
};
var korgProphecyContract = {
  ...korgMs2000Contract,
  modelId: "korg-prophecy",
  displayName: "Korg Prophecy",
  thumbnail: "korg-prophecy.webp",
  patchDataSize: 256,
  // Prophecy has a larger program data size
  extractPatchName(data) {
    const nameOffset = 28;
    if (data.length < nameOffset + PATCH_NAME_MAX_LENGTH3) return "";
    const nameBytes = data.slice(nameOffset, nameOffset + PATCH_NAME_MAX_LENGTH3);
    return new TextDecoder().decode(nameBytes).replace(/\0/g, "").trim();
  },
  legacySysEx: {
    ...korgMs2000Contract.legacySysEx,
    modelIdByte: 90
  }
};
var allKorgContracts = [
  korgMs2000Contract,
  korgMicrokorgContract,
  korgProphecyContract
];
allKorgContracts.forEach((c) => {
  const result = validateModelContract(c);
  if (!result.valid) {
    console.error(`\u274C ${c.modelId} validation failed:`, result.errors);
  }
});

// Source/Contracts/Models/behringer-dm12.ts
var DM12_PATCH_DATA_SIZE = 242;
var DM12_PATCH_NAME_MAX_LENGTH = 16;
var MODEL_ID = 32;
var MANUFACTURER_ID = [0, 32, 50];
var DEVICE_ID2 = 0;
var PROTOCOL_VERSION = 7;
var CMD_DUMP3 = 2;
var CMD_REQUEST3 = 1;
var PACKED_SIZE = 278;
var PROGRAMS_PER_BANK4 = 128;
var CATEGORIES4 = ["Bass", "Lead", "Pad", "FX", "Keys", "Perc", "Synth", "Other"];
function pack8to72(data) {
  const packed = [];
  for (let offset = 0; offset < data.length; offset += 7) {
    const count = Math.min(7, data.length - offset);
    let control = 0;
    for (let i = 0; i < count; i++) {
      if ((data[offset + i] & 128) !== 0) control |= 1 << i;
    }
    packed.push(control);
    for (let i = 0; i < 7; i++) packed.push(i < count ? data[offset + i] & 127 : 0);
  }
  return new Uint8Array(packed);
}
function unpack7to82(data) {
  const unpacked = [];
  for (let offset = 0; offset < data.length; offset += 8) {
    const control = data[offset];
    for (let i = 0; i < 7 && offset + i + 1 < data.length; i++) {
      unpacked.push(data[offset + i + 1] & 127 | (control >> i & 1) << 7);
    }
  }
  return new Uint8Array(unpacked);
}
function splitSysex4(data) {
  const result = [];
  let start = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 240 && start < 0) start = i;
    if (data[i] === 247 && start >= 0) {
      result.push(data.slice(start, i + 1));
      start = -1;
    }
  }
  return result;
}
function isDeepMindMessage(message) {
  return message.length >= 13 && message[0] === 240 && message[1] === MANUFACTURER_ID[0] && message[2] === MANUFACTURER_ID[1] && message[3] === MANUFACTURER_ID[2] && message[4] === MODEL_ID && message[6] === CMD_DUMP3 && message[message.length - 1] === 247;
}
var behringerDm12Contract = {
  modelId: "behringer-deepmind12",
  displayName: "Behringer DeepMind 12",
  manufacturer: "Behringer",
  icon: "behringer-logo.svg",
  thumbnail: "behringer-deepmind12.webp",
  bankCapacity: 1024,
  banksCount: 8,
  programsPerBank: 128,
  getProgramAddress(index) {
    return `${"ABCDEFGH"[Math.floor(index / 128)]}${String(index % 128 + 1).padStart(3, "0")}`;
  },
  parseProgramAddress(address) {
    const match = address.match(/^([A-H])(\d{3})$/i);
    if (!match) return null;
    const bank = "ABCDEFGH".indexOf(match[1].toUpperCase());
    const program = Number(match[2]);
    return bank >= 0 && program >= 1 && program <= 128 ? bank * 128 + program - 1 : null;
  },
  patchDataSize: DM12_PATCH_DATA_SIZE,
  patchNameMaxLength: DM12_PATCH_NAME_MAX_LENGTH,
  extractPatchName(data) {
    if (data.length < 239) return "";
    return new TextDecoder().decode(data.slice(223, 239)).replace(/\0/g, "").trim();
  },
  categories: CATEGORIES4,
  defaultCategory: "Other",
  compatibleModels: [],
  sysexManufacturerId: MANUFACTURER_ID,
  formatVersion: 1,
  sysexModelId: { offset: 4, values: [32] },
  midiDetection: { portPattern: /deep.?mind|dm.?12/i, displayName: "DeepMind 12" },
  parameterSchemaKey: "behringer-deepmind12",
  midi: { defaultChannel: 1, defaultDeviceId: DEVICE_ID2 },
  supportsEditBuffer: false,
  interMessageDelayMs: 50,
  dumpTimeoutMs: 5e3,
  computeChecksum: () => 0,
  verifyChecksum(sysex) {
    return isDeepMindMessage(sysex) && sysex.length === 291;
  },
  buildPatchSysEx(rawData, slot, _channel) {
    const data = new Uint8Array(DM12_PATCH_DATA_SIZE);
    data.set(rawData.slice(0, DM12_PATCH_DATA_SIZE));
    const packed = pack8to72(data);
    const padded = new Uint8Array(PACKED_SIZE);
    padded.set(packed.slice(0, PACKED_SIZE));
    const bank = Math.max(0, Math.min(7, Math.floor(slot / PROGRAMS_PER_BANK4)));
    const program = Math.max(0, Math.min(127, slot % PROGRAMS_PER_BANK4));
    return new Uint8Array([240, ...MANUFACTURER_ID, MODEL_ID, DEVICE_ID2, CMD_DUMP3, PROTOCOL_VERSION, bank, program, ...padded, 0, 0, 247]);
  },
  parsePatchSysEx(sysex) {
    if (!isDeepMindMessage(sysex)) return null;
    const slot = (sysex[8] & 7) * PROGRAMS_PER_BANK4 + (sysex[9] & 127);
    return { rawData: unpack7to82(sysex.slice(10, 10 + PACKED_SIZE)).slice(0, DM12_PATCH_DATA_SIZE), slot };
  },
  buildDumpRequest(slot, _channel) {
    const bank = slot === "all" ? 0 : Math.max(0, Math.min(7, Math.floor(slot / PROGRAMS_PER_BANK4)));
    const program = slot === "all" ? 0 : Math.max(0, Math.min(127, slot % PROGRAMS_PER_BANK4));
    return new Uint8Array([240, ...MANUFACTURER_ID, MODEL_ID, DEVICE_ID2, CMD_REQUEST3, bank, program, 247]);
  },
  parseDumpResponse(sysex) {
    return splitSysex4(sysex).flatMap((message) => {
      const parsed = this.parsePatchSysEx?.(message);
      return parsed ? [parsed] : [];
    });
  },
  legacySysEx: {
    modelIdByte: MODEL_ID,
    buildDumpRequest: (channel) => new Uint8Array([240, ...MANUFACTURER_ID, MODEL_ID, DEVICE_ID2, CMD_REQUEST3, 0, 0, 247]),
    validateSysEx: (bytes) => isDeepMindMessage(bytes)
  }
};
var allBehringerDm12Contracts = [behringerDm12Contract];
allBehringerDm12Contracts.forEach((contract) => {
  const result = validateModelContract(contract);
  if (!result.valid) console.error(`\u274C ${contract.modelId} validation failed:`, result.errors);
});

// Source/Contracts/Models/behringer-pro800.ts
var PRO800_BANK_CAPACITY = 400;
var PRO800_BANKS_COUNT = 4;
var PRO800_PROGRAMS_PER_BANK = 100;
var PRO800_PATCH_DATA_SIZE = 173;
var PRO800_PATCH_NAME_MAX_LENGTH = 16;
var PRO800_FORMAT_VERSIONS = {
  109: { firmwareRange: { max: "1.2.7" }, rawDataSize: 173, label: "legacy-v109" },
  110: { firmwareRange: { max: "1.2.7" }, rawDataSize: 168, label: "legacy-v110" },
  111: { firmwareRange: { min: "1.3.6" }, rawDataSize: 173, label: "v111" }
};
var PRO800_NAME_OFFSET = 150;
var CATEGORIES5 = ["Bass", "Lead", "Pad", "FX", "Keys", "Perc", "Synth", "Other"];
var DEFAULT_CATEGORY4 = "Other";
var SYSEX_MANUFACTURER_ID4 = [0, 32, 50];
var FORMAT_VERSION4 = 1;
var PRO800_CMD_REQUEST = 119;
var PRO800_CMD_RESPONSE = 120;
var PRO800_HEADER_BYTES = [0, 32, 50, 0, 1, 36, 0];
function pack8to73(data) {
  const packed = [];
  let srcIdx = 0;
  while (srcIdx < data.length) {
    const chunkSize = Math.min(7, data.length - srcIdx);
    let msbCollector = 0;
    for (let i = 0; i < chunkSize; i++) {
      if ((data[srcIdx + i] & 128) !== 0) msbCollector |= 1 << i;
    }
    packed.push(msbCollector);
    for (let i = 0; i < chunkSize; i++) packed.push(data[srcIdx + i] & 127);
    srcIdx += chunkSize;
  }
  return new Uint8Array(packed);
}
function getFormatVersion(rawData) {
  const version = rawData[4];
  return PRO800_FORMAT_VERSIONS[version] ? version : null;
}
function unpack7to83(packed) {
  const unpacked = [];
  let srcIdx = 0;
  while (srcIdx < packed.length) {
    const msbCollector = packed[srcIdx++];
    for (let i = 0; i < 7 && srcIdx < packed.length; i++) {
      const bit7 = msbCollector >> i & 1;
      unpacked.push(packed[srcIdx++] & 127 | bit7 << 7);
    }
  }
  return new Uint8Array(unpacked);
}
function isPro800SysEx(msg, cmd) {
  if (msg.length < 12) return false;
  if (msg[0] !== 240) return false;
  for (let i = 0; i < PRO800_HEADER_BYTES.length; i++) {
    if (msg[1 + i] !== PRO800_HEADER_BYTES[i]) return false;
  }
  if (msg[8] !== cmd) return false;
  if (msg[msg.length - 1] !== 247) return false;
  return true;
}
function splitSysex5(raw) {
  const msgs = [];
  let inSysex = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 240 && !inSysex) {
      inSysex = true;
      start = i;
    } else if (raw[i] === 247 && inSysex) {
      msgs.push(raw.slice(start, i + 1));
      inSysex = false;
    }
  }
  return msgs;
}
function getPro800BankLetter(index) {
  return "ABCD"[Math.floor(index / 100)];
}
function getPro800ProgramNumber(index) {
  return index % 100 + 1;
}
function clampSlot(slot) {
  if (slot === "all") return 0;
  return Math.max(0, Math.min(PRO800_BANK_CAPACITY - 1, slot));
}
var behringerPro800Contract = {
  modelId: "behringer-pro800",
  displayName: "Behringer Pro-800",
  manufacturer: "Behringer",
  icon: "behringer-logo.svg",
  thumbnail: "behringer-pro800.webp",
  bankCapacity: PRO800_BANK_CAPACITY,
  banksCount: PRO800_BANKS_COUNT,
  programsPerBank: PRO800_PROGRAMS_PER_BANK,
  getProgramAddress(globalIndex) {
    return `${getPro800BankLetter(globalIndex)}${String(getPro800ProgramNumber(globalIndex)).padStart(3, "0")}`;
  },
  parseProgramAddress(address) {
    const match = address.match(/^([A-D])(\d{1,3})$/i);
    if (!match) return null;
    const bank = match[1].toUpperCase();
    const prog = parseInt(match[2], 10);
    const bankIdx = "ABCD".indexOf(bank);
    if (bankIdx === -1 || prog < 1 || prog > 100) return null;
    return bankIdx * 100 + (prog - 1);
  },
  patchDataSize: PRO800_PATCH_DATA_SIZE,
  patchNameMaxLength: PRO800_PATCH_NAME_MAX_LENGTH,
  extractPatchName(data) {
    if (data.length <= PRO800_NAME_OFFSET) return "";
    const chars = [];
    const end = Math.min(data.length, PRO800_NAME_OFFSET + PRO800_PATCH_NAME_MAX_LENGTH);
    for (let i = PRO800_NAME_OFFSET; i < end; i++) {
      const c = data[i];
      if (c === 0) break;
      if (c >= 32 && c <= 126) chars.push(String.fromCharCode(c));
    }
    return chars.join("");
  },
  categories: CATEGORIES5,
  defaultCategory: DEFAULT_CATEGORY4,
  compatibleModels: [],
  sysexManufacturerId: SYSEX_MANUFACTURER_ID4,
  formatVersion: FORMAT_VERSION4,
  sysexModelId: { offset: 4, values: [0], multiByte: [1, 36] },
  midiDetection: { portPattern: /pro.?800/i, displayName: "Pro-800" },
  parameterSchemaKey: "behringer-pro800",
  midi: { defaultChannel: 1, defaultDeviceId: 16 },
  supportsEditBuffer: false,
  interMessageDelayMs: 50,
  dumpTimeoutMs: 5e3,
  computeChecksum() {
    return 0;
  },
  verifyChecksum(sysex) {
    if (!isPro800SysEx(sysex, PRO800_CMD_RESPONSE)) return false;
    const packed = sysex.slice(11, sysex.length - 1);
    const unpacked = unpack7to83(packed);
    return packed.length > 0 && isPro800SysEx(sysex, PRO800_CMD_RESPONSE);
  },
  buildPatchSysEx(rawData, slot, _channel) {
    const s = clampSlot(slot);
    const version = getFormatVersion(rawData);
    const size = version === 109 || version === 110 ? rawData.length : this.patchDataSize;
    const data = rawData.slice(0, size);
    const padded = new Uint8Array(size);
    padded.set(data);
    const packed = pack8to73(padded);
    const lsb = s % 128;
    const msb = Math.floor(s / 128);
    return new Uint8Array([
      240,
      ...PRO800_HEADER_BYTES,
      PRO800_CMD_RESPONSE,
      lsb,
      msb,
      ...packed,
      247
    ]);
  },
  parsePatchSysEx(sysex) {
    if (!isPro800SysEx(sysex, PRO800_CMD_RESPONSE)) return null;
    const packed = sysex.slice(11, sysex.length - 1);
    const unpacked = unpack7to83(packed);
    const version = getFormatVersion(unpacked);
    const versionSize = version === null ? this.patchDataSize : PRO800_FORMAT_VERSIONS[version].rawDataSize;
    const slot = sysex[9] + (sysex[10] << 7);
    const decodedSize = version === 109 ? unpacked.length : Math.min(versionSize, this.patchDataSize);
    return { rawData: new Uint8Array(unpacked.slice(0, decodedSize)), slot };
  },
  buildDumpRequest(slot, _channel) {
    const s = clampSlot(slot);
    const lsb = s % 128;
    const msb = Math.floor(s / 128);
    return new Uint8Array([
      240,
      ...PRO800_HEADER_BYTES,
      PRO800_CMD_REQUEST,
      lsb,
      msb,
      247
    ]);
  },
  parseDumpResponse(sysex) {
    const msgs = splitSysex5(sysex);
    const results = [];
    for (const msg of msgs) {
      const parsed = behringerPro800Contract.parsePatchSysEx?.(msg);
      if (parsed) results.push(parsed);
    }
    return results;
  },
  legacySysEx: {
    // Real Pro-800 identity is the multi-byte sequence 00 01 24 — a single
    // modelIdByte cannot represent it. This is legacy-facing only; the app
    // uses parsePatchSysEx / getContractForSysex with the full header check.
    modelIdByte: 0,
    buildDumpRequest: () => new Uint8Array([240, 0, 32, 50, 0, 1, 36, 0, PRO800_CMD_REQUEST, 0, 0, 247]),
    validateSysEx: (bytes) => bytes.length >= 12 && bytes[0] === 240 && bytes[1] === 0 && bytes[2] === 32 && bytes[3] === 50 && bytes[4] === 0 && bytes[5] === 1 && bytes[6] === 36
  }
};
var allBehringerPro800Contracts = [
  behringerPro800Contract
];
allBehringerPro800Contracts.forEach((c) => {
  const result = validateModelContract(c);
  if (!result.valid) {
    console.error(`\u274C ${c.modelId} validation failed:`, result.errors);
  }
});

// Source/Contracts/Models/yamaha-dx7.ts
var DX7_PATCH_DATA_SIZE = 128;
var DX7_PATCH_NAME_MAX_LENGTH = 10;
var DX7II_PATCH_DATA_SIZE = 155;
var DX7II_PATCH_NAME_MAX_LENGTH = 10;
var CATEGORIES6 = ["Bass", "Lead", "Pad", "FX", "Keys", "Perc", "Synth", "Other"];
var DEFAULT_CATEGORY5 = "Other";
var SYSEX_MANUFACTURER_ID5 = [67];
var FORMAT_VERSION5 = 1;
var CMD_BULK = 9;
var SUB_SINGLE = 32;
function dx7Checksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum += b;
  return 128 - sum % 128 & 127;
}
function unpackProgram(ved, vmem) {
  const bulk = vmem;
  for (let op = 0; op < 6; op++) {
    for (let i = 0; i < 11; i++) {
      ved[op * 21 + i] = bulk[op * 17 + i] & 127;
    }
    const curves = bulk[op * 17 + 11] & 15;
    ved[op * 21 + 11] = curves & 3;
    ved[op * 21 + 12] = curves >> 2 & 3;
    const detuneRs = bulk[op * 17 + 12] & 127;
    ved[op * 21 + 13] = detuneRs & 7;
    const kvsAms = bulk[op * 17 + 13] & 31;
    ved[op * 21 + 14] = kvsAms & 3;
    ved[op * 21 + 15] = kvsAms >> 2 & 7;
    ved[op * 21 + 16] = bulk[op * 17 + 14] & 127;
    const fcoarseMode = bulk[op * 17 + 15] & 63;
    ved[op * 21 + 17] = fcoarseMode & 1;
    ved[op * 21 + 18] = fcoarseMode >> 1 & 31;
    ved[op * 21 + 19] = bulk[op * 17 + 16] & 127;
    ved[op * 21 + 20] = detuneRs >> 3 & 127;
  }
  for (let i = 0; i < 8; i++) {
    ved[126 + i] = bulk[102 + i] & 127;
  }
  ved[134] = bulk[110] & 31;
  const oksFb = bulk[111] & 15;
  ved[135] = oksFb & 7;
  ved[136] = oksFb >> 3;
  ved[137] = bulk[112] & 127;
  ved[138] = bulk[113] & 127;
  ved[139] = bulk[114] & 127;
  ved[140] = bulk[115] & 127;
  const lpmsLfwLks = bulk[116] & 127;
  ved[141] = lpmsLfwLks & 1;
  ved[142] = lpmsLfwLks >> 1 & 7;
  ved[143] = lpmsLfwLks >> 4;
  ved[144] = bulk[117] & 127;
  for (let i = 0; i < 10; i++) {
    ved[145 + i] = bulk[118 + i] & 127;
  }
}
function packProgram(vmem, ved) {
  for (let op = 0; op < 6; op++) {
    for (let i = 0; i < 11; i++) {
      vmem[op * 17 + i] = ved[op * 21 + i] & 127;
    }
    vmem[op * 17 + 11] = ved[op * 21 + 11] & 3 | (ved[op * 21 + 12] & 3) << 2;
    vmem[op * 17 + 12] = ved[op * 21 + 13] & 7 | (ved[op * 21 + 20] & 127) << 3;
    vmem[op * 17 + 13] = ved[op * 21 + 14] & 3 | (ved[op * 21 + 15] & 7) << 2;
    vmem[op * 17 + 14] = ved[op * 21 + 16] & 127;
    vmem[op * 17 + 15] = ved[op * 21 + 17] & 1 | (ved[op * 21 + 18] & 31) << 1;
    vmem[op * 17 + 16] = ved[op * 21 + 19] & 127;
  }
  for (let i = 0; i < 8; i++) {
    vmem[102 + i] = ved[126 + i] & 127;
  }
  vmem[110] = ved[134] & 31;
  vmem[111] = ved[135] & 7 | (ved[136] & 1) << 3;
  vmem[112] = ved[137] & 127;
  vmem[113] = ved[138] & 127;
  vmem[114] = ved[139] & 127;
  vmem[115] = ved[140] & 127;
  vmem[116] = ved[141] & 1 | (ved[142] & 7) << 1 | (ved[143] & 7) << 4;
  vmem[117] = ved[144] & 127;
  for (let i = 0; i < 10; i++) {
    vmem[118 + i] = ved[145 + i] & 127;
  }
}
function buildDx7VoiceSysEx(ved, channel) {
  const header = new Uint8Array([240, 67, 16 | channel & 15, 0, 1, 27]);
  const result = new Uint8Array(6 + 155 + 2);
  result.set(header, 0);
  result.set(ved.subarray(0, 155), 6);
  result[6 + 155] = dx7Checksum(ved.subarray(0, 155));
  result[6 + 155 + 1] = 247;
  return result;
}
function splitSysex6(raw) {
  const msgs = [];
  let inSysex = false;
  let start = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 240 && !inSysex) {
      inSysex = true;
      start = i;
    } else if (raw[i] === 247 && inSysex) {
      msgs.push(raw.slice(start, i + 1));
      inSysex = false;
    }
  }
  return msgs;
}
function dx7HeaderLen(msg) {
  if (msg.length >= 8 && msg[3] === CMD_BULK && msg[4] === SUB_SINGLE && msg[5] === 0) return 6;
  if (msg.length >= 9 && msg[4] === CMD_BULK && msg[5] === SUB_SINGLE) return 7;
  return 0;
}
function isDx7Voice(msg, modelByte) {
  if (msg[0] !== 240 || msg[1] !== 67 || msg[msg.length - 1] !== 247) return false;
  if (msg.length === 163 && msg[3] === 0 && msg[4] === 1 && msg[5] === 27) return true;
  const hdr = dx7HeaderLen(msg);
  if (hdr === 6) {
    return msg.length === hdr + DX7_PATCH_DATA_SIZE + 2;
  }
  if (hdr === 7) {
    return msg.length === hdr + DX7_PATCH_DATA_SIZE + 2 && msg[3] === modelByte;
  }
  return false;
}
function isDx7Bulk(msg, modelByte) {
  if (msg[0] !== 240 || msg[1] !== 67 || msg[msg.length - 1] !== 247) return false;
  const hdr = dx7HeaderLen(msg);
  if (hdr === 6) {
    return msg.length === hdr + 32 * DX7_PATCH_DATA_SIZE + 2;
  }
  if (hdr === 7) {
    return msg.length === hdr + 32 * DX7_PATCH_DATA_SIZE + 2 && msg[3] === modelByte;
  }
  return false;
}
function getDx7ProgramNumber(index) {
  return index % 32 + 1;
}
function getDx7iiProgramNumber(index) {
  return index % 64 + 1;
}
var yamahaDx7Contract = {
  modelId: "yamaha-dx7",
  displayName: "Yamaha DX7",
  manufacturer: "Yamaha",
  icon: "yamaha-logo.svg",
  thumbnail: "yamaha-dx7.jpg",
  bankCapacity: 32,
  banksCount: 1,
  programsPerBank: 32,
  getProgramAddress(globalIndex) {
    return `V${String(getDx7ProgramNumber(globalIndex)).padStart(2, "0")}`;
  },
  parseProgramAddress(address) {
    const match = address.match(/^V(\d{2})$/i);
    if (!match) return null;
    const prog = parseInt(match[1], 10);
    if (prog < 1 || prog > 32) return null;
    return prog - 1;
  },
  patchDataSize: DX7_PATCH_DATA_SIZE,
  patchNameMaxLength: DX7_PATCH_NAME_MAX_LENGTH,
  extractPatchName(data) {
    if (data.length < 128) return "";
    const nameBytes = data.slice(118, 128);
    let name = "";
    for (const b of nameBytes) {
      if (b === 0) break;
      if (b >= 32 && b <= 126) name += String.fromCharCode(b);
    }
    return name.trimEnd();
  },
  categories: CATEGORIES6,
  defaultCategory: DEFAULT_CATEGORY5,
  compatibleModels: ["yamaha-dx7ii"],
  sysexManufacturerId: SYSEX_MANUFACTURER_ID5,
  formatVersion: FORMAT_VERSION5,
  // DX7 uses byte[3] = device byte (0x00=DX7, 0x01=DX7II) for disambiguation
  sysexModelId: { offset: 3, values: [0] },
  midiDetection: { portPattern: /dx.?7|fm.?1|m.?wave|cuvave/i, displayName: "DX7" },
  parameterSchemaKey: "yamaha-dx7",
  midi: { defaultChannel: 1, defaultDeviceId: 16 },
  supportsEditBuffer: false,
  interMessageDelayMs: 50,
  dumpTimeoutMs: 5e3,
  computeChecksum(data) {
    return dx7Checksum(data);
  },
  verifyChecksum(sysex) {
    if (sysex.length < 8) return false;
    if (sysex[0] !== 240 || sysex[1] !== 67) return false;
    if (sysex[sysex.length - 1] !== 247) return false;
    if (sysex.length === 163 && sysex[3] === 0 && sysex[4] === 1 && sysex[5] === 27) {
      const payload2 = sysex.slice(6, sysex.length - 2);
      return sysex[sysex.length - 2] === dx7Checksum(payload2);
    }
    const hdr = dx7HeaderLen(sysex);
    if (hdr === 0) return false;
    const payload = sysex.slice(hdr, sysex.length - 2);
    return sysex[sysex.length - 2] === dx7Checksum(payload);
  },
  buildPatchSysEx(rawData, _slot, channel) {
    const ved = new Uint8Array(155);
    const paddedVmem = new Uint8Array(DX7_PATCH_DATA_SIZE);
    paddedVmem.set(rawData.slice(0, DX7_PATCH_DATA_SIZE));
    unpackProgram(ved, paddedVmem);
    return buildDx7VoiceSysEx(ved, channel);
  },
  buildBulkSysEx(patches, channel) {
    const header = new Uint8Array([240, 67, 16 | channel & 15, CMD_BULK, SUB_SINGLE, 0]);
    const bankSize = 32 * DX7_PATCH_DATA_SIZE;
    const result = new Uint8Array(header.length + bankSize + 2);
    result.set(header, 0);
    for (const p of patches) {
      const offset = header.length + p.slot * DX7_PATCH_DATA_SIZE;
      const data = p.rawData.slice(0, DX7_PATCH_DATA_SIZE);
      result.set(data, offset);
    }
    const checksum = dx7Checksum(result.slice(header.length, header.length + bankSize));
    result[header.length + bankSize] = checksum;
    result[result.length - 1] = 247;
    return result;
  },
  parsePatchSysEx(sysex) {
    if (!isDx7Voice(sysex, 0)) return null;
    if (sysex.length === 163 && sysex[3] === 0 && sysex[4] === 1 && sysex[5] === 27) {
      const ved = new Uint8Array(sysex.slice(6, 6 + 155));
      const vmem = new Uint8Array(DX7_PATCH_DATA_SIZE);
      packProgram(vmem, ved);
      return { rawData: vmem, slot: 0 };
    }
    const hdr = dx7HeaderLen(sysex);
    return { rawData: new Uint8Array(sysex.slice(hdr, hdr + DX7_PATCH_DATA_SIZE)), slot: 0 };
  },
  buildDumpRequest(_slot, channel) {
    return new Uint8Array([240, 67, 16 | channel & 15, CMD_BULK, SUB_SINGLE, 0, 247]);
  },
  parseDumpResponse(sysex) {
    const msgs = splitSysex6(sysex);
    const results = [];
    for (const msg of msgs) {
      const hdr = dx7HeaderLen(msg);
      if (hdr === 0) continue;
      if (isDx7Voice(msg, 0)) {
        results.push({ rawData: new Uint8Array(msg.slice(hdr, hdr + DX7_PATCH_DATA_SIZE)), slot: results.length });
      } else if (isDx7Bulk(msg, 0)) {
        const patchData = msg.slice(hdr, hdr + 32 * DX7_PATCH_DATA_SIZE);
        for (let i = 0; i < 32; i++) {
          const s = i * DX7_PATCH_DATA_SIZE;
          results.push({ rawData: new Uint8Array(patchData.slice(s, s + DX7_PATCH_DATA_SIZE)), slot: i });
        }
      }
    }
    return results;
  },
  legacySysEx: {
    modelIdByte: 0,
    buildDumpRequest: (ch) => new Uint8Array([240, 67, 16 | ch & 15, 0, CMD_BULK, SUB_SINGLE, 0, 247]),
    validateSysEx: (bytes) => bytes.length >= 6 && bytes[0] === 240 && bytes[1] === 67 && bytes[3] === 0
  }
};
var yamahaDx7iiContract = {
  ...yamahaDx7Contract,
  modelId: "yamaha-dx7ii",
  displayName: "Yamaha DX7II",
  thumbnail: "yamaha-dx7ii.jpg",
  sysexModelId: { offset: 3, values: [1] },
  midiDetection: { portPattern: /dx.?7ii|dx7.?ii/i, displayName: "DX7II" },
  parameterSchemaKey: "yamaha-dx7ii",
  bankCapacity: 64,
  programsPerBank: 64,
  patchDataSize: DX7II_PATCH_DATA_SIZE,
  patchNameMaxLength: DX7II_PATCH_NAME_MAX_LENGTH,
  getProgramAddress(globalIndex) {
    return `V${String(getDx7iiProgramNumber(globalIndex)).padStart(2, "0")}`;
  },
  parseProgramAddress(address) {
    const match = address.match(/^V(\d{2})$/i);
    if (!match) return null;
    const prog = parseInt(match[1], 10);
    if (prog < 1 || prog > 64) return null;
    return prog - 1;
  },
  extractPatchName(data) {
    if (data.length < 128) return "";
    const nameBytes = data.slice(118, 128);
    let name = "";
    for (const b of nameBytes) {
      if (b === 0) break;
      if (b >= 32 && b <= 126) name += String.fromCharCode(b);
    }
    return name.trimEnd();
  },
  buildPatchSysEx(rawData, _slot, channel) {
    const data = rawData.slice(0, DX7II_PATCH_DATA_SIZE);
    const padded = new Uint8Array(DX7II_PATCH_DATA_SIZE);
    padded.set(data);
    const header = new Uint8Array([240, 67, 16 | channel & 15, 1, CMD_BULK, SUB_SINGLE, 0]);
    const payload = new Uint8Array(header.length + DX7II_PATCH_DATA_SIZE);
    payload.set(header, 0);
    payload.set(padded, header.length);
    const checksum = dx7Checksum(payload.slice(7));
    const result = new Uint8Array(payload.length + 2);
    result.set(payload, 0);
    result[payload.length] = checksum;
    result[result.length - 1] = 247;
    return result;
  },
  parsePatchSysEx(sysex) {
    if (sysex.length !== 7 + DX7II_PATCH_DATA_SIZE + 2) return null;
    if (sysex[0] !== 240 || sysex[1] !== 67) return null;
    if (sysex[3] !== 1) return null;
    if (sysex[4] !== CMD_BULK || sysex[5] !== SUB_SINGLE || sysex[6] !== 0) return null;
    if (sysex[sysex.length - 1] !== 247) return null;
    const payload = sysex.slice(7, sysex.length - 2);
    if (sysex[sysex.length - 2] !== dx7Checksum(payload)) return null;
    return { rawData: new Uint8Array(sysex.slice(7, 7 + DX7II_PATCH_DATA_SIZE)), slot: 0 };
  },
  legacySysEx: {
    modelIdByte: 1,
    buildDumpRequest: (ch) => new Uint8Array([240, 67, 16 | ch & 15, 1, CMD_BULK, SUB_SINGLE, 0, 247]),
    validateSysEx: (bytes) => bytes.length >= 6 && bytes[0] === 240 && bytes[1] === 67 && bytes[3] === 1
  }
};
var allYamahaContracts = [
  yamahaDx7Contract,
  yamahaDx7iiContract
];
allYamahaContracts.forEach((c) => {
  const result = validateModelContract(c);
  if (!result.valid) {
    console.error(`\u274C ${c.modelId} validation failed:`, result.errors);
  }
});

// Source/Core/MidiSysExQueue.ts
var HARDWARE_QUEUE_CONFIGS = {
  "casio-cz": { interMessageDelayMs: 100, dumpTimeoutMs: 5e3 },
  "roland-juno": { interMessageDelayMs: 50, dumpTimeoutMs: 3e3 },
  "korg-ms2000": { interMessageDelayMs: 20, dumpTimeoutMs: 2e3 },
  "behringer-dm12": { interMessageDelayMs: 10, dumpTimeoutMs: 1e3 },
  "yamaha-dx7": { interMessageDelayMs: 20, dumpTimeoutMs: 2e3 }
};

// Source/Contracts/Models/index.ts
var allModelContracts = [
  ...allCasioContracts,
  ...allRolandJunoContracts,
  ...allKorgContracts,
  ...allBehringerDm12Contracts,
  ...allBehringerPro800Contracts,
  ...allYamahaContracts
];
var modelContractMap = new Map(allModelContracts.map((c) => [c.modelId, c]));
function getModelContract(modelId) {
  return modelContractMap.get(modelId);
}
function getCompatibleModels(modelId) {
  const contract = modelContractMap.get(modelId);
  return contract?.compatibleModels || [];
}
function getHardwareIds(modelId) {
  const contract = modelContractMap.get(modelId);
  if (!contract) return [modelId];
  return [modelId, ...contract.compatibleModels || []];
}
function getContractsForManufacturer(manufacturer) {
  return allModelContracts.filter((c) => c.manufacturer === manufacturer);
}
var MANUFACTURER_TO_QUEUE_KEY = {
  Casio: "casio-cz",
  Roland: "roland-juno",
  Korg: "korg-ms2000",
  Behringer: "behringer-dm12",
  Yamaha: "yamaha-dx7"
};
function getMidiConfig(modelId) {
  const contract = modelContractMap.get(modelId);
  const queueKey = contract ? MANUFACTURER_TO_QUEUE_KEY[contract.manufacturer] : void 0;
  const queue = queueKey ? HARDWARE_QUEUE_CONFIGS[queueKey] : void 0;
  return {
    channel: contract?.midi?.defaultChannel ?? 1,
    deviceId: contract?.manufacturer === "Korg" ? 16 : contract?.midi?.defaultDeviceId ?? 16,
    interMessageDelayMs: queue?.interMessageDelayMs ?? 20,
    dumpTimeoutMs: queue?.dumpTimeoutMs ?? 3e3
  };
}
export {
  allBehringerDm12Contracts,
  allBehringerPro800Contracts,
  allCasioContracts,
  allKorgContracts,
  allModelContracts,
  allRolandJunoContracts,
  allYamahaContracts,
  casioCz1000Contract,
  casioCz1Contract,
  casioCz5000Contract,
  getCompatibleModels,
  getContractsForManufacturer,
  getHardwareIds,
  getMidiConfig,
  getModelContract,
  korgMicrokorgContract,
  korgProphecyContract,
  modelContractMap,
  rolandHs60Contract,
  rolandJuno60Contract,
  rolandJuno6Contract,
  yamahaDx7iiContract
};
