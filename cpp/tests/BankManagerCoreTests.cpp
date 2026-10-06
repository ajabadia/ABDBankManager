#include <BankManager/ABDBankManagerCore.h>
#include <BankManager/BankManagerWebViewAdapter.h>
#include <BankManager/FactoryContentLoader.h>
#include <BankManager/Pro800Midi.h>

#include <HardwareDrivers/CasioNibbleCodec.h>
#include <HardwareDrivers/SysExCodec.h>
#include <WebView2Bridge/WebView2ResourceProvider.h>

#include <cassert>
#include <cstring>
#include <memory>
#include <iostream>
#include <string>
#include <vector>

// CHECK propio en vez de assert: este binario se compila en Release, donde
// NDEBUG vacia los assert — un test que no comprueba nada no es un test.
#define CHECK(cond)                                                                \
    do                                                                             \
    {                                                                              \
        if (! (cond))                                                              \
        {                                                                          \
            std::cerr << "FAILED: " #cond " (" << __FILE__ << ':' << __LINE__     \
                      << ")\n";                                                    \
            std::abort();                                                          \
        }                                                                          \
    } while (false)

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

// ─── Codecs compartidos (ABDSharedCode/HardwareDrivers) ───
// Los vectores de abajo son los mismos que fija el lado TS
// (Source/Contracts/SysEx/codec.ts y sus tests de vitest): si los dos lados
// dejan de decodificar los mismos bytes, uno de los dos miente.

void testSharedSysExCodecOrders()
{
    using abd::hw::SysExCodec;

    // Orden canonico (bit i = MSB del byte i — Pro-800) vs orden Korg
    // (bit 6-j — dumps reales MS2000/microKORG). Los dos vectores salen de
    // la misma entrada: si alguien "unifica" los ordenes, aqui revienta.
    const uint8_t raw[] = { 0x81, 0x82, 0x03, 0x04, 0x05, 0x06, 0x07, 0x88 };
    const std::vector<uint8_t> canonicalExpected {
        0x03, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x01, 0x08 };
    const std::vector<uint8_t> korgExpected {
        0x60, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x40, 0x08 };
    const std::vector<uint8_t> rawVec (std::begin(raw), std::end(raw));

    std::vector<uint8_t> packed;
    CHECK(SysExCodec::pack8to7(raw, sizeof(raw), packed));
    CHECK(packed == canonicalExpected);

    std::vector<uint8_t> korgPacked;
    CHECK(SysExCodec::pack8to7Korg(raw, sizeof(raw), korgPacked));
    CHECK(korgPacked == korgExpected);

    // Roundtrips de los dos ordenes, sin relleno.
    std::vector<uint8_t> decoded;
    CHECK(SysExCodec::unpack7to8(packed.data(), packed.size(), decoded));
    CHECK(decoded == rawVec);
    decoded.clear();
    CHECK(SysExCodec::unpack7to8Korg(korgPacked.data(), korgPacked.size(), decoded));
    CHECK(decoded == rawVec);

    // Decodificar un payload Korg con el orden canonico NO devuelve lo
    // mismo: es la prueba de que los dos ordenes no son intercambiables.
    decoded.clear();
    CHECK(SysExCodec::unpack7to8(korgPacked.data(), korgPacked.size(), decoded));
    CHECK(decoded != rawVec);

    // Politica de relleno: el grupo parcial se completa a 7 y la longitud
    // de salida siempre es multiplo de 8.
    std::vector<uint8_t> padded;
    CHECK(SysExCodec::pack8to7Padded(raw, sizeof(raw), padded));
    CHECK(padded.size() == 16 && padded.size() % 8 == 0);
    std::vector<uint8_t> korgPadded;
    CHECK(SysExCodec::pack8to7KorgPadded(raw, sizeof(raw), korgPadded));
    CHECK(korgPadded.size() == 16 && korgPadded.size() % 8 == 0);

    // El unpack tolerante descodifica el frame rellenado: salen los 8 bytes
    // originales mas la cola de ceros del relleno.
    decoded.clear();
    CHECK(SysExCodec::unpack7to8Korg(korgPadded.data(), korgPadded.size(), decoded));
    CHECK(decoded.size() == 14);
    CHECK(std::equal(decoded.begin(), decoded.begin() + 8, rawVec.begin()));

    // Cable real MS2000: 254 bytes de programa -> 291 payload sin relleno
    // (36 grupos completos + 1 collector + 2 datos), 296 rellenos. Es la
    // longitud que documenta DOCS/ABDSYNTHS_SYSEX_GUIDE.md.
    std::vector<uint8_t> program (254);
    for (size_t i = 0; i < program.size(); ++i)
        program[i] = static_cast<uint8_t>(i & 0x7F);

    std::vector<uint8_t> wire;
    CHECK(SysExCodec::pack8to7Korg(program.data(), program.size(), wire));
    CHECK(wire.size() == 291);
    std::vector<uint8_t> wirePadded;
    CHECK(SysExCodec::pack8to7KorgPadded(program.data(), program.size(), wirePadded));
    CHECK(wirePadded.size() == 296);

    decoded.clear();
    CHECK(SysExCodec::unpack7to8Korg(wire.data(), wire.size(), decoded));
    CHECK(decoded == program);
}

void testSharedCasioNibbleParity()
{
    using abd::hw::CasioNibbleCodec;
    using abd::hw::NibbleOrder;

    // encodeNibble de codec.ts: high-first, un nibble por byte.
    const uint8_t raw[] = { 0x00, 0x12, 0xAB, 0xFF, 0x7F };
    const std::vector<uint8_t> expected {
        0x00, 0x00, 0x01, 0x02, 0x0A, 0x0B, 0x0F, 0x0F, 0x07, 0x0F };

    std::vector<uint8_t> nibbles;
    CHECK(CasioNibbleCodec::encode(raw, sizeof(raw), nibbles, NibbleOrder::HighFirst));
    CHECK(nibbles == expected);

    std::vector<uint8_t> back;
    CHECK(CasioNibbleCodec::decode(nibbles.data(), nibbles.size(), back, NibbleOrder::HighFirst));
    CHECK(back == std::vector<uint8_t> (std::begin(raw), std::end(raw)));

    // casioChecksum() de codec.ts: suma & 0x7F. 0x81+0x7E+0x02 = 257 -> 1.
    const uint8_t sumBytes[] = { 0x81, 0x7E, 0x02 };
    CHECK(CasioNibbleCodec::calculateChecksum(sumBytes, sizeof(sumBytes)) == 0x01);
    CHECK(CasioNibbleCodec::verifyChecksum(sumBytes, sizeof(sumBytes), 0x01));
    CHECK(! CasioNibbleCodec::verifyChecksum(sumBytes, sizeof(sumBytes), 0x02));
}

void testPro800MidiUsesSharedCodec()
{
    // El frame que construye el transporte tiene que ser byte a byte el que
    // producia el pack local antes de la migracion (orden canonico, sin
    // relleno): cadena esperada escrita a mano, no regenerada por el codec.
    juce::MemoryBlock raw;
    const uint8_t rawBytes[] = { 0x81, 0x82, 0x03, 0x04, 0x05, 0x06, 0x07, 0x88 };
    raw.append(rawBytes, sizeof(rawBytes));

    const auto frame = Pro800MidiTransport::buildPatchDump(raw, 130);
    const uint8_t expected[] = {
        0xf0, 0x00, 0x20, 0x32, 0x00, 0x01, 0x24, 0x00, 0x78,
        0x02, 0x01,                          // slot 130 = 2 + (1 << 7)
        0x03, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x01, 0x08,
        0xf7 };
    CHECK(frame.getSize() == sizeof(expected));
    CHECK(std::memcmp(frame.getData(), expected, sizeof(expected)) == 0);

    // Y el parseo devuelve el slot y los bytes originales.
    juce::MemoryBlock parsed;
    CHECK(Pro800MidiTransport::parseResponse(frame, parsed) == 130);
    CHECK(parsed == raw);
}

// ─── Proveedor de recursos WebView compartido ───

void testSharedWebViewResourceProvider()
{
    namespace wv = abd::webview2;

    // Normalizacion: raiz, query/fragmento, esquema+host y URL-encoding.
    CHECK(wv::normalizeResourcePath("/") == "index.html");
    CHECK(wv::normalizeResourcePath("") == "index.html");
    CHECK(wv::normalizeResourcePath("/app.js?v=2#frag") == "app.js");
    CHECK(wv::normalizeResourcePath("juce://backend/dir/page.html") == "dir/page.html");
    CHECK(wv::normalizeResourcePath("/my%20file.html") == "my file.html");

    // MIME compartido: .js pasa a application/javascript (el estandar).
    CHECK(wv::getMimeTypeForFilename("a.html") == "text/html");
    CHECK(wv::getMimeTypeForFilename("a.js") == "application/javascript");
    CHECK(wv::getMimeTypeForFilename("a.webp") == "image/webp");

    // Catalogo falso con la forma del WebUIAssets que genera JUCE: el
    // identificador aplana sin guiones (behringer-deepmind12.webp ->
    // behringerdeepmind12_webp), por eso el paso 1 (originalFilenames) es el
    // que salva a los ficheros con guion.
    const char* names[] = { "index_html", "behringerdeepmind12_webp", "style_css" };
    const char* files[] = { "index.html", "behringer-deepmind12.webp", "main.css" };
    auto lookup = [](const char* key, int& size) -> const char*
    {
        if (std::strcmp(key, "index_html") == 0)              { size = 5;  return "INDEX"; }
        if (std::strcmp(key, "behringerdeepmind12_webp") == 0) { size = 4;  return "IMG!"; }
        if (std::strcmp(key, "style_css") == 0)                { size = 3;  return "CSS"; }
        size = 0;
        return nullptr;
    };
    const wv::BinaryAssetsCatalog catalog { 3, names, files, lookup };

    // Paso 1: fichero con guion via originalFilenames (ignore case).
    auto img = wv::resolveEmbeddedAsset("img/behringer-deepmind12.webp", catalog);
    CHECK(img.has_value());
    CHECK(img->mimeType == "image/webp");
    CHECK(img->data.size() == 4);

    // Paso 2: aplanado estilo JUCE cuando el nombre original no coincide.
    auto css = wv::resolveEmbeddedAsset("style.css", catalog);
    CHECK(css.has_value());
    CHECK(css->mimeType == "text/css");
    CHECK(css->data.size() == 3);

    // juce.js lo sirve el propio JUCE; lo desconocido, nadie.
    CHECK(! wv::resolveEmbeddedAsset("juce.js", catalog).has_value());
    CHECK(! wv::resolveEmbeddedAsset("nope.png", catalog).has_value());

    // Provider completo: la raiz cae en index.html embebido; un prefijo
    // fuera de la allowlist no tiene fallback al filesystem.
    auto root = wv::webView2ResourceProvider("/?v=1", catalog, {});
    CHECK(root.has_value());
    CHECK(root->mimeType == "text/html");
    CHECK(! wv::webView2ResourceProvider("/styles/tokens.css", catalog, {}).has_value());
    // Prefijo permitido pero fichero inexistente: tambien nullopt (no
    // depende de si ABDSharedAssets esta clonado al lado).
    CHECK(! wv::webView2ResourceProvider(
        "/styles/zz-missing-9f3a-not-a-real-file.css", catalog,
        { "styles/" }).has_value());
}

} // namespace

int main()
{
    testValueTreeRoundtrip();
    testFactoryContentLoader();
    testWebUIIpc();
    testWebViewAdapter();
    testSharedSysExCodecOrders();
    testSharedCasioNibbleParity();
    testPro800MidiUsesSharedCodec();
    testSharedWebViewResourceProvider();
    std::cout << "ABDBankManagerCoreTests: all tests passed\n";
    return 0;
}
