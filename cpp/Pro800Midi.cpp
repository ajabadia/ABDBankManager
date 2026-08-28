#include "Pro800Midi.h"

namespace ABD::BankManager {

namespace {
constexpr std::array<uint8_t, 7> header { 0x00, 0x20, 0x32, 0x00, 0x01, 0x24, 0x00 };
constexpr uint8_t responseCommand = 0x78;

juce::MemoryBlock pack8to7(const juce::MemoryBlock& raw) {
    juce::MemoryBlock packed;
    auto* bytes = static_cast<const uint8_t*>(raw.getData());
    for (size_t offset = 0; offset < raw.getSize(); offset += 7) {
        const auto count = juce::jmin<size_t>(7, raw.getSize() - offset);
        uint8_t collector = 0;
        for (size_t i = 0; i < count; ++i)
            if ((bytes[offset + i] & 0x80) != 0) collector |= static_cast<uint8_t>(1u << i);
        packed.append(&collector, 1);
        for (size_t i = 0; i < count; ++i) {
            const auto value = static_cast<uint8_t>(bytes[offset + i] & 0x7f);
            packed.append(&value, 1);
        }
    }
    return packed;
}

} // namespace

juce::MemoryBlock Pro800MidiTransport::buildDumpRequest(int slot) {
    slot = juce::jlimit(0, 399, slot);
    const uint8_t message[] { 0xf0, 0x00, 0x20, 0x32, 0x00, 0x01, 0x24, 0x00, 0x77,
        static_cast<uint8_t>(slot % 128), static_cast<uint8_t>(slot / 128), 0xf7 };
    return { message, sizeof(message) };
}

int Pro800MidiTransport::parseResponse(const juce::MemoryBlock& message, juce::MemoryBlock& rawData) {
    if (message.getSize() < 13) return -1;
    const auto* bytes = static_cast<const uint8_t*>(message.getData());
    if (bytes[0] != 0xf0 || bytes[1] != 0x00 || bytes[2] != 0x20 || bytes[3] != 0x32 ||
        bytes[4] != 0x00 || bytes[5] != 0x01 || bytes[6] != 0x24 || bytes[7] != 0x00 ||
        bytes[8] != responseCommand || bytes[message.getSize() - 1] != 0xf7) return -1;
    rawData.reset();
    for (size_t source = 11; source + 1 < message.getSize();) {
        const auto collector = bytes[source++];
        for (size_t bit = 0; bit < 7 && source + 1 <= message.getSize() - 1; ++bit) {
            auto value = static_cast<uint8_t>(bytes[source++] & 0x7f);
            if (collector & (1u << bit)) value |= 0x80;
            rawData.append(&value, 1);
        }
    }
    return bytes[9] + (bytes[10] << 7);
}

juce::MemoryBlock Pro800MidiTransport::buildPatchDump(const juce::MemoryBlock& rawData, int slot) {
    slot = juce::jlimit(0, 399, slot);
    const auto packed = pack8to7(rawData);
    juce::MemoryBlock message;
    const uint8_t prefix[] { 0xf0, 0x00, 0x20, 0x32, 0x00, 0x01, 0x24, 0x00, 0x78,
        static_cast<uint8_t>(slot % 128), static_cast<uint8_t>(slot / 128) };
    message.append(prefix, sizeof(prefix));
    message.append(packed);
    const uint8_t end = 0xf7;
    message.append(&end, 1);
    return message;
}

} // namespace ABD::BankManager
