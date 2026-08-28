/**
 * ABD Bank Manager — C++ Core Module Implementation
 */

#include "ABDBankManagerCore.h"

namespace ABD::BankManager {

juce::ValueTree BankManagerCore::toValueTree() const {
    juce::ValueTree vt("ABDBankManager");
    vt.setProperty("currentBankIndex", currentBankIndex, nullptr);
    vt.setProperty("currentPatchIndex", currentPatchIndex, nullptr);
    return vt;
}

void BankManagerCore::fromValueTree(const juce::ValueTree& vt) {
    if (vt.hasType("ABDBankManager")) {
        currentBankIndex = vt.getProperty("currentBankIndex", 0);
        currentPatchIndex = vt.getProperty("currentPatchIndex", 0);
    }
}

void BankManagerCore::selectPreset(int bankIndex, int patchIndex) {
    currentBankIndex = bankIndex;
    currentPatchIndex = patchIndex;
}

void BankManagerCore::handleWebUIMessage(const juce::String& type, const juce::var& data) {
    // Handle messages from WebUI (parameter changes, bank operations, etc.)
    juce::ignoreUnused(type, data);
}

void BankManagerCore::sendToWebUI(const juce::String& event, const juce::var& data) {
    // Send events to WebUI (parameter updates, bank lists, etc.)
    juce::ignoreUnused(event, data);
}

} // namespace ABD::BankManager