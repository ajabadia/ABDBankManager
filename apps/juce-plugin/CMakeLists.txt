cmake_minimum_required(VERSION 3.22)

juce_add_plugin(ABDBankManagerPlugin
    COMPANY_NAME "ABDSynths"
    COMPANY_WEBSITE "https://abdsynths.local"
    PLUGIN_MANUFACTURER_CODE Abds
    PLUGIN_CODE Abm1
    PRODUCT_NAME "ABD Bank Manager Plugin"
    DESCRIPTION "ABD Universal Bank Manager WebView host"
    FORMATS VST3 Standalone
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    NEEDS_WEB_BROWSER TRUE
    NEEDS_WEBVIEW2 TRUE
    COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources(ABDBankManagerPlugin
    PRIVATE
        PluginProcessor.cpp
        PluginEditor.cpp)

target_include_directories(ABDBankManagerPlugin
    PRIVATE
        ${CMAKE_SOURCE_DIR}
        ${CMAKE_SOURCE_DIR}/cpp)

target_compile_definitions(ABDBankManagerPlugin
    PRIVATE
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1
        JUCE_VST3_CAN_REPLACE_VST2=0
        ABD_FACTORY_CONTENT_STAGING_DIR=\"${ABD_FACTORY_CONTENT_STAGING_DIR_CMAKE}\")

target_link_libraries(ABDBankManagerPlugin
    PRIVATE
        ABDBankManagerCore
        WebUIAssets
        $<$<BOOL:${FACTORY_CONTENT_FILES}>:ABDFactoryContent>
        juce::juce_audio_utils
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

# Proveedor de recursos WebView compartido (ABDSharedCode/WebView2Bridge):
# normaliza la URL, resuelve contra el catalogo embebido y permite fallback a
# ABDSharedAssets. Sustituye los cuatro helpers a mano que tenia PluginEditor.
# El target no existe bajo EMSCRIPTEN (es juce_gui_extra), por eso el guard.
if(TARGET ABDShared::WebView2Bridge)
    target_link_libraries(ABDBankManagerPlugin PRIVATE ABDShared::WebView2Bridge)
endif()

add_dependencies(ABDBankManagerPlugin GenerateAll)

if(WIN32 AND ABD_WEBVIEW2_SOURCE_DIR)
    target_include_directories(ABDBankManagerPlugin PRIVATE
        "${ABD_WEBVIEW2_SOURCE_DIR}/build/native/include")
endif()
