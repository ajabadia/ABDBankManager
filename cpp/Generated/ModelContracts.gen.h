// GENERATED FILE — DO NOT EDIT
// Source: WebUI/src/contracts/gen/modelContracts.gen.js (canonical TS contracts)
// Generator: scripts/model_contract_generator.js
//
// Patch/Bank structs shared by BankManagerCore and the WebView bridge.
// Regenerate after any contract change: node scripts/model_contract_generator.js

#pragma once

#include <string>
#include <vector>
#include <cstdint>

namespace ABD::BankManager::Contracts {

constexpr int kModelContractCount = 17;

// Supported model ids (stable — derived from the canonical contracts)
inline const char* const kModelIds[] = {
    "casio-cz101",
    "casio-cz1000",
    "casio-cz5000",
    "casio-cz1",
    "roland-juno106",
    "roland-juno60",
    "roland-juno6",
    "roland-hs60",
    "korg-ms2000",
    "korg-microkorg",
    "korg-prophecy",
    "behringer-deepmind12",
    "behringer-deepmind6",
    "behringer-deepmind12d",
    "behringer-pro800",
    "yamaha-dx7",
    "yamaha-dx7ii"
};

// Programs per bank per model (0 = unknown model)
inline int getProgramsPerBank(const std::string& modelId) {
    if (modelId == "casio-cz101") return 16;
    if (modelId == "casio-cz1000") return 16;
    if (modelId == "casio-cz5000") return 16;
    if (modelId == "casio-cz1") return 16;
    if (modelId == "roland-juno106") return 64;
    if (modelId == "roland-juno60") return 64;
    if (modelId == "roland-juno6") return 64;
    if (modelId == "roland-hs60") return 64;
    if (modelId == "korg-ms2000") return 16;
    if (modelId == "korg-microkorg") return 16;
    if (modelId == "korg-prophecy") return 16;
    if (modelId == "behringer-deepmind12") return 128;
    if (modelId == "behringer-deepmind6") return 128;
    if (modelId == "behringer-deepmind12d") return 128;
    if (modelId == "behringer-pro800") return 100;
    if (modelId == "yamaha-dx7") return 32;
    if (modelId == "yamaha-dx7ii") return 64;
    return 0;
}

// Patch data size in bytes per model (0 = unknown model)
inline int getPatchDataSize(const std::string& modelId) {
    if (modelId == "casio-cz101") return 128;
    if (modelId == "casio-cz1000") return 128;
    if (modelId == "casio-cz5000") return 128;
    if (modelId == "casio-cz1") return 288;
    if (modelId == "roland-juno106") return 18;
    if (modelId == "roland-juno60") return 18;
    if (modelId == "roland-juno6") return 18;
    if (modelId == "roland-hs60") return 18;
    if (modelId == "korg-ms2000") return 288;
    if (modelId == "korg-microkorg") return 288;
    if (modelId == "korg-prophecy") return 256;
    if (modelId == "behringer-deepmind12") return 242;
    if (modelId == "behringer-deepmind6") return 242;
    if (modelId == "behringer-deepmind12d") return 242;
    if (modelId == "behringer-pro800") return 173;
    if (modelId == "yamaha-dx7") return 128;
    if (modelId == "yamaha-dx7ii") return 155;
    return 0;
}

// PatchData mirror (fields match WebUI PatchData / ValueTree keys)
struct PatchData {
    std::string id;
    std::string bankId;
    int index = 0;
    std::string name;
    std::string category;
    std::string author;
    std::vector<std::string> tags;
    std::string notes;
    std::vector<uint8_t> rawData;
    std::vector<std::string> hardwareIds;
    std::string fingerprint;
    int versionNumber = 1;
    std::string previousVersionId;
    std::string creationDate;
    std::string modifiedDate;
};

// Bank mirror (fields match WebUI Bank / ValueTree keys)
struct Bank {
    std::string id;
    std::string name;
    std::string modelId;
    std::vector<std::string> hardwareIds;
    std::string manufacturer;
    bool isFactory = false;
    bool isLocked = false;
    std::string creationDate;
    std::string modifiedDate;
};

inline bool isKnownModelId(const std::string& modelId) {
    for (const char* id : kModelIds) {
        if (modelId == id) return true;
    }
    return false;
}

} // namespace ABD::BankManager::Contracts
