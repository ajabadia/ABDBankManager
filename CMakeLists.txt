cmake_minimum_required(VERSION 3.22)
project(ABDBankManager VERSION 0.1.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# --- JUCE 8 ---
set(JUCE_DIR "${CMAKE_SOURCE_DIR}/GITS/JUCE" CACHE PATH "Path to JUCE directory")
if(NOT EXISTS "${JUCE_DIR}/CMakeLists.txt")
    message(WARNING "JUCE not found at ${JUCE_DIR}. Trying system paths...")
    find_package(JUCE 8 REQUIRED CONFIG)
else()
    add_subdirectory("${JUCE_DIR}" ${CMAKE_BINARY_DIR}/JUCE)
endif()

# --- Bank Manager Core (C++ module for JUCE plugins) ---
add_subdirectory(cpp)

# --- WebUI Binary Data (for plugin embedding) ---
file(GLOB_RECURSE WEBUI_ASSETS
    "WebUI/src/*"
    "WebUI/*.html"
    "WebUI/*.js"
    "WebUI/*.css"
    "WebUI/*.json"
    "WebUI/*.svg"
)

if(WEBUI_ASSETS)
    juce_add_binary_data(WebUIAssets
        HEADER_NAME "WebUIAssets.h"
        NAMESPACE "WebUIAssets"
        SOURCES ${WEBUI_ASSETS}
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
add_custom_target(GenerateBuildVersion
    COMMAND node ${CMAKE_SOURCE_DIR}/Scripts/build_webui.js
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    COMMENT "Generating BuildVersion.h and buildVersion.js"
    VERBATIM
)

# --- Registry Generation ---
add_custom_target(GenerateRegistry
    COMMAND node ${CMAKE_SOURCE_DIR}/Scripts/registry_generator.js
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    COMMENT "Generating ParameterRegistry.gen.h/.cpp and registry.gen.js"
    VERBATIM
)

add_custom_target(GenerateAll DEPENDS GenerateRegistry GenerateBuildVersion)

# --- Installation ---
install(TARGETS ABDBankManagerCore
    ARCHIVE DESTINATION lib
    LIBRARY DESTINATION lib
    RUNTIME DESTINATION bin
)

install(FILES
    "${CMAKE_CURRENT_BINARY_DIR}/Source/State/ParameterRegistry.gen.h"
    DESTINATION include/ABDBankManager
)