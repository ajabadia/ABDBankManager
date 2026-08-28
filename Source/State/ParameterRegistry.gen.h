// GENERATED FILE — DO NOT EDIT
// Source: schemas/parameters-spec.schema.v1.json
// Generator: Scripts/registry_generator.js

#pragma once

#include <cstdint>
#include <array>

namespace ABD::BankManager::ParameterRegistry {

// Schema version
constexpr const char* kSchemaVersion = "1.0.0";
constexpr uint32_t kParameterCount = 0;
constexpr uint32_t kSysexParameterCount = 0;

// Parameter IDs (stable — never change these)


// Parameter lookup by index
inline const char* getParamId(uint32_t index) {
    static constexpr const char* ids[] = {

    };
    return (index < kParameterCount) ? ids[index] : nullptr;
}

// Sysex offset lookup (only for parameters with sysex=true)
inline int getSysexOffset(const char* paramId) {

    return -1;
}

// CC lookup
inline int getCC(const char* paramId) {

    return -1;
}

// Parameter metadata
struct ParamInfo {
    const char* id;
    const char* name;
    const char* group;
    int16_t cc;           // -1 if none
    float minValue;
    float maxValue;
    float defaultValue;
    uint8_t type;         // 0=continuous, 1=integer, 2=choice, 3=boolean
    uint8_t choiceCount;  // for choice type
    bool sysex;
};

inline const ParamInfo* getParamInfo(const char* paramId) {

    return nullptr;
}

// Choice labels (for choice-type parameters)
inline const char* getChoiceLabel(const char* paramId, uint32_t index) {

    return nullptr;
}

// All parameter IDs as array (for iteration)
inline std::array<const char*, 0> getAllParamIds() {
    return {  };
}

} // namespace ABD::BankManager::ParameterRegistry
