#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"

class ABDBankManagerAudioProcessorEditor final : public juce::AudioProcessorEditor,
                                                 private juce::MidiInputCallback
{
public:
    explicit ABDBankManagerAudioProcessorEditor(ABDBankManagerAudioProcessor&);
    ~ABDBankManagerAudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

private:
    void openMidiInput(const juce::MidiDeviceInfo& device);

    // juce::MidiInputCallback — forwards raw incoming bytes to the core pipe.
    void handleIncomingMidiMessage(juce::MidiInput* source,
                                   const juce::MidiMessage& message) override;

    ABDBankManagerAudioProcessor& processorRef;
    ABD::BankManager::BankManagerWebViewAdapter& webViewAdapter;
    juce::WebBrowserComponent webComponent;

    std::unique_ptr<juce::MidiOutput> midiOutput;
    std::unique_ptr<juce::MidiInput> midiInput;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ABDBankManagerAudioProcessorEditor)
};
