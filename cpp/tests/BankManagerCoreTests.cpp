#include "../ABDBankManagerCore.h"
#include "../BankManagerWebViewAdapter.h"
#include "../FactoryContentLoader.h"

#include <cassert>
#include <memory>
#include <iostream>

using namespace ABD::BankManager;

namespace {

Patch makePatch()
{
    Patch patch;
    patch.id = "patch-1";
    patch.index = 3;
    patch.name = "Init Pad";
    patch.category = "Pad";
    patch.author = "Factory";
    patch.tags.addArray({ "init", "pad" });
    patch.notes = "Bridge roundtrip";
    patch.originAddress = "A004";
    patch.originModel = "behringer-pro800";
    patch.originBank = "Factory";
    patch.rawData.append("\x00\x01\x7f\xff", 4);
    patch.hardwareIds.add("behringer-pro800");
    patch.parameters = juce::var(new juce::DynamicObject());
    patch.isFavorite = true;
    patch.rating = 4;
    patch.versionNumber = 2;
    patch.previousVersionId = "patch-0";
    patch.fingerprint = "sha256-test";
    patch.creationDate = "2026-08-31T00:00:00Z";
    patch.modifiedDate = "2026-08-31T01:00:00Z";
    patch.importSource = "fixture.syx";
    patch.importDate = "2026-08-31T00:00:00Z";
    return patch;
}

Library makeLibrary()
{
    Library library;
    library.version = 4;
    library.activeBankId = "bank-1";
    library.activePresetIndex = 3;
    library.lastImportPath = "imports/fixture.syx";
    library.lastExportPath = "exports/library.abdlibrary";

    Bank bank;
    bank.id = "bank-1";
    bank.name = "Factory Bank";
    bank.modelId = "behringer-pro800";
    bank.hardwareIds.add("behringer-pro800");
    bank.manufacturer = "Behringer";
    bank.isFactory = true;
    bank.isLocked = true;
    bank.source = "fixture.syx";
    bank.imageUrl = "images/pro800.webp";
    bank.description = "Complete bank";
    bank.bankAuthor = "Factory";
    bank.license = "Test";
    bank.tags.add("factory");
    bank.bankNotes = "Read-only";
    bank.firmwareCompat = "1.4.4";
    bank.knownIssues = "None";
    bank.creationDate = "2026-08-31T00:00:00Z";
    bank.modifiedDate = "2026-08-31T01:00:00Z";
    bank.patches.add(makePatch());
    library.banks.add(std::move(bank));
    return library;
}

void testValueTreeRoundtrip()
{
    BankManagerCore original;
    original.setLibrary(makeLibrary());
    original.selectPreset(0, 0);

    const auto valueTree = original.toValueTree();
    assert(valueTree.hasType("ABDBankManager"));
    assert(static_cast<int>(valueTree.getProperty("schemaVersion")) == BankManagerCore::valueTreeSchemaVersion);

    const auto libraryNode = valueTree.getChildWithName("Library");
    assert(libraryNode.isValid());
    assert(libraryNode.getNumChildren() == 1);
    const auto bankNode = libraryNode.getChildWithName("Bank");
    assert(bankNode.isValid());
    assert(bankNode.getChildWithName("Patch").isValid());

    BankManagerCore restored;
    restored.fromValueTree(valueTree);
    const auto& library = restored.getLibrary();
    assert(library.version == 4);
    assert(library.banks.size() == 1);
    assert(library.banks.getReference(0).name == "Factory Bank");
    assert(library.banks.getReference(0).patches.size() == 1);

    const auto& patch = library.banks.getReference(0).patches.getReference(0);
    assert(patch.id == "patch-1");
    assert(patch.rawData.getSize() == 4);
    assert(static_cast<const char*>(patch.rawData.getData())[0] == 0x00);
    assert(static_cast<const char*>(patch.rawData.getData())[3] == static_cast<char>(0xff));
    assert(patch.tags.size() == 2);
    assert(patch.isFavorite);
    assert(patch.rating == 4);
}

juce::MemoryBlock makeFactoryBankZip()
{
    juce::ZipFile::Builder builder;
    const juce::MemoryBlock patchData { "\\x01\\x02\\x7f", 3 };
    const juce::MemoryBlock imageData { "PNG-test", 8 };

    const juce::String manifest = R"json({
        "version": 2,
        "format": "abdbank",
        "bank": {
            "id": "factory-bank-1",
            "name": "Embedded Factory",
            "modelId": "behringer-pro800",
            "hardwareIds": ["behringer-pro800"],
            "manufacturer": "Behringer",
            "source": "test-fixture",
            "description": "Embedded content test",
            "bankAuthor": "ABD",
            "license": "Test",
            "imageUrl": "image.png"
        },
        "patches": [{
            "id": "factory-patch-1",
            "index": 0,
            "name": "Factory Init",
            "category": "Init",
            "author": "ABD",
            "rawDataFile": "patch_000.bin"
        }]
    })json";

    builder.addEntry(new juce::MemoryInputStream(patchData, true), 6, "patch_000.bin", juce::Time::getCurrentTime());
    builder.addEntry(new juce::MemoryInputStream(imageData, true), 6, "image.png", juce::Time::getCurrentTime());
    const juce::MemoryBlock manifestData { manifest.toRawUTF8(), manifest.getNumBytesAsUTF8() };
    builder.addEntry(new juce::MemoryInputStream(manifestData, true), 6, "manifest.json", juce::Time::getCurrentTime());

    juce::MemoryOutputStream output;
    assert(builder.writeToStream(output, nullptr));
    return output.getMemoryBlock();
}

void testFactoryContentLoader()
{
    const auto zip = makeFactoryBankZip();
    Bank loaded;
    const auto result = FactoryContentLoader::loadBankFromZip(zip.getData(), zip.getSize(), loaded);

    assert(result.wasOk());
    assert(loaded.id == "factory-bank-1");
    assert(loaded.name == "Embedded Factory");
    assert(loaded.isFactory);
    assert(loaded.isLocked);
    assert(loaded.includeInBundle);
    assert(loaded.patches.size() == 1);
    assert(loaded.patches.getReference(0).name == "Factory Init");
    assert(loaded.patches.getReference(0).rawData.getSize() == 3);
    assert(static_cast<const unsigned char*>(loaded.patches.getReference(0).rawData.getData())[2] == 0x7f);
    assert(loaded.imageUrl.startsWith("data:image/png;base64,"));

    Bank invalid;
    assert(FactoryContentLoader::loadBankFromZip(nullptr, 0, invalid).failed());
}

void testWebViewAdapter()
{
    BankManagerCore core;
    core.setLibrary(makeLibrary());

    BankManagerWebViewAdapter adapter(core);
    juce::String lastJson;
    adapter.setPostMessageCallback([&](const juce::String& json)
    {
        lastJson = json;
    });

    adapter.handleWebViewMessage(juce::String("{\"action\":\"getState\"}"));
    auto response = juce::JSON::parse(lastJson);
    assert(response.isObject());
    assert(response["action"] == "state");
    assert(static_cast<int>(response["schemaVersion"]) == BankManagerCore::valueTreeSchemaVersion);
    assert(response["data"].getDynamicObject() != nullptr);
    assert(response["data"]["banks"].getArray()->size() == 1);

    auto selectMessage = juce::var(new juce::DynamicObject());
    selectMessage.getDynamicObject()->setProperty("action", "selectPreset");
    auto selectData = juce::var(new juce::DynamicObject());
    selectData.getDynamicObject()->setProperty("bankId", "bank-1");
    selectData.getDynamicObject()->setProperty("patchId", "patch-1");
    selectMessage.getDynamicObject()->setProperty("data", selectData);
    adapter.handleWebViewMessage(juce::JSON::toString(selectMessage, true));
    response = juce::JSON::parse(lastJson);
    assert(response["action"] == "presetSelected");
    assert(core.getCurrentBankIndex() == 0);
    assert(core.getCurrentPatchIndex() == 0);

    adapter.handleWebViewMessage(juce::String("not-json"));
    response = juce::JSON::parse(lastJson);
    assert(response["action"] == "error");
    assert(response["data"]["message"].toString().contains("Invalid WebView JSON"));
}

void testWebUIIpc()
{
    BankManagerCore core;
    core.setLibrary(makeLibrary());

    juce::String lastEvent;
    juce::var lastData;
    core.setWebUIMessageHandler([&](const juce::String& event, const juce::var& data)
    {
        lastEvent = event;
        lastData = data;
    });

    core.handleWebUIMessage("getState", {});
    assert(lastEvent == "state");
    assert(static_cast<int>(lastData.getProperty("schemaVersion", 0)) == BankManagerCore::valueTreeSchemaVersion);
    const auto banks = lastData.getProperty("banks", juce::var());
    assert(banks.getArray() != nullptr);
    assert(banks.getArray()->size() == 1);

    core.handleWebUIMessage("setState", lastData);
    assert(lastEvent == "state");
    assert(core.getLibrary().banks.size() == 1);
    assert(core.getLibrary().banks.getReference(0).patches.size() == 1);

    auto selectData = juce::var(new juce::DynamicObject());
    selectData.getDynamicObject()->setProperty("bankId", "bank-1");
    selectData.getDynamicObject()->setProperty("patchId", "patch-1");
    core.handleWebUIMessage("selectPreset", selectData);
    assert(lastEvent == "presetSelected");
    assert(core.getCurrentBankIndex() == 0);
    assert(core.getCurrentPatchIndex() == 0);

    auto patchMetadata = juce::var(new juce::DynamicObject());
    patchMetadata.getDynamicObject()->setProperty("patchId", "patch-1");
    patchMetadata.getDynamicObject()->setProperty("name", "Edited Pad");
    patchMetadata.getDynamicObject()->setProperty("rating", 5);
    auto updateData = juce::var(new juce::DynamicObject());
    updateData.getDynamicObject()->setProperty("bankId", "bank-1");
    updateData.getDynamicObject()->setProperty("patch", patchMetadata);
    core.handleWebUIMessage("updateMetadata", updateData);
    assert(lastEvent == "state");
    assert(core.getLibrary().banks.getReference(0).patches.getReference(0).name == "Edited Pad");
    assert(core.getLibrary().banks.getReference(0).patches.getReference(0).rating == 5);

    core.handleWebUIMessage("unknown", {});
    assert(lastEvent == "error");
}

} // namespace

int main()
{
    testValueTreeRoundtrip();
    testFactoryContentLoader();
    testWebUIIpc();
    testWebViewAdapter();
    std::cout << "ABDBankManagerCoreTests: all tests passed\n";
    return 0;
}
