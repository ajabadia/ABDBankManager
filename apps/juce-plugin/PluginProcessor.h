#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <BankManager/ABDBankManagerCore.h>
#include <BankManager/BankManagerWebViewAdapter.h>

class ABDBankManagerAudioProcessor final : public juce::AudioProcessor
{
public:
    ABDBankManagerAudioProcessor();
    ~ABDBankManagerAudioProcessor() override = default;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "ABD Bank Manager Plugin"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    ABD::BankManager::BankManagerCore& getBankManagerCore() noexcept { return core; }
    ABD::BankManager::BankManagerWebViewAdapter& getWebViewAdapter() noexcept { return webViewAdapter; }

private:
    ABD::BankManager::BankManagerCore core;
    ABD::BankManager::BankManagerWebViewAdapter webViewAdapter;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ABDBankManagerAudioProcessor)
};
