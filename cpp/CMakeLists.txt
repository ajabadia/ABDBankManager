cmake_minimum_required(VERSION 3.22)
# LANGUAGES CXX C: en standalone, JUCE se añade AQUI y exige el compilador
# C declarado en el project() de más alto nivel (mismo motivo que el root).
project(ABDBankManagerCore VERSION 0.1.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --- Configuracion standalone (ci-lib.yml: `cmake -B build -S cpp`) ---
# En el monorepo el root ya integro JUCE y ABDSharedCode antes de llegar
# aqui; configurado suelto lo hacemos nosotros, con las mismas rutas que el
# root (submodulo GITS/JUCE, hermano ../ABDSharedCode o FetchContent).
if(NOT TARGET juce::juce_core)
    set(JUCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../GITS/JUCE" CACHE PATH "Path to JUCE directory")
    if(EXISTS "${JUCE_DIR}/CMakeLists.txt")
        add_subdirectory("${JUCE_DIR}" "${CMAKE_BINARY_DIR}/JUCE")
    elseif(EXISTS "C:/JUCE/CMakeLists.txt")
        add_subdirectory("C:/JUCE" JUCE)
    else()
        message(WARNING "JUCE not found at ${JUCE_DIR}. Trying system paths...")
        find_package(JUCE 8 REQUIRED CONFIG)
    endif()
endif()

if(NOT TARGET ABDShared::BankManagerCore)
    # ../../ABDSharedCode: el hermano del REPO (aqui estamos en cpp/, un
    # nivel mas abajo que en el root).
    set(ABDSHARED_CODE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../ABDSharedCode")
    set(ABDSHAREDCODE_BUILD_DSPCORE_TESTS OFF)
    set(ABDSHAREDCODE_BUILD_DSPEFFECTS_TESTS OFF)
    set(ABDSHAREDCODE_BUILD_SYNTHCORE_TESTS OFF)
    set(ABDSHAREDCODE_BUILD_AUTOUPDATER OFF)
    set(ABDSHAREDCODE_BUILD_AUDIOCOMPARATOR OFF)
    set(ABDSHAREDCODE_BUILD_BANKMANAGER ON)
    if(EXISTS "${ABDSHARED_CODE_DIR}/CMakeLists.txt")
        message(STATUS "ABDSharedCode: using local at ${ABDSHARED_CODE_DIR}")
        add_subdirectory("${ABDSHARED_CODE_DIR}" "${CMAKE_BINARY_DIR}/ABDSharedCode")
    else()
        message(STATUS "ABDSharedCode: no local copy, fetching from GitHub")
        include(FetchContent)
        FetchContent_Declare(
            ABDSharedCode
            GIT_REPOSITORY https://github.com/ajabadia/ABDSharedCode.git
            GIT_TAG        master
            GIT_SHALLOW    TRUE
        )
        FetchContent_MakeAvailable(ABDSharedCode)
    endif()
endif()

# --- ABDBankManagerCore Library ---
# El modulo C++ vive ahora en ABDSharedCode/BankManager (corte del modulo
# bancario, DOCS/bank-manager-module-cut.md). Aqui NO hay fuentes propias: la
# INTERFACE target ABDShared::BankManagerCore propaga sus .cpp y se compilan
# DENTRO de este estatico, de modo que el artefacto y su nombre
# (ABDBankManagerCore.lib) siguen siendo los que consumen el plugin, los tests
# y el paso "Verify outputs" de la CI.
if(NOT TARGET ABDShared::BankManagerCore)
    message(FATAL_ERROR
        "ABDShared::BankManagerCore not found. The BankManager C++ module now "
        "lives in ABDSharedCode/BankManager and must be enabled with "
        "ABDSHAREDCODE_BUILD_BANKMANAGER=ON in the ABDSharedCode integration "
        "block of the root CMakeLists.txt.")
endif()

add_library(ABDBankManagerCore STATIC)

target_link_libraries(ABDBankManagerCore PRIVATE ABDShared::BankManagerCore)

# PUBLIC: los consumidores (plugin, tests) incluyen <BankManager/...>, asi que
# la raiz de ABDSharedCode tiene que llegarles. Se copia la propiedad en vez
# de enlazar el target PUBLIC: si no, sus INTERFACE_SOURCES se repropagan y
# los .cpp del modulo se compilarian otra vez en cada consumidor. Aqui se
# compilan UNA vez, dentro de este estatico.
get_target_property(_abd_bm_includes ABDShared_BankManagerCore INTERFACE_INCLUDE_DIRECTORIES)
if(_abd_bm_includes)
    target_include_directories(ABDBankManagerCore PUBLIC ${_abd_bm_includes})
endif()
unset(_abd_bm_includes)

add_library(ABDBankManager::ABDBankManagerCore ALIAS ABDBankManagerCore)

target_include_directories(ABDBankManagerCore PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_BINARY_DIR}
    ${PROJECT_SOURCE_DIR}/Source
)

target_link_libraries(ABDBankManagerCore PUBLIC
    juce_core
    juce_data_structures
    juce_cryptography
    juce_audio_devices)

# SysExCodec compartido (ABDSharedCode/HardwareDrivers): los tests lo incluyen
# directamente (`<HardwareDrivers/SysExCodec.h>`). El guard `if(TARGET ...)`
# protege a los consumidores que configuran este subdirectorio sin el monorepo
# ni red.
if(TARGET ABDShared::HardwareDrivers)
    target_link_libraries(ABDBankManagerCore PRIVATE ABDShared::HardwareDrivers)
endif()

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
    # Los tests incluyen directamente los mods compartidos (SysExCodec,
    # CasioNibbleCodec, WebView2ResourceProvider) y el enlace de la lib es
    # PRIVATE: sin estos enlaces el include dir no llega (C1083 en el test).
    if(TARGET ABDShared::HardwareDrivers)
        target_link_libraries(ABDBankManagerCoreTests PRIVATE ABDShared::HardwareDrivers)
    endif()
    if(TARGET ABDShared::WebView2Bridge)
        target_link_libraries(ABDBankManagerCoreTests PRIVATE ABDShared::WebView2Bridge)
    endif()
    add_test(NAME ABDBankManagerCoreTests COMMAND ABDBankManagerCoreTests)

    # LINUX/BSD: los pkg de JUCE que solo llegan a los targets `juce_add_*`.
    # `_juce_link_optional_libraries` (JUCEUtils.cmake) linkea
    # `juce::pkgconfig_JUCE_BROWSER_LINUX_DEPS` y `_CURL_` PRIVATE en los
    # targets que piden NEEDS_WEB_BROWSER / NEEDS_CURL; este test es un
    # `add_executable` plano, asi que sin estos -I juce_gui_extra.cpp, que
    # llega aqui via WebView2Bridge, se compila con JUCE_WEB_BROWSER=1 (el
    # default de cabecera) y sin los flags de gtk/webkit: `fatal error:
    # gtk/gtk.h: No such file or directory`, medido en CI. Apagar el
    # navegador (JUCE_WEB_BROWSER=0) NO vale: JUCE esconde la clase
    # WebBrowserComponent y WebView2ResourceProvider.h la usa en su API
    # (tambien medido). El plugin sigue como siempre: juce_add_plugin pide
    # sus deps solo.
    if(UNIX AND NOT APPLE)
        target_link_libraries(ABDBankManagerCoreTests PRIVATE
            juce::pkgconfig_JUCE_BROWSER_LINUX_DEPS
            juce::pkgconfig_JUCE_CURL_LINUX_DEPS)
    endif()
endif()
