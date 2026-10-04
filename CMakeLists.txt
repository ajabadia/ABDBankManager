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
    file(GLOB_RECURSE BANK_MANAGER_WEBUI_ASSETS CONFIGURE_DEPENDS
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

    # --- Concrete JUCE WebView host/plugin ---
    #
    # ESTO ESTA DENTRO DE UN if(EXISTS) PORQUE ANTES NO ESTABA, Y PORQUE
    # `apps/juce-plugin` NO ESTA EN EL ARBOL. Este `add_subdirectory` es
    # incondicional, asi que un clon limpio se caia aqui antes incluso de
    # llegar a compilar, y no con un error de JUCE sino con:
    #
    #   add_subdirectory given source "apps/juce-plugin" which is not an
    #   existing directory
    #
    # que es el error mas confuso posible: habla de un directorio que el
    # propio repo dice tener. El directorio es trabajo en curso que aun no
    # se ha commiteado, y mientras no lo este, el build no puede depender
    # de el.
    #
    # EL SALTO NO ES CALLADO, que es lo unico que haria mal. Si no esta, se
    # dice en alto: un guard que se puede dejar en silencio es un guard que
    # no guarda, y aqui lo que se calla es "no se ha compilado el plugin".
    # Cuando el directorio se commitee, el `if` dejara de saltarse solo.
    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/apps/juce-plugin/CMakeLists.txt")
        add_subdirectory(apps/juce-plugin)
    else()
        message(STATUS
            "apps/juce-plugin no esta en el arbol: se compila todo menos el plugin. "
            "Es trabajo en curso sin commitear, y el build no puede depender de el.")
    endif()

    # --- Installation ---
    install(FILES
        "${CMAKE_CURRENT_BINARY_DIR}/Source/State/ParameterRegistry.gen.h"
        DESTINATION include/ABDBankManager
    )
endif()
