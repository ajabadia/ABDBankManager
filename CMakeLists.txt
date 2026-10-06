cmake_minimum_required(VERSION 3.22)
project(ABDBankManager VERSION 0.1.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(CTest)

# --- JUCE 8 ---
if(NOT TARGET juce::juce_core)
    set(JUCE_DIR "${CMAKE_SOURCE_DIR}/GITS/JUCE" CACHE PATH "Path to JUCE directory")
    if(EXISTS "${JUCE_DIR}/CMakeLists.txt")
        add_subdirectory("${JUCE_DIR}" ${CMAKE_BINARY_DIR}/JUCE)
    elseif(EXISTS "C:/JUCE/CMakeLists.txt")
        add_subdirectory("C:/JUCE" JUCE)
    else()
        message(WARNING "JUCE not found at ${JUCE_DIR}. Trying system paths...")
        find_package(JUCE 8 REQUIRED CONFIG)
    endif()
endif()

# --- ABDSharedCode (modulos compartidos de la suite ABDSynths) ---
# Integracion segun ABDSharedCode/INTEGRATION_GUIDE.md: monorepo local si
# existe al lado, si no FetchContent desde GitHub (CI y clones limpios).
# Los tests standalone y los modulos que no consumimos se apagan para que el
# configure de este proyecto no arrastre superficie ajena.
set(ABDSHARED_CODE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ABDSharedCode")
set(ABDSHAREDCODE_BUILD_DSPCORE_TESTS OFF)
set(ABDSHAREDCODE_BUILD_DSPEFFECTS_TESTS OFF)
set(ABDSHAREDCODE_BUILD_SYNTHCORE_TESTS OFF)
set(ABDSHAREDCODE_BUILD_AUTOUPDATER OFF)
set(ABDSHAREDCODE_BUILD_AUDIOCOMPARATOR OFF)
# El modulo BankManager (corte del modulo bancario, DOCS/bank-manager-module-cut.md)
# vive en ABDSharedCode/BankManager y hace falta AQUI: cpp/ lo enlaza para
# compilar sus fuentes dentro de ABDBankManagerCore.lib.
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

# --- Bank Manager Core (C++ module for JUCE plugins) ---
add_subdirectory(cpp)

# --- Standalone Application & Targets (Only when building ABDBankManager directly) ---
if(CMAKE_CURRENT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR)
    # --- Factory content staging ---
    set(ABD_FACTORY_CONTENT_STAGING_DIR "${CMAKE_SOURCE_DIR}/factory-content-staging" CACHE PATH
        "Directory containing administrator-approved .abdbank factory content")
    file(TO_CMAKE_PATH "${ABD_FACTORY_CONTENT_STAGING_DIR}" ABD_FACTORY_CONTENT_STAGING_DIR_CMAKE)
    file(GLOB FACTORY_CONTENT_FILES CONFIGURE_DEPENDS
        "${ABD_FACTORY_CONTENT_STAGING_DIR}/*.abdbank")

    if(FACTORY_CONTENT_FILES)
        juce_add_binary_data(ABDFactoryContent
            HEADER_NAME "ABDFactoryContent.h"
            NAMESPACE "ABDFactoryContent"
            SOURCES ${FACTORY_CONTENT_FILES}
        )
        message(STATUS "Factory content files: ${FACTORY_CONTENT_FILES}")
    else()
        message(STATUS "Factory content staging is empty: ${ABD_FACTORY_CONTENT_STAGING_DIR}")
    endif()

    # --- WebUI Binary Data (for standalone app) ---
    # FOLLOW_SYMLINKS es obligatorio: los assets compartidos de la suite llegan como
    # junctions (WebUI/vendor/images/models/logos -> ABDSharedAssets/brands, etc.).
    # Sin esta opcion CMake lista los propios junctions como si fueran FICHEROS
    # (LIST_DIRECTORIES false no los filtra: son symlinks a directorios) y
    # juce_add_binary_data los pasa a juce_binarydata, que revienta con
    # "Unhandled exception" -> MSB8066. Ademas, al no recursar dentro, los logos y
    # miniaturas desaparecian del bundle embebido.
    file(GLOB_RECURSE BANK_MANAGER_WEBUI_ASSETS CONFIGURE_DEPENDS FOLLOW_SYMLINKS
        "WebUI/src/*"
        "WebUI/*.html"
        "WebUI/*.js"
        "WebUI/*.css"
        "WebUI/*.json"
        "WebUI/*.svg"
        "WebUI/vendor/*"
        "WebUI/public/*"
    )

    if(BANK_MANAGER_WEBUI_ASSETS)
        juce_add_binary_data(WebUIAssets
            HEADER_NAME "WebUIAssets.h"
            NAMESPACE "WebUIAssets"
            SOURCES ${BANK_MANAGER_WEBUI_ASSETS}
        )
    endif()

    # --- Windows: FetchContent for WebView2 ---
    if(WIN32)
        include(FetchContent)
        FetchContent_Declare(
            webview2
            URL https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/1.0.2592.51
            DOWNLOAD_EXTRACT_TIMESTAMP TRUE
        )
        FetchContent_MakeAvailable(webview2)

        if(DEFINED webview2_SOURCE_DIR)
            set(ABD_WEBVIEW2_SOURCE_DIR "${webview2_SOURCE_DIR}" CACHE INTERNAL "WebView2 package extracted by FetchContent")
            set(JUCE_WEBVIEW2_PACKAGE_LOCATION "${webview2_SOURCE_DIR}" CACHE PATH "WebView2 package used by JUCE")
            add_library(WebView2LoaderStatic STATIC IMPORTED)
            set_target_properties(WebView2LoaderStatic PROPERTIES
                IMPORTED_LOCATION "${webview2_SOURCE_DIR}/build/native/x64/WebView2LoaderStatic.lib"
                INTERFACE_INCLUDE_DIRECTORIES "${webview2_SOURCE_DIR}/build/native/include"
            )
            add_library(version_lib STATIC IMPORTED)
            set_target_properties(version_lib PROPERTIES
                IMPORTED_LOCATION "${webview2_SOURCE_DIR}/build/native/x64/version.lib"
            )
        endif()
    endif()

    # --- Build Version Generation ---
    # minusculas, como el directorio real (`scripts/`): en Windows da igual, pero
    # en un FS case-sensitive (Linux, el job WASM de CI) node acaba con
    # "Cannot find module .../Scripts/build_webui.js" y el target revienta.
    add_custom_target(GenerateBuildVersion
        COMMAND node ${CMAKE_SOURCE_DIR}/scripts/build_webui.js
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        COMMENT "Generating BuildVersion.h and buildVersion.js"
        VERBATIM
    )

    # --- Registry Generation ---
    add_custom_target(GenerateRegistry
        COMMAND node ${CMAKE_SOURCE_DIR}/scripts/registry_generator.js
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        COMMENT "Generating ParameterRegistry.gen.h/.cpp and registry.gen.js"
        VERBATIM
    )

    add_custom_target(GenerateAll DEPENDS GenerateRegistry GenerateBuildVersion)

    # --- Concrete JUCE WebView host/plugin ---
    # El plugin es un artefacto NATIVO (VST3/Standalone con WebView2) y no existe
    # historia que construir de el bajo emscripten: JUCE no soporta emscripten
    # (medido: 9.0.1 -> 9.0.3 sin un solo commit wasm) y el SDK VST3 de
    # Steinberg no compila con su clang (funknown.h revienta en PLUGIN_API).
    # El job WASM de CI se retiro con decision documentada — ver el bloque en
    # .github/workflows/ci.yml; esta compuerta se queda para que un
    # `emcmake cmake` futuro configure el arbol sin arrastrar el plugin.
    if(NOT EMSCRIPTEN)
        add_subdirectory(apps/juce-plugin)
    endif()

    # --- Installation ---
    install(FILES
        "${CMAKE_CURRENT_BINARY_DIR}/Source/State/ParameterRegistry.gen.h"
        DESTINATION include/ABDBankManager
    )
endif()
