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
| `korg-ms2000` | Korg MS2000 / microKORG | 128 | 8 (A–H) | **254 B** (291 B packed, `F0 42 3n 58 40`, 297 B) | 12 car. | 7→8 Korg bit `6-j` sin pad, `0x42` |
| `abd-sm002` | ABD MS2000 (SM002) — *formato propio* | 128 | 8 (A–H) | **384 B v2** (439 B packed, `F0 7D 0A 40`, **444 B**; v1 128 B) | 12 car. | 7→8 ABDSynths bit `i` sin pad, `0x7D` `0x0A` — ver `DOCS/ABDSYNTHS_SYSEX_GUIDE.md` |
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

---

### PASO 5: Contrato C++ Bridge para Intercambio de Memoria y Patches

Para que el Bank Manager pueda capturar y enviar tanto el patch activo como bancos completos directamente al motor DSP del sintetizador en modo plugin, el `BridgeActions.cpp` del sintetizador debe gestionar tres acciones clave:

```cpp
// 1. Obtener datos del patch actualmente activo
else if (action == "getRawProgramData")
{
    MS2000ProgramData currentProg;
    currentProg.extractFromAPVTS(processor_.getAPVTS(), "Active Patch");
    juce::MemoryBlock mb(currentProg.rawData.data(), currentProg.rawData.size());

    juce::DynamicObject::Ptr resObj = new juce::DynamicObject();
    resObj->setProperty("dataBase64", mb.toBase64Encoding());
    resObj->setProperty("name", juce::String(currentProg.getName()));
    resObj->setProperty("size", static_cast<int>(currentProg.rawData.size()));
    sendEventToJs("rawProgramDataResponse", juce::var(resObj.get()));
}

// 2. Volcar la memoria completa del banco (ej. 128 programas)
else if (action == "getAllProgramsData")
{
    auto allBytes = processor_.getSysExManager().getAllPrograms();
    juce::MemoryBlock mb(allBytes.data(), allBytes.size());

    juce::DynamicObject::Ptr resObj = new juce::DynamicObject();
    resObj->setProperty("dataBase64", mb.toBase64Encoding());
    resObj->setProperty("totalPatches", 128);
    resObj->setProperty("bytesPerPatch", 288);
    sendEventToJs("allProgramsDataResponse", juce::var(resObj.get()));
}

// 3. Aplicar un patch seleccionado desde el Bank Manager hacia el motor C++
else if (action == "setRawProgramData")
{
    auto b64 = message.getProperty("dataBase64", "").toString();
    juce::MemoryOutputStream mem;
    if (juce::Base64::convertFromBase64(mem, b64) && mem.getDataSize() >= MS2000ProgramData::UNPACKED_PROGRAM_SIZE)
    {
        MS2000ProgramData prog;
        std::memcpy(prog.rawData.data(), mem.getData(), MS2000ProgramData::UNPACKED_PROGRAM_SIZE);
        prog.applyToAPVTS(processor_.getAPVTS());
        processor_.changeProgramName(processor_.getCurrentProgram(), juce::String(prog.getName()));
        sendFullParamSync();

        juce::DynamicObject::Ptr resObj = new juce::DynamicObject();
        resObj->setProperty("success", true);
        resObj->setProperty("name", juce::String(prog.getName()));
        sendEventToJs("rawProgramDataApplied", juce::var(resObj.get()));
    }
}
```

### PASO 5.1: Contexto del Sintetizador Anfitrión (`hostModel`)

El Bank Manager embebido necesita saber **qué sintetizador lo hospeda** para no ofrecer los 22
modelos registrados, sino solo el hardware compatible con el host. El sintetizador lo anuncia con
una única acción unidireccional **C++ → JS**: `hostModel`.

El filtro afecta a **toda la navegación del Bank Manager** (sidebar de fabricantes, cascade view,
tree view, página de fabricante y lista de selección de modelo), no solo al selector: con
`abd-sm002` el modal abre con **3 modelos en 2 fabricantes** (ABDSynths 1 + Korg 2) en lugar de
22 en 6, y muestra un banner con el hardware del host. La búsqueda global también filtra los
**modelos**; los bancos y parches (datos del usuario) se siguen buscando completos.

El anuncio acota además el **desplegable manual de modelo de la conexión MIDI** (el que decide qué
contrato SysEx usan *fetch*/*send*): dentro del plugin solo lista el hardware del host, porque sus
puertos no tienen nombre que olfatear y ese desplegable es el camino normal, no una salvedad.
Fuera de un anfitrión (Bank Manager standalone) la lista sigue completa, para poder cambiar de
sintetizador sin recargar; una conexión MIDI posterior nunca borra ni ensancha este ámbito.

El ámbito no es un candado: el propio desplegable ofrece una **salida de emergencia** («Other
hardware…») que lista el registro completo para esa sesión, sin tocar la navegación ni el contrato
del host y sin persistir nada. El anfitrión no tiene que hacer nada al respecto — solo anunciar su
`modelId` cuando la WebUI esté lista (abajo). Un `hostModel` con un `modelId` distinto vuelve a
acotar el desplegable automáticamente.

| Campo | Valor |
|-------|-------|
| Acción | `hostModel` (anuncio) y `hostInfo` (ficha, respuesta a `requestHostInfo`) |
| Dirección | C++ → JS (el host publica; la WebUI solo escucha) |
| Payload | `data.modelId` (anidado) o `modelId` (plano) |
| Valor | un `modelId` declarado en `Source/Contracts/Models` (p. ej. `abd-sm002`, `korg-ms2000`) |
| Efecto | la navegación, el selector de modelos **y el desplegable manual de MIDI** se filtran al modelo canónico + sus `compatibleModels` (forward y reverse): fabricantes visibles, cascade view, tree view, páginas de fabricante, hits de modelo en la búsqueda global y modelos conectables por MIDI |
| Sin el mensaje | **standalone:** 22 modelos / 6 fabricantes. **Embebido:** catálogo vacío con aviso y salida por MIDI (ver «Embebido sin anuncio») |
| Payload inválido | `modelId` vacío se ignora sin más. Un `modelId` **desconocido** (contrato que este build no tiene) ya **no** cae a los 22: el catálogo queda vacío con un aviso propio («Unsupported hardware… *<id>*») y la salida sigue siendo declarar hardware por MIDI |

Emisión desde C++ (el helper `sendEventToJs` es el mismo del resto del PASO 5):

```cpp
// Llamar cuando el editor arranca y, de nuevo, tras el 'requestState' del Bank Manager.
void sendHostModelToJs()
{
    juce::DynamicObject::Ptr data = new juce::DynamicObject();
    data->setProperty("modelId", hostModelId());  // sale del ModelContract del host, no de un literal
    sendEventToJs("hostModel", juce::var(data.get()));
}
```

Formas de payload aceptadas por la WebUI (ambas válidas):

```jsonc
// 1. Anidada — la que usa el adaptador nativo (BridgeManager._handleMessage)
{ "action": "hostModel", "data": { "modelId": "abd-sm002" }, "schemaVersion": 1 }

// 2. Plana — hosts simples / tests manuales
{ "action": "hostModel", "modelId": "korg-ms2000" }
```

Recomendaciones de integración:

1. Enviar `hostModel` **una vez que la WebUI esté lista** (justo después de que pida el estado con
   `requestState`) y repetirlo si el sintetizador puede cambiar de identidad.
2. Usar siempre un `modelId` existente en `Source/Contracts/Models/index.ts`; el contrato del host
   es el que declara su `compatibleModels` (p. ej. `korgAbdSm002Contract` en `korg-ms2000.ts`).
3. El mensaje está cubierto por `schemas/bridge-messages.schema.v1.json` (`cppToWebui`,
   `action: "hostModel"`, propiedad `modelId`).
4. Es el **equivalente a conectar el hardware por MIDI** en lo que a filtrado se refiere, y no
   sustituye a las acciones de patch/banco del PASO 5.
5. Si el host también se sirve **en el navegador** (dev server / build WASM) y ahí no existe backend
   nativo que conteste, que responda el handshake en su propio puente JS con la **misma** política de
   acciones que su lado nativo. Implementación de referencia en ABDMS2000:
   `WebUI/src/bridge/bridgeCore.js` (responde `requestState` / `requestFullState`) +
   `WebUI/src/contracts/hostModel.js`, que lee el `modelId` del contrato canónico en vez de repetir
   el literal. Sin ese emisor el host embebido se queda en el estado «sin anuncio» de abajo.
6. Derivar el `modelId` de **una sola fuente** (el contrato en `Source/Contracts/Models`) y consumirlo
   desde ahí: en C++ acaba en `hostModelId()`, en JS en una constante importada del registro
   generado. No escribirlo a mano en dos sitios. En ABDMS2000 el C++ lo consume de
   `Source/Plugin/HostModelId.gen.h`, generado por `Scripts/generate_host_model_id.js` desde el mismo
   contrato (paso 1 de `build.bat`); un test JS une header ↔ contrato.
7. **Ficha del host (recomendada):** responder `requestHostInfo` con `hostInfo` (`{ modelId, displayName,
   manufacturer, protocol, buildStamp, buildRevision }`) y publicar el **nivel de puente**
   (`protocol`: 2 = anuncia `hostModel`, 3 = responde la ficha, 4 = puente MIDI de hardware). El Bank
   Manager la pide al arrancar embebido y con ella deja de insinuar: distingue «el host contestó pero su
   build es anterior al anuncio» de «no contestó ni el handshake», y cuando el `modelId` anunciado no
   está en el catálogo **nombra el build del host** en el aviso en vez de suponer una desincronización.
   El anuncio `hostModel` lleva los mismos campos de sello, así que un host que solo anuncie sigue
   dando información de build. El Bank Manager los **muestra al usuario**: un chip de diagnóstico en su
   cabecera (`build … · protocol N`, clicable) y el panel con el detalle (host, fabricante, sello,
   revisión, nivel de puente y las capacidades que cada nivel habilita). Un host que no rellene
   `buildStamp`/`protocol` sale ahí como «not reported», y un nivel más nuevo que el que este build
   conoce se avisa en vez de interpretarse. Referencia: `ABDMS2000/Source/Plugin/HostModelAnnouncement.h`
   (`actionAnswersHostInfo`, `hostInfoMessage`) y, en modo navegador, `WebUI/src/contracts/hostModel.js`;
   lado Bank Manager: `WebUI/src/ui/hostDiagnostics.js`.
8. **Puente MIDI de hardware (solo si el host va a permitir *traer* bancos):** dentro del WebView2 no
   hay Web MIDI, así que el Bank Manager manda el SysEx del contrato con `hardware.send` (bytes en
   base64 en `payload`) y pide empezar a escuchar con `hardware.listen`. El host debe despachar ambas y
   devolver los bytes que lleguen del dispositivo como `hardware.receive`
   (`{ payload: <base64 estándar>, size }` — el `atob` del WebUI, **no** el formato
   `<tamaño>.<datos>` de `MemoryBlock::toBase64Encoding()`), más `hardware.listen.ack`
   (`{ listening, device }`) y `hardware.error` (texto). Sin dispositivos, contestar el motivo es lo que
   evita que el usuario espere 128 timeouts de 5 s: el Bank Manager corta el fetch y lo explica.
   Referencia: `ABDMS2000/Source/Plugin/HardwareMidiTransport.h` + `BridgeActions::handleJsEvent()`.
9. **Dirección del canal nativo → JS (JUCE 8):** el mensaje sale con
   `WebBrowserComponent::emitEventIfBrowserIsVisible(eventId, object)`, que es lo que dispara los
   `window.__JUCE__.backend.addEventListener(eventId, …)` del WebUI. El
   `window.__JUCE__.backend.emitEvent(...)` **del JS** es la dirección contraria (JS → nativo,
   `withEventListener`): usarlo desde el C++ descarta el mensaje en silencio y el host se queda
   «sin anuncio» aunque su log diga que recibió `requestState`. ABDMS2000 usaba ese camino y por eso
   el modal abría vacío dentro del plugin real. Lo vigila un test que falla si vuelve a aparecer un
   `backend.emitEvent` escrito desde C++: `ABDMS2000/WebUI/tests/unit/hostModelAnnouncement.test.js`.

Embebido **sin** anuncio (`hostModel` perdido, host antiguo o un entorno que no puede emitirlo):
el modo lo decide el tipo de puente (`plugin-host` = iframe + `__synthBridge`). En ese modo el Bank
Manager **no** cae al registro completo — mientras no haya contexto (ni `hostModel` ni conexión
MIDI) el catálogo queda vacío (sidebar, tree view, páginas de fabricante, selector de «New Bank» y
búsqueda de modelos) y la WebUI explica qué hacer: «Waiting for the host…» y, tras 1,5 s, «No
hardware selected…» con un botón para conectar MIDI. Así un host que no anuncia nunca presenta 22
modelos como si pudiera gobernarlos. No hay callejón sin salida: sin contexto de host el
desplegable manual de MIDI sigue ofreciendo el registro completo, así que el usuario declara su
hardware y el catálogo reaparece acotado a esa familia. Ese diálogo es también la salida cuando el host no anuncia: sus puertos «ABD Bridge MIDI (<tipo>)» los fabrica el propio Bank Manager, así que su input llega preseleccionado y «Detect model» sobre ellos devuelve el modelo del host (o una explicación) en vez de «Not recognized»; y el aviso del caso sin anuncio dice **qué hacer** —reiniciar un host cuyo build es anterior a este Bank Manager—. En standalone (navegador, app JUCE) nada
cambia.

Lado WebUI (referencia de implementación): `initHostContext(bridge)` se registra en `init()` de
`app.js` y desemboca en `setContextModelId(modelId)`; ver `WebUI/src/core/hostContext.js`. Ese
setter notifica a la app (`onContextModelChange`), que reconstruye el catálogo de navegación con
`getVisibleContracts()` + `groupContractsByManufacturer()` y repinta sidebar/contenido. Limpiar el
contexto (`setContextModelId(null)`) devuelve el catálogo completo, así que el mensaje es
idempotente y reversible.

Lado C++ (implementación de referencia): `ABDMS2000` emite la acción desde
`BridgeActions::handleJsEvent()` al recibir `requestState` (Bank Manager embebido, momento fiable)
y `requestFullState` (handshake de su propia WebUI). La política y el payload viven en
`ABDMS2000/Source/Plugin/HostModelAnnouncement.h`, el puerto del plugin en `BridgeHost.h` y el
sumidero JS lo inyecta el Editor; ver `ABDMS2000/DOCS/BANK_MANAGER_INTEGRATION_SPEC.md` §10.4.

**Un `modelId` anunciado pero desconocido** (host y catálogo de contratos de versiones distintas) no
se trata como «sin contexto»: el catálogo queda vacío, la sidebar muestra «Unsupported hardware» y el
aviso central nombra el id recibido, en vez de presentar 22 modelos que el host nunca reclamó. La
salida es la de siempre: «Connect MIDI hardware» lista el registro completo y, al elegir un modelo,
el catálogo vuelve acotado a esa familia.

---

## 🏛️ ARQUITECTURA UNIFICADA: Menú "File" y Preset Management (Regla de No-Duplicación)

### ⚠️ Regla de Oro de la Suite ABDSynths
> **Ningún sintetizador consumidor debe implementar un sistema paralelo de persistencia de presets, ficheros en disco o gestión de bancos.**
> Todo el ciclo de vida de presets (bancos, categorías, tags, metadatos, SysEx I/O, IndexedDB, protección de sobreescritura y deduplicación) es **responsabilidad exclusiva de `ABDBankManager`**.

### Mapeo Estándar del Menú "File" del Sintetizador

| Acción del Menú | Atajo | Comportamiento Estándar Unificado |
| :--- | :--- | :--- |
| **`Bank Manager & Librarian...`** | `Ctrl+B` | Abre el modal `BankManagerModal` (`iframeSrc: 'src/components/bank/index.html?model=<modelId>'`). |
| **`New Patch`** | `Ctrl+N` | Reinicia los parámetros del sintetizador al estado *Init* (`bridge.send('initPatch')`). |
| **`Save Patch to Bank...`** | `Ctrl+S` | Abre el Bank Manager enfocado en el banco activo para seleccionar el slot de destino o guardar directamente. |
| **`Open SysEx / Bank...`** | `Ctrl+O` | Abre el Bank Manager activando el selector de importación `.syx` / `.abdlibrary`. |
| **`Export SysEx (.syx)...`** | `Ctrl+E` | Exporta el patch o banco activo en formato estándar `.syx` mediante los adaptadores del contrato. |
| **`Factory Preset Reset`** | — | Restaura el estado a partir de los datos ROM del contrato sin tocar bancos de usuario. |

### 🛡️ Protección contra Sobreescritura y Deduplicación
1. **Bancos de Fábrica Protegidos (`isFactory: true`):** Las capturas y modificaciones nunca machacan la ROM de fábrica; el sistema solicita crear una copia de usuario (`"[Nombre] (Copia)"`).
2. **Confirmación en Bancos Existentes:** Si un banco ya contiene patches, el Bank Manager solicita confirmación explícita antes de sobreescribir o permite crear un banco nuevo de forma segura.
3. **Deduplicación Automática:** Los volcados son evaluados mediante `calculateFingerprint` para evitar duplicados redundantes en la base de datos.

---

### PASO 6: Integración C++ — \ABDBankManagerCore\ en \BridgeActions.cpp\

Para que el Bank Manager pueda capturar y enviar patches usando la librería **\ABDBankManagerCore\** (en lugar de lógica custom), el \BridgeActions.cpp\ del sintetizador debe usar la API unificada.

#### 6.1 CMakeLists.txt — Integración de la Librería

**Opción A — Desarrollo Local (FetchContent, Recomendado):**

\`cmake
# En CMakeLists.txt del plugin consumidor
include(FetchContent)
FetchContent_Declare(
  ABDBankManager
  GIT_REPOSITORY https://github.com/ajabadia/ABDBankManager.git
  GIT_TAG        v0.2.0-lib   # o main para desarrollo
)
FetchContent_MakeAvailable(ABDBankManager)

# Link automático con los mismos flags del plugin consumidor
target_link_libraries(\ PRIVATE ABDBankManager::ABDBankManagerCore)
\`

**Opción B — CI/CD con Binario Precompilado:**

\`cmake
# Solo en pipelines de CI/CD donde ABDBankManager esté instalado en el sistema
find_package(ABDBankManager 0.2 REQUIRED)
target_link_libraries(\ PRIVATE ABDBankManager::ABDBankManagerCore)
\`

> **Includes requeridos (ambas vías):**
> \`cpp
> #include <ABDBankManager/BankManagerCore.h>
> #include <ABDBankManager/ParameterRegistry.gen.h>
> #include <ABDBankManager/BuildVersion.h>
> \`

---

#### 6.2 BridgeActions.cpp — Uso de \ABD::BankManager::BankManagerCore\

Reemplaza la lógica custom de extracción/inserción de patches por la API unificada:

\`cpp
#include <ABDBankManager/BankManagerCore.h>
#include <ABDBankManager/ParameterRegistry.gen.h>

// ...

using namespace ABD::BankManager;

// 1. getRawProgramData — Captura patch activo desde APVTS
else if (action == "getRawProgramData")
{
    juce::String name = message.getProperty("name", "Active Patch").toString();

    // Usa la API unificada — devuelve std::vector<uint8_t> con el SysEx completo
    auto rawBytes = BankManagerCore::extractPatchDataFromAPVTS(
        processor_.getAPVTS(),
        name.toStdString()
    );

    juce::MemoryBlock mb(rawBytes.data(), rawBytes.size());

    juce::DynamicObject::Ptr resObj = new juce::DynamicObject();
    resObj->setProperty("dataBase64", mb.toBase64Encoding());
    resObj->setProperty("name", name);
    resObj->setProperty("size", static_cast<int>(rawBytes.size()));
    sendEventToJs("rawProgramDataResponse", juce::var(resObj.get()));
}

// 2. setRawProgramData — Aplica patch desde Bank Manager al APVTS
else if (action == "setRawProgramData")
{
    auto b64 = message.getProperty("dataBase64", "").toString();
    juce::MemoryOutputStream mem;
    if (juce::Base64::convertFromBase64(mem, b64))
    {
        std::vector<uint8_t> rawBytes(
            static_cast<const uint8_t*>(mem.getData()),
            static_cast<const uint8_t*>(mem.getData()) + mem.getDataSize()
        );

        // Aplica el patch usando la API unificada
        bool success = BankManagerCore::applyPatchDataToAPVTS(
            processor_.getAPVTS(),
            rawBytes
        );

        juce::DynamicObject::Ptr resObj = new juce::DynamicObject();
        resObj->setProperty("success", success);
        if (success) {
            sendFullParamSync(); // Sincroniza UI
        }
        sendEventToJs("rawProgramDataApplied", juce::var(resObj.get()));
    }
}

// 3. getAllProgramsData — Volcado completo del banco
else if (action == "getAllProgramsData")
{
    // Serializa la librería completa usando la API unificada
    auto library = BankManagerCore::instance().toWebUIState();
    // ... serializar library.banks a bytes ...
}
\`

> **Ventaja:** Cero lógica custom de SysEx en el plugin. La librería centraliza:
> - Parseo/serialización SysEx por contrato
> - Mapeo APVTS ↔ raw bytes
> - Validación de tamaños y checksums
> - Compatibilidad multi-formato (\.syx\, \.abdbank\, \.abdlibrary\, \.json\)

---

### ⚠️ Checklist de Integración C++ (Obligatorio)

| Paso | Archivo | Acción | Verificación |
|------|---------|--------|--------------|
| 1 | \CMakeLists.txt\ | Añadir \FetchContent\ / \ind_package\ + \	arget_link_libraries\ | \cmake --build\ sin errores de link |
| 2 | \BridgeActions.h\ | Añadir \#include <ABDBankManager/BankManagerCore.h>\ | Compila sin errores de include |
| 3 | \BridgeActions.cpp\ | Reemplazar \getRawProgramData\/\setRawProgramData\ con API unificada | \getRawProgramData\ → devuelve Base64 válido |
| 4 | \SysExManager\ | **Eliminar** lógica custom de \extractPatchDataFromAPVTS\/\pplyPatchDataToAPVTS\ | No duplicación de parseo SysEx |
| 4 | \CMakeLists.txt\ | Asegurar que \ParameterRegistry.gen.h\ se genera antes que \BridgeActions\ | \dd_dependencies\ correcto |

> **Nota:** Si el sintetizador ya tiene \MS2000ProgramData\ / \SysExManager\ custom, **delegar a \ABDBankManagerCore\** y mantener la API legacy como *wrapper* temporal. La migración completa elimina duplicación de lógica de parseo SysEx.

---

### PASO 7: Auto-Update Tauri (Standalone)

Para que la app standalone (\pps/standalone\) reciba actualizaciones automáticas vía GitHub Releases:

\`	oml
# apps/standalone/src-tauri/Cargo.toml
[dependencies]
tauri-plugin-updater = "2"
\`

\`json
// apps/standalone/src-tauri/tauri.conf.json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://github.com/ajabadia/ABDBankManager/releases/latest"],
      "pubkey": "dW50cnVzdGVkX2tleV9oZXJl..."  # Clave pública Ed25519 (generar con \	auri-signer generate -w\)
    }
  }
}
\`

> **Generar claves:** \cargo install tauri-signer && tauri-signer generate -w\ → guarda privada en CI secrets, pública en \	auri.conf.json\.

---

### PASO 8: Formato SysEx propietario ABDSynths (`F0 7D 0A`) — guía replicable

Si tu synth guarda **más o distinto** de lo que cabe en el programa del hardware que emula (ABDMS2000 guarda 384 B con dos timbres completos, el MS2000 real solo 254 B), **no uses la cabecera del hardware**. El formato propietario existe justo para eso y ya está cerrado como referencia:

- **Spec del cable y bloque nativo:** `ABDMS2000/DOCS/ABDSynths_SysEx_Spec.md`
- **Contrato + transporte `native`:** `ABDBankManager/DOCS/BANK_MANAGER_TRANSPORT_MODEL.md` §7.1
- **Guía paso a paso para replicarlo en ABDCZ101 / ABDEep / ABDOmega…:** `ABDBankManager/DOCS/ABDSYNTHS_SYSEX_GUIDE.md`

Esa guía es el checklist completo (qué byte de modelo reservar — `0x0A` ya es ABDMS2000, el siguiente es `0x0B`—, qué codec usar — `pack7to8NoPad`/`unpack7to8NoPad` bit `i`, no el Korg `6-j`—, cómo despachar sin mezclar `F0 7D 0A` y `F0 42…`, el esqueleto `abd-xxxx` con `sysexManufacturerId:[0x7D]` + `sysexModelId:{offset:2,values:[0x0A]}` y `transport.software.systems:['native']`, los 5 verbos del bridge y los tests 19–25 de C++ más las suites JS de §10 que dejan el formato cerrado, incluido el acuse 0x23/0x24 y la convención del canal `3n`). **No la dupliques aquí:** léela y adapta el nombre del contrato/bloque.

---

