cmake_minimum_required(VERSION 3.22)
project(ABDBankManagerCore VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --- ABDBankManagerCore Library ---
add_library(ABDBankManagerCore STATIC
    ABDBankManagerCore.cpp
    BankManagerWebViewAdapter.cpp
    Pro800Midi.cpp
)

target_include_directories(ABDBankManagerCore PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_BINARY_DIR}
    ${PROJECT_SOURCE_DIR}/Source
)

target_link_libraries(ABDBankManagerCore PUBLIC
    juce_core
    juce_data_structures
    juce_cryptography
    juce_audio_devices
)

# --- Version & Registry Generation Dependencies ---
if(TARGET GenerateAll)
    add_dependencies(ABDBankManagerCore GenerateAll)
endif()

# Installation of this internal static target is intentionally omitted; the
# project links it directly into the JUCE plugin and test targets.

if(BUILD_TESTING)
    add_executable(ABDBankManagerCoreTests
        tests/BankManagerCoreTests.cpp
    )
    target_link_libraries(ABDBankManagerCoreTests PRIVATE ABDBankManagerCore)
    add_test(NAME ABDBankManagerCoreTests COMMAND ABDBankManagerCoreTests)
endif()