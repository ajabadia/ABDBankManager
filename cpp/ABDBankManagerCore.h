/**
 * ABD Bank Manager — C++ Core Module
 * Provides bank management functionality for JUCE plugins
 */

#pragma once

#include <juce_core/juce_core.h>
#include <juce_data_structures/juce_data_structures.h>

namespace ABD::BankManager {

class BankManagerCore {
public:
    BankManagerCore() = default;
    ~BankManagerCore() = default;

    // --- State Persistence (DAW session) ---
    juce::ValueTree toValueTree() const;
    void fromValueTree(const juce::ValueTree& vt);

    // --- Preset Management ---
    void selectPreset(int bankIndex, int patchIndex);
    int getCurrentBankIndex() const { return currentBankIndex; }
    int getCurrentPatchIndex() const { return currentPatchIndex; }

    // --- WebUI Bridge ---
    void handleWebUIMessage(const juce::String& type, const juce::var& data);
    void sendToWebUI(const juce::String& event, const juce::var& data);

private:
    int currentBankIndex = 0;
    int currentPatchIndex = 0;
};

} // namespace ABD::BankManager