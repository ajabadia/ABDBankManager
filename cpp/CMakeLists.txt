cmake_minimum_required(VERSION 3.22)
project(ABDBankManagerCore VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# JUCE targets are available from parent scope via add_subdirectory(GITS/JUCE)

# --- ABDBankManagerCore Library ---
add_library(ABDBankManagerCore STATIC
    ABDBankManagerCore.cpp
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
add_dependencies(ABDBankManagerCore GenerateAll)

# --- Installation ---
install(TARGETS ABDBankManagerCore
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
    RUNTIME DESTINATION bin
)

install(FILES
    ${CMAKE_CURRENT_BINARY_DIR}/Source/State/ParameterRegistry.gen.h
    DESTINATION include/ABDBankManager
)