#include "PluginProcessor.h"
#include "PluginEditor.h"
#include <BankManager/FactoryContentLoader.h>

#include <array>
#include <cstdint>

namespace
{
ABD::BankManager::Patch makeReferencePatch(const char* modelId, int index, int rawDataSize)
{
    ABD::BankManager::Patch patch;
    patch.id = juce::String("bridge-patch-") + modelId;
    patch.index = index;
    patch.name = "Bridge smoke test";
    patch.category = "Other";
    patch.author = "ABD Bank Manager";
    patch.notes = "Synthetic patch used to verify the JUCE/WebView bridge.";
    patch.originAddress = "Bridge-001";
    patch.originModel = modelId;
    patch.originBank = "Bridge smoke test";
    patch.hardwareIds.add(modelId);
    patch.creationDate = "2026-08-31T00:00:00Z";
    patch.modifiedDate = patch.creationDate;

    patch.rawData.setSize(static_cast<size_t>(rawDataSize), true);
    auto* bytes = static_cast<std::uint8_t*>(patch.rawData.getData());
    for (int i = 0; i < rawDataSize; ++i)
        bytes[i] = static_cast<std::uint8_t>((i * 17 + index) & 0x7f);

    return patch;
}

ABD::BankManager::Bank makeReferenceBank(const char* modelId, int rawDataSize)
{
    ABD::BankManager::Bank bank;
    bank.id = juce::String("bridge-bank-") + modelId;
    bank.name = "Bridge smoke test";
    bank.modelId = modelId;
    bank.hardwareIds.add(modelId);
    bank.manufacturer = "ABDSynths";
    bank.isFactory = false;
    bank.isLocked = false;
    bank.source = "JUCE reference host";
    bank.description = "Synthetic editable data for validating WebView IPC and DAW state.";
    bank.creationDate = "2026-08-31T00:00:00Z";
    bank.modifiedDate = bank.creationDate;
    bank.patches.add(makeReferencePatch(modelId, 0, rawDataSize));
    return bank;
}

ABD::BankManager::Library makeReferenceLibrary()
{
    ABD::BankManager::Library library;
    library.version = 1;
    library.activeBankId = "bridge-bank-behringer-pro800";

    constexpr std::array<std::pair<const char*, int>, 17> models {{
        { "casio-cz101", 128 },
        { "casio-cz1000", 128 },
        { "casio-cz5000", 128 },
        { "casio-cz1", 128 },
        { "roland-juno106", 18 },
        { "roland-juno60", 18 },
        { "roland-juno6", 18 },
        { "roland-hs60", 18 },
        { "korg-ms2000", 128 },
        { "korg-microkorg", 128 },
        { "korg-prophecy", 256 },
        { "behringer-deepmind12", 242 },
        { "behringer-deepmind6", 242 },
        { "behringer-deepmind12d", 242 },
        { "behringer-pro800", 173 },
        { "yamaha-dx7", 128 },
        { "yamaha-dx7ii", 155 }
    }};

    for (const auto& [modelId, rawDataSize] : models)
        library.banks.add(makeReferenceBank(modelId, rawDataSize));

    return library;
}
}

ABDBankManagerAudioProcessor::ABDBankManagerAudioProcessor()
    : AudioProcessor(BusesProperties()
        .withInput("Input", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      webViewAdapter(core)
{
    const auto factoryContent = ABD::BankManager::FactoryContentLoader::loadEmbedded();
    if (factoryContent.loaded > 0)
    {
        // Factory content is the product library. Invalid entries are skipped
        // by the loader; a valid entry must never be replaced by smoke data.
        core.setLibrary(factoryContent.library);
    }
    else
    {
        // Keep the reference host useful when no factory bundle has been
        // configured yet (normal development checkout).
        core.setLibrary(makeReferenceLibrary());
    }
}

void ABDBankManagerAudioProcessor::prepareToPlay(double, int)
{
}

void ABDBankManagerAudioProcessor::releaseResources()
{
}

bool ABDBankManagerAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    const auto output = layouts.getMainOutputChannelSet();
    if (output != juce::AudioChannelSet::mono() && output != juce::AudioChannelSet::stereo())
        return false;

    return layouts.getMainInputChannelSet() == output;
}

void ABDBankManagerAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                                juce::MidiBuffer& midiMessages)
{
    juce::ignoreUnused(midiMessages);
    juce::ScopedNoDenormals noDenormals;

    for (auto channel = getTotalNumInputChannels(); channel < getTotalNumOutputChannels(); ++channel)
        buffer.clear(channel, 0, buffer.getNumSamples());
}

juce::AudioProcessorEditor* ABDBankManagerAudioProcessor::createEditor()
{
    return new ABDBankManagerAudioProcessorEditor(*this);
}

void ABDBankManagerAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    const auto state = core.toValueTree();
    juce::MemoryOutputStream output(destData, false);
    state.writeToStream(output);
}

void ABDBankManagerAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (data == nullptr || sizeInBytes <= 0)
        return;

    const auto state = juce::ValueTree::readFromData(data, static_cast<size_t>(sizeInBytes));
    if (state.isValid())
    {
        core.fromValueTree(state);
        // Emit the restored library, not an empty payload. The editor may be
        // created after state restoration, so the WebUI requests this again
        // through the normal bridge handshake, but this keeps existing editors
        // in sync as well.
        core.handleWebUIMessage("getState", juce::var());
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ABDBankManagerAudioProcessor();
}
