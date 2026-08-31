# Guía Técnica de Integración de ABDBankManager en Sintetizadores de la Suite

**Versión:** 1.3.0  
**Fecha:** 31 de Agosto de 2026
**Autor:** Antigravity / DeepMind Pair Programming  
**Repositorio Principal:** `D:\desarrollos\ABDSynths\ABDBankManager`

---
 
## 1. Filosofía Arquitectónica y Patrón "Zero Forks"
 
**ABDBankManager** es la **fuente de la verdad única (SSOT)** para la gestión de bancos, librerías, inspección Hex y volcados SysEx de toda la suite de sintetizadores ABD (`ABDMS2000`, `ABDCZ101`, `ABDJUNiO601`, `ABDEep`, `ABDPro008`, etc.).
 
### Principios Fundamentales:
1. **100% Gobernado por Contrato (`ModelContract`):** El motor no tiene ningún valor *hardcodeado*. Toda la topología (capacidad de banco, número de sub-bancos, tamaño de patch en bytes, longitud de nombre, categorías y algoritmos SysEx) se obtiene dinámicamente del contrato del sintetizador solicitado.
2. **Doble Modo Operativo (Plugin Host vs Standalone Hardware):**
   - **Modo Plugin Host (Embebido):** La UI detecta que está en un plugin (vía `?model=<modelId>` o puente `window.parent.__synthBridge`). Desactiva la necesidad de puertos Web MIDI externos, muestra el indicador verde `[ Plugin DSP ● ]`, y conecta las acciones de captura y envío directamente con la memoria RAM activa del motor C++ del plugin.
   - **Modo Standalone (Librarian Físico):** Se comunica vía Web MIDI con hardware físico externo conectado a los puertos MIDI del ordenador.
3. **Persistencia del Banco Activo en el DAW (36 KB Blob Base64):** El plugin anfitrión serializa el estado completo de los programas activos dentro del chunk de estado del proyecto de DAW (`APVTS`), asegurando que al mover el proyecto de equipo el sonido no dependa de librerías locales externas.
4. **Sincronización Pre-Build Selectiva (Assets Ligeros para JUCE):** Los sintetizadores consumidores mantienen un script (`npm run sync:bankmanager`) que copia los módulos y la WebUI limpia, pero filtrando mediante `ALLOWED_IMAGES` únicamente las imágenes correspondientes a su modelo y marca (evitando engordar el binario compilado VST3/AU con imágenes de otros sintetizadores).
5. **Theming Dinámico Universal:** La WebUI hereda automáticamente los colores, bordes y fuentes del sintetizador anfitrión y de sus skins activas mediante variables CSS estándar.
6. **Compatibilidad de ABI (Binarios Precompilados vs Código Fuente):** En JUCE/C++20, enlazar contra binarios `.lib`/`.a` precompilados puede causar incompatibilidades de ABI/Runtime (MSVC `/MD` vs `/MT`, versiones de toolset, flags de optimización). **La integración debe soportar DOS vías**: (A) Compilación desde fuentes vía `add_subdirectory`/`FetchContent` (desarrollo local, flags idénticos al plugin) y (B) `find_package` con binarios precompilados (solo builds de CI/CD oficiales).
 
---

## 2. Matriz de Contratos Disponibles

| Model ID | Nombre Comercial | Capacidad de Banco | Sub-bancos | Bytes / Patch | Máx. Nombre | Algoritmo SysEx / Checksum |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `korg-ms2000` | Korg MS2000 / microKORG | 128 | 2 (A / B) | 288 B | 12 car. | 8-to-7 packing, `0x42` (Korg) |
| `casio-cz101` | Casio CZ-101 / CZ-1000 | 16 | 1 | 128 B | 0 car. | Nibble packing, `0x44` (Casio) |
| `casio-cz5000` | Casio CZ-5000 / CZ-1 | 64 | 4 (A / B / C / D) | 128 B | 0 car. | Nibble packing, `0x44` (Casio) |
| `roland-juno106` | Roland Juno-106 | 128 | 2 grupos (8x8) | 18 B | 0 car. | Octal `11..88`, `0x41` (Roland) |
| `behringer-dm12` | Behringer DeepMind 12 | 1024 | 8 (A a H) | 242 B | 16 car. | 7-to-8 packing, `0x00 0x20 0x32` |
| `behringer-pro800` | Behringer Pro-800 | 400 | 4 (0 a 3) | 100 B | 0 car. | CC-based dump, `0x00 0x20 0x32` |
| `yamaha-dx7` | Yamaha DX7 | 32 | 1 | 128 B | 10 car. | 7-to-8 packing, `0x43` (Yamaha) |
 
---
 
## 3. Integración CMake — Doble Vía (Fuente vs Binario Precompilado)
 
**⚠️ Crítico para JUCE/C++20:** Para evitar incompatibilidades de ABI/Runtime (MSVC `/MD` vs `/MT`, toolset VS, flags de optimización), la librería **debe ofrecer dos vías de enlace**. El consumidor elige según contexto:
 
### Opción A — Compilación desde Fuentes (Desarrollo Local, Recomendada)
 
```cmake
# En CMakeLists.txt del plugin consumidor
include(FetchContent)
FetchContent_Declare(
  ABDBankManager
  GIT_REPOSITORY https://github.com/ajabadia/ABDBankManager.git
  GIT_TAG        v0.1.0-standalone   # o main para desarrollo
)
FetchContent_MakeAvailable(ABDBankManager)
 
# Link automático con los mismos flags del plugin consumidor
target_link_libraries(${PROJECT_NAME} PRIVATE ABDBankManager::ABDBankManagerCore)
```
 
> **Ventaja:** El plugin y ABDBankManagerCore se compilan con **exactamente los mismos flags** (`/MD`, `/permissive-`, `/std:c++20`, etc.). Cero riesgo de ABI mismatch.
 
### Opción B — Binario Precompilado (Solo CI/CD Oficiales)
 
```cmake
# Solo en pipelines de CI/CD donde ABDBankManager esté instalado en el sistema
find_package(ABDBankManager 0.1 REQUIRED)
target_link_libraries(${PROJECT_NAME} PRIVATE ABDBankManager::ABDBankManagerCore)
```
 
> **Restricción:** Solo usar si el binario `.lib`/`.a` fue compilado con **los mismos flags** que el plugin consumidor (mismo toolset, misma CRT, misma arquitectura). En caso de duda, **usa Opción A**.
 
### Headers Exportados (Comunes a ambas vías)
 
```cpp
#include <ABDBankManager/BankManagerCore.h>
#include <ABDBankManager/ParameterRegistry.gen.h>
#include <ABDBankManager/BuildVersion.h>
```
 
---
 
## 5. Integración Paso a Paso en un Sintetizador Consumidor
 
### PASO 1: Sincronización Selectiva — Script Local Obligatorio (`Scripts/sync_bankmanager.js`)
 
**⚠️ Crítico:** El script **debe residir en el proyecto del sintetizador consumidor** (no usar el genérico del origen sin filtrado). Si se ejecuta el script sin filtrado, se copiarán **todas las 50+ imágenes** de todos los sintetizadores (Juno, DX7, CZ, DeepMind, MS2000), engordando innecesariamente el binario JUCE/VST3 del plugin.
 
Crea `Scripts/sync_bankmanager.js` en **tu proyecto** configurando `ALLOWED_IMAGES` solo con tus assets:
 
```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
 
const SOURCE_ROOT = path.resolve(__dirname, '../../ABDBankManager');
const TARGET_DIR = path.resolve(__dirname, '../WebUI/src/components/bank');
 
// ⚠️ Configuración ESTRICTA de imágenes para ESTE sintetizador
const ALLOWED_IMAGES = [
  'korg-logo.svg',               // Reemplazar con el logo del fabricante del sinte
  'korg-ms2000.webp',           // Miniatura del modelo principal
  'korg-ms2000r.webp',          // Variantes de rack / compatibles
  'korg-microkorg.webp',
  'placeholder-synth.svg',      // Placeholders comunes requeridos
  'placeholder-manufacturer.svg',
  'placeholder-bank.svg'
];
 
function copyRecursiveSync(src, dest, ignoreDirs = ['tests', 'node_modules', '.git']) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    const base = path.basename(src);
    if (ignoreDirs.includes(base)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child), ignoreDirs);
    }
  } else {
    const filename = path.basename(src);
    const inModelsDir = src.includes('vendor') && src.includes('images') && src.includes('models');
    if (inModelsDir && !ALLOWED_IMAGES.includes(filename) && (filename.endsWith('.webp') || filename.endsWith('.svg'))) {
      return; // 🛑 Evita copiar imágenes de otros sintetizadores para reducir el binario JUCE
    }
 
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
 
export function syncBankManager() {
  console.log('🔄 Sincronizando selectivamente ABDBankManager -> Plugin...');
  const webUiSrc = path.join(SOURCE_ROOT, 'WebUI');
  copyRecursiveSync(webUiSrc, TARGET_DIR);
  console.log('✅ Sincronización finalizada.');
}
 
syncBankManager();
```
 
En tu `package.json`:
```json
"scripts": {
  "sync:bankmanager": "node Scripts/sync_bankmanager.js"
}
```
 
> **Resultado:** Solo tus logos y miniaturas entran en el binario VST3/AU final.
 
---
 
### PASO 2: Persistencia del Banco Completo en Estado DAW (C++)

Para que el proyecto del DAW mantenga los 128 (o N) patches activos sin depender del disco local:

1. En `SysExManager.h`:
```cpp
std::vector<uint8_t> getAllPrograms() const;
void setAllPrograms(const std::vector<uint8_t>& data);
```

2. En `PluginProcessor.cpp`:
```cpp
void AudioPluginAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    // Serializar el banco completo de memoria activa en Base64 en el APVTS
    auto bankBytes = sysexManager.getAllPrograms();
    juce::String bankBlobB64 = juce::Base64::toBase64(bankBytes.data(), bankBytes.size());
    apvts.state.setProperty("bankDataBlob", bankBlobB64, nullptr);

    std::unique_ptr<juce::XmlElement> xml (apvts.state.createXml());
    copyXmlToBinary (*xml, destData);
}

void AudioPluginAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState (getXmlFromBinary (data, sizeInBytes));
    if (xmlState != nullptr && xmlState->hasTagName (apvts.state.getType()))
    {
        apvts.replaceState (juce::ValueTree::fromXml (*xmlState));
        if (apvts.state.hasProperty("bankDataBlob"))
        {
            juce::String b64 = apvts.state.getProperty("bankDataBlob").toString();
            juce::MemoryOutputStream mos;
            if (juce::Base64::convertFromBase64(mos, b64))
            {
                auto mb = mos.getMemoryBlock();
                std::vector<uint8_t> blob(mb.getData(), mb.getData() + mb.getSize());
                sysexManager.setAllPrograms(blob);
            }
        }
    }
}
```

---

### PASO 3: Frontend y Contenedor Modal (`app.js`)

Instancia el modal pasando la URL con el parámetro del modelo:

```javascript
import { BankManagerModal } from './components/bank/src/components/BankManagerModal.js';

const bankManagerModal = new BankManagerModal({
  iframeSrc: 'src/components/bank/index.html?model=korg-ms2000', // o ?model=casio-cz101, etc.
  synthBridge: bridge
});

document.getElementById('btn-open-bank-manager')?.addEventListener('click', () => {
  bankManagerModal.toggle();
});
```

---

### PASO 4: Theming por Variables CSS

El componente hereda dinámicamente las variables del tema activo del sintetizador:

```css
:root {
  --color-bg-base: #0a1118;        /* Fondo base */
  --color-panel-bg: #102130;       /* Fondo de paneles */
  --color-panel-surface: #172d42;  /* Superficies de tarjetas */
  --color-panel-border: #1c354d;   /* Bordes */
  --color-accent: #00c3ff;         /* Acento principal */
  --color-accent-hover: #38d3ff;   /* Hover de acento */
  --color-text-main: #f0f7ff;      /* Texto primario */
  --color-text-muted: #7e9bb5;     /* Texto atenuado */
}
```
