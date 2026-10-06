#include "PluginEditor.h"

#include <WebUIAssets.h>
#include <Source/Core/BuildVersion.h>
#include <WebView2Bridge/WebView2ResourceProvider.h>

#include <cstring>
#include <memory>
#include <vector>

namespace
{
constexpr auto nativeEventId = "abdBankManagerMessage";

juce::var stringArrayToVar(const juce::StringArray& values)
{
    juce::Array<juce::var> result;
    for (const auto& value : values)
        result.add(value);
    return juce::var(result);
}

juce::String sanitiseFilename(juce::String value)
{
    return value.replaceCharacters("<>:\"/\\|?*", "_________").replace(" ", "_");
}

bool isAdminStandalone(const juce::AudioProcessor& processor)
{
    if (processor.wrapperType != juce::AudioProcessor::wrapperType_Standalone)
        return false;

    const auto executable = juce::File::getSpecialLocation(juce::File::currentExecutableFile);
    return executable.getSiblingFile("ADMIN.ABD").existsAsFile();
}

juce::String hostModeForProcessor(const juce::AudioProcessor& processor)
{
    return processor.wrapperType == juce::AudioProcessor::wrapperType_Standalone
        ? "standalone"
        : "plugin";
}

juce::String imageExtensionForDataUrl(const juce::String& dataUrl)
{
    const auto header = dataUrl.upToFirstOccurrenceOf(",", false, false).toLowerCase();
    if (header.contains("image/png")) return "png";
    if (header.contains("image/jpeg")) return "jpg";
    return "webp";
}

bool addBankToStaging(const ABD::BankManager::Bank& bank, const juce::File& outputFile)
{
    juce::ZipFile::Builder builder;
    juce::Array<juce::var> patchEntries;

    for (int i = 0; i < bank.patches.size(); ++i)
    {
        const auto& patch = bank.patches.getReference(i);
        const auto patchPath = "patch_" + juce::String(i).paddedLeft('0', 3) + ".bin";
        builder.addEntry(std::make_unique<juce::MemoryInputStream>(patch.rawData, true), 6,
                         patchPath, juce::Time::getCurrentTime());

        auto entry = juce::var(new juce::DynamicObject());
        auto* object = entry.getDynamicObject();
        object->setProperty("index", patch.index);
        object->setProperty("name", patch.name);
        object->setProperty("category", patch.category);
        object->setProperty("author", patch.author);
        object->setProperty("tags", stringArrayToVar(patch.tags));
        object->setProperty("notes", patch.notes);
        object->setProperty("isFavorite", patch.isFavorite);
        object->setProperty("rating", patch.rating);
        object->setProperty("rawDataFile", patchPath);
        object->setProperty("hardwareIds", stringArrayToVar(patch.hardwareIds));
        object->setProperty("parameters", patch.parameters);
        patchEntries.add(entry);
    }

    juce::String imagePath;
    if (bank.imageUrl.startsWith("data:image/"))
    {
        const auto comma = bank.imageUrl.indexOfChar(',');
        juce::MemoryBlock image;
        juce::MemoryOutputStream imageOutput(image, false);
        if (comma > 0 && juce::Base64::convertFromBase64(imageOutput, bank.imageUrl.substring(comma + 1)))
        {
            imageOutput.flush();
            imagePath = "image." + imageExtensionForDataUrl(bank.imageUrl);
            builder.addEntry(std::make_unique<juce::MemoryInputStream>(image, true), 6,
                             imagePath, juce::Time::getCurrentTime());
        }
    }

    auto bankObject = juce::var(new juce::DynamicObject());
    auto* bankJson = bankObject.getDynamicObject();
    bankJson->setProperty("id", bank.id);
    bankJson->setProperty("name", bank.name);
    bankJson->setProperty("modelId", bank.modelId);
    bankJson->setProperty("hardwareIds", stringArrayToVar(bank.hardwareIds));
    bankJson->setProperty("manufacturer", bank.manufacturer);
    bankJson->setProperty("isFactory", bank.isFactory);
    bankJson->setProperty("isLocked", bank.isLocked);
    bankJson->setProperty("includeInBundle", bank.includeInBundle);
    bankJson->setProperty("source", bank.source);
    bankJson->setProperty("description", bank.description);
    bankJson->setProperty("bankAuthor", bank.bankAuthor);
    bankJson->setProperty("license", bank.license);
    bankJson->setProperty("tags", stringArrayToVar(bank.tags));
    bankJson->setProperty("bankNotes", bank.bankNotes);
    bankJson->setProperty("firmwareCompat", bank.firmwareCompat);
    bankJson->setProperty("knownIssues", bank.knownIssues);
    bankJson->setProperty("creationDate", bank.creationDate);
    bankJson->setProperty("modifiedDate", bank.modifiedDate);
    bankJson->setProperty("patchCount", bank.patches.size());
    bankJson->setProperty("imageUrl", imagePath.isNotEmpty() ? juce::var(imagePath) : juce::var());

    auto manifest = juce::var(new juce::DynamicObject());
    auto* manifestJson = manifest.getDynamicObject();
    manifestJson->setProperty("version", 2);
    manifestJson->setProperty("format", "abdbank");
    manifestJson->setProperty("bank", bankObject);
    manifestJson->setProperty("patches", juce::var(patchEntries));
    manifestJson->setProperty("bundleEligible", bank.includeInBundle);

    const auto manifestText = juce::JSON::toString(manifest, true);
    juce::MemoryBlock manifestData(manifestText.toRawUTF8(), manifestText.getNumBytesAsUTF8());
    builder.addEntry(std::make_unique<juce::MemoryInputStream>(manifestData, true), 6,
                     "manifest.json", juce::Time::getCurrentTime());

    auto output = outputFile.createOutputStream();
    return output != nullptr && builder.writeToStream(*output, nullptr);
}

juce::File getFactoryContentStagingDirectory()
{
#if defined(ABD_FACTORY_CONTENT_STAGING_DIR)
    return juce::File(ABD_FACTORY_CONTENT_STAGING_DIR);
#else
    return juce::File::getSpecialLocation(juce::File::currentExecutableFile)
        .getSiblingFile("factory-content-staging");
#endif
}

juce::var exportFactoryContent(const ABD::BankManager::BankManagerCore& core, const juce::var& data)
{
    auto result = juce::var(new juce::DynamicObject());
    auto* resultObject = result.getDynamicObject();

    const auto bankId = data.hasProperty("bankId") ? data["bankId"].toString() : juce::String();
    for (const auto& bank : core.getLibrary().banks)
    {
        if (bank.id != bankId)
            continue;

        if (!bank.includeInBundle)
        {
            resultObject->setProperty("success", false);
            resultObject->setProperty("error", "El banco no está marcado para incluir en el bundle");
            return result;
        }

        const auto staging = getFactoryContentStagingDirectory();
        if (staging.createDirectory().failed())
        {
            resultObject->setProperty("success", false);
            resultObject->setProperty("error", "No se pudo crear factory-content-staging");
            return result;
        }

        const auto outputFile = staging.getChildFile(sanitiseFilename(bank.id) + ".abdbank");
        if (!addBankToStaging(bank, outputFile))
        {
            resultObject->setProperty("success", false);
            resultObject->setProperty("error", "No se pudo escribir el banco en staging");
            return result;
        }

        resultObject->setProperty("success", true);
        resultObject->setProperty("path", outputFile.getFullPathName());
        return result;
    }

    resultObject->setProperty("success", false);
    resultObject->setProperty("error", "Banco no encontrado");
    return result;
}

/**
 * Catalogo de assets embebidos (WebUIAssets generado por juce_add_binary_data)
 * en el formato que espera `abd::webview2::webView2ResourceProvider`.
 */
abd::webview2::BinaryAssetsCatalog webUiAssetsCatalog()
{
    return {
        WebUIAssets::namedResourceListSize,
        WebUIAssets::namedResourceList,
        WebUIAssets::originalFilenames,
        WebUIAssets::getNamedResource
    };
}

/**
 * Prefijos que pueden resolverse desde el filesystem de ABDSharedAssets cuando
 * el catalogo embebido no tiene el fichero (el fallback que el proveedor
 * compartido ofrece y el provider artesanal de antes no).
 */
const std::vector<juce::String>& sharedAssetPrefixes()
{
    static const std::vector<juce::String> prefixes {
        "styles/", "icons/", "models/", "brands/", "assets/"
    };
    return prefixes;
}
}

ABDBankManagerAudioProcessorEditor::ABDBankManagerAudioProcessorEditor(ABDBankManagerAudioProcessor& processor)
    : AudioProcessorEditor(&processor),
      processorRef(processor),
      webViewAdapter(processor.getWebViewAdapter()),
      webComponent(juce::WebBrowserComponent::Options{}
          .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
          .withKeepPageLoadedWhenBrowserIsHidden()
          .withNativeIntegrationEnabled()
          .withEventListener(nativeEventId, [this](juce::var message)
          {
              webViewAdapter.handleWebViewMessage(message);
          })
          .withResourceProvider([](const juce::String& url)
          {
              return abd::webview2::webView2ResourceProvider(
                  url, webUiAssetsCatalog(), sharedAssetPrefixes());
          }))
{
    webViewAdapter.setFactoryContentExportCallback([this](const juce::var& data)
    {
        if (!isAdminStandalone(processorRef))
        {
            auto result = juce::var(new juce::DynamicObject());
            result.getDynamicObject()->setProperty("success", false);
            result.getDynamicObject()->setProperty("error", "La exportación de contenido solo está disponible en modo administrador");
            return result;
        }
        return exportFactoryContent(processorRef.getBankManagerCore(), data);
    });

    webViewAdapter.setPostMessageCallback([this](const juce::String& json)
    {
        auto message = juce::JSON::parse(json);
        webComponent.emitEventIfBrowserIsVisible(nativeEventId, message);
    });

    // ─── Hardware MIDI transport (host-owned, injected into the core pipe) ───
    auto& midiPipe = processorRef.getBankManagerCore().getHardwareMidiPipe();

    midiPipe.setSendFunction([this](const juce::MemoryBlock& message)
    {
        if (midiOutput == nullptr)
            return false;

        midiOutput->sendMessageNow(juce::MidiMessage(message.getData(),
                                                     static_cast<int>(message.getSize())));
        return true;
    });

    // Array<MidiDeviceInfo>::getFirst() devuelve una COPIA por valor (no un puntero),
    // asi que hay que materializar la lista para consultarla y comprobar que no este vacia.
    const auto midiInputs = juce::MidiInput::getAvailableDevices();
    if (! midiInputs.isEmpty())
        openMidiInput(midiInputs.getFirst());

    const auto midiOutputs = juce::MidiOutput::getAvailableDevices();
    if (! midiOutputs.isEmpty())
        midiOutput = juce::MidiOutput::openDevice(midiOutputs.getFirst().identifier);

    addAndMakeVisible(webComponent);

    auto webUiUrl = juce::WebBrowserComponent::getResourceProviderRoot();
    webUiUrl += "?hostMode=" + hostModeForProcessor(processorRef)
        + "&hardwareMode=none&build=" + juce::String(ABD::BankManager::kBuildNumber);
    if (isAdminStandalone(processorRef))
        webUiUrl += "&admin=1";
    webComponent.goToURL(webUiUrl);
    setSize(1100, 760);
}

ABDBankManagerAudioProcessorEditor::~ABDBankManagerAudioProcessorEditor()
{
    if (midiInput != nullptr)
        midiInput->stop();
    midiInput.reset();
    midiOutput.reset();

    processorRef.getBankManagerCore().getHardwareMidiPipe().setSendFunction({});

    webViewAdapter.setPostMessageCallback({});
    webViewAdapter.setFactoryContentExportCallback({});
}

void ABDBankManagerAudioProcessorEditor::openMidiInput(const juce::MidiDeviceInfo& device)
{
    if (midiInput != nullptr)
        midiInput->stop();
    midiInput.reset();

    midiInput = juce::MidiInput::openDevice(device.identifier, this);
    if (midiInput != nullptr)
        midiInput->start();
}

void ABDBankManagerAudioProcessorEditor::handleIncomingMidiMessage(
    juce::MidiInput* /*source*/, const juce::MidiMessage& message)
{
    if (! message.isSysEx())
        return;

    const auto& raw = message.getSysExData();
    const auto size = static_cast<int>(message.getSysExDataSize());
    if (raw == nullptr || size <= 0)
        return;

    juce::MemoryBlock block(raw, static_cast<std::size_t>(size));
    processorRef.getBankManagerCore().getHardwareMidiPipe().receiveFromHardware(block);
}

void ABDBankManagerAudioProcessorEditor::paint(juce::Graphics& graphics)
{
    graphics.fillAll(juce::Colours::black);
}

void ABDBankManagerAudioProcessorEditor::resized()
{
    webComponent.setBounds(getLocalBounds());
}
