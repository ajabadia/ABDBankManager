#!/usr/bin/env node
/**
 * ABD Bank Manager — Verificador de entorno instalado
 *
 * Detecta la deriva silenciosa entre lo que declaran los manifiestos
 * (packageManager, raíz y miembros del monorepo) y lo que hay realmente
 * instalado en node_modules.
 *
 * Por qué existe: durante la migración npm -> pnpm de este repo el árbol
 * instalado siguió siendo de la generación anterior. La suite pasaba en verde
 * (72 ficheros, 1134 tests) mientras node_modules contenía vitest 2.1.9 con
 * tres manifiestos declarando ^4.1.11. Nada en `npm test` delata eso: el rojo
 * de seguridad se arregla en el manifiesto, la suite local sigue verde, y un
 * informe que dice "la suite está verde" puede estar describiendo una
 * generación distinta de la que CI instalará. Este script es el que obliga a
 * que esas dos cosas coincidan antes de fiarse del verde.
 *
 * Reglas:
 *   - Se recogen todos los manifiestos del proyecto: raíz y cada miembro del
 *     workspace declarado en pnpm-workspace.yaml (o, si no existe, del campo
 *     workspaces de la raíz). Los patrones tipo "packages/*" se expanden.
 *   - Para cada dependencia declarada (dependencies + devDependencies) se
 *     busca la instalación real subiendo por la cadena de directorios:
 *     packages/contracts/node_modules, luego el de la raíz. Replica la
 *     resolución de Node y de pnpm en un árbol con .pnpm/.
 *   - Una dependencia NO INSTALADA es AVISO, no error: permite trees parciales
 *     deliberados sin mentir sobre la deriva real.
 *   - Una dependencia instalada que NO satisface el rango declarado es ERROR:
 *     es exactamente la deriva que hay que ver.
 *   - El campo packageManager se contrasta con el gestor que delata el árbol
 *     instalado (node_modules/.pnpm o .modules.yaml frente a
 *     .package-lock.json), no con lo que diga un lockfile.
 *
 * Salida: exit 0 si no hay errores; exit 1 si hay al menos un ERROR.
 * Uso: node scripts/verificar-entorno.mjs   (también: npm run verificar:entorno)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizPorDefecto = path.resolve(aqui, '..');

// ---------------------------------------------------------------------------
// Semver mínimo: cubre los rangos que aparecen en los manifiestos de este
// repo (caret, tilde, exacto, >=, comparadores con espacio y alternativas ||).
// No es una implementación completa de semver y no pretende serlo: ante un
// rango que no reconoce, degrada a "no verificable" y lo dice, en vez de
// aprobar en silencio.
// ---------------------------------------------------------------------------

const OPERADORES = ['>=', '<=', '^', '~', '>', '<', '='];

/** Parsea una versión simple: "4.1.11", "v2.0", "1.0.0-beta.1". */
export function partirVersion(bruto) {
  const texto = String(bruto).trim().replace(/^v/, '');
  const m = texto.match(/^(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { op: '=', partes: m[1].split('.').map(Number), pre: m[2] || null };
}

/** Divide un rango ">=1.2.3 <2.0.0" en la lista de comparadores que lo forman. */
export function partirRango(rango) {
  const piezas = String(rango)
    .trim()
    .match(/(\^|~|>=|<=|>|<|=)?\s*(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/g);
  if (!piezas) return null;
  const out = [];
  for (const pieza of piezas) {
    const m = pieza.match(/(\^|~|>=|<=|>|<|=)?\s*(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/);
    if (!m) continue;
    out.push({ op: m[1] || '=', partes: m[2].split('.').map(Number), pre: m[3] || null });
  }
  return out.length ? out : null;
}

const aTres = (partes) => {
  const n = Array.from(partes);
  while (n.length < 3) n.push(0);
  return n.slice(0, 3);
};

function comparar(a, b) {
  const va = aTres(a.partes);
  const vb = aTres(b.partes);
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] < vb[i] ? -1 : 1;
  }
  // Mismo número, distinto prerelease: el que lo tiene se trata como menor.
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre < b.pre ? -1 : 1;
}

/**
 * @returns {{ ok: boolean, conocido: boolean }}
 *   conocido=false cuando el rango no se sabe interpretar; entonces no se
 *   afirma ni que se cumple ni que se incumple.
 */
export function satisface(version, rango) {
  const v = partirVersion(version);
  if (!v) return { ok: false, conocido: false };
  const alternativas = String(rango)
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!alternativas.length) return { ok: false, conocido: false };

  let interpretables = 0;
  for (const alt of alternativas) {
    const comparadores = partirRango(alt);
    if (!comparadores) continue;
    interpretables++;
    let ok = true;
    for (const c of comparadores) {
      const cmp = comparar(v, c);
      switch (c.op) {
        case '>=':
          ok = ok && cmp >= 0;
          break;
        case '<=':
          ok = ok && cmp <= 0;
          break;
        case '>':
          ok = ok && cmp > 0;
          break;
        case '<':
          ok = ok && cmp < 0;
          break;
        case '=':
          ok = ok && cmp === 0;
          break;
        case '^': {
          const [a, b] = aTres(c.partes);
          ok = ok && cmp >= 0 && v.partes[0] === a;
          if (a === 0) ok = ok && (v.partes[1] || 0) === b;
          break;
        }
        case '~': {
          const [a, b] = aTres(c.partes);
          ok = ok && cmp >= 0 && v.partes[0] === a && (v.partes[1] || 0) === b;
          break;
        }
        default:
          ok = false;
      }
      if (!ok) break;
    }
    if (ok) return { ok: true, conocido: true };
  }
  return { ok: false, conocido: interpretables > 0 };
}

// ---------------------------------------------------------------------------
// Descubrimiento de manifiestos y resolución de instalaciones
// ---------------------------------------------------------------------------

function leerJson(f) {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

/** Lee pnpm-workspace.yaml sin dependencia: solo la lista bajo "packages:". */
function patronesWorkspace(base) {
  const yaml = path.join(base, 'pnpm-workspace.yaml');
  if (fs.existsSync(yaml)) {
    const texto = fs.readFileSync(yaml, 'utf8');
    const lineas = texto.split(/\r?\n/);
    const patrones = [];
    let dentro = false;
    for (const linea of lineas) {
      if (/^\s*packages\s*:/.test(linea)) {
        dentro = true;
        continue;
      }
      if (!dentro) continue;
      const m = linea.match(/^\s+-\s*['"]?([^'"\n#]+?)['"]?\s*$/);
      if (m) {
        patrones.push(m[1].trim());
        continue;
      }
      if (linea.trim() === '') continue;
      dentro = false;
    }
    if (patrones.length) return patrones;
  }
  const pkg = leerJson(path.join(base, 'package.json'));
  return pkg?.workspaces ?? [];
}

/** Expande "packages/*" leyendo el disco; los patrones sin comodín se usan tal cual. */
export function miembrosWorkspace(base = raizPorDefecto) {
  const vistos = new Set();
  const out = [];
  for (const patron of patronesWorkspace(base)) {
    if (!patron || typeof patron !== 'string') continue;
    if (patron.includes('*')) {
      const dir = path.join(base, patron.split('*')[0].replace(/[/\\]+$/, ''));
      if (!fs.existsSync(dir)) continue;
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entrada.isDirectory()) continue;
        const p = path.join(dir, entrada.name, 'package.json');
        if (fs.existsSync(p) && !vistos.has(p)) {
          vistos.add(p);
          out.push(p);
        }
      }
    } else {
      const p = path.join(base, patron, 'package.json');
      if (fs.existsSync(p) && !vistos.has(p)) {
        vistos.add(p);
        out.push(p);
      }
    }
  }
  return out;
}

/** Busca el package.json de un paquete instalado subiendo desde `desde`. */
export function instaladoEn(desde, nombre, base = raizPorDefecto) {
  let dir = path.resolve(desde);
  for (;;) {
    const cand = path.join(dir, 'node_modules', nombre, 'package.json');
    if (fs.existsSync(cand)) return cand;
    if (dir === base) return null;
    const padre = path.dirname(dir);
    if (padre === dir || !dir.startsWith(base + path.sep)) return null;
    dir = padre;
  }
}

/** Marcas que delatan qué gestor construyó el árbol instalado. */
export function gestorDelArbol(base = raizPorDefecto) {
  const marcas = [];
  const nm = path.join(base, 'node_modules');
  if (fs.existsSync(path.join(nm, '.pnpm'))) marcas.push('pnpm (.pnpm/)');
  if (fs.existsSync(path.join(nm, '.modules.yaml'))) marcas.push('pnpm (.modules.yaml)');
  if (fs.existsSync(path.join(nm, '.package-lock.json'))) marcas.push('npm (.package-lock.json)');
  return marcas;
}

// ---------------------------------------------------------------------------
// Comprobación
// ---------------------------------------------------------------------------

export function verificar({ base = raizPorDefecto } = {}) {
  const errores = [];
  const avisos = [];
  const comprobados = [];

  const raizPkg = leerJson(path.join(base, 'package.json'));
  const manifiestos = [
    ...(raizPkg ? [{ etiqueta: 'raiz', dir: base, pkg: raizPkg }] : []),
    ...miembrosWorkspace(base).map((p) => {
      const dir = path.dirname(p);
      return {
        etiqueta: path.relative(base, dir).split(path.sep).join('/') || '.',
        dir,
        pkg: leerJson(p),
      };
    }),
  ].filter((m) => m.pkg);

  for (const { etiqueta, dir, pkg } of manifiestos) {
    const secciones = [
      ['dependencies', pkg.dependencies],
      ['devDependencies', pkg.devDependencies],
    ];
    for (const [seccion, deps] of secciones) {
      for (const [nombre, rango] of Object.entries(deps ?? {})) {
        if (typeof rango !== 'string') {
          avisos.push(`${etiqueta}: ${seccion} ${nombre} tiene un rango no textual (${JSON.stringify(rango)})`);
          continue;
        }
        const encontrado = instaladoEn(dir, nombre, base);
        if (!encontrado) {
          avisos.push(`${etiqueta}: ${seccion} ${nombre}@${rango} no esta instalado`);
          continue;
        }
        const real = leerJson(encontrado);
        const version = real?.version;
        if (!version) {
          avisos.push(`${etiqueta}: ${nombre} instalado sin version legible (${encontrado})`);
          continue;
        }
        const ver = satisface(version, rango);
        comprobados.push({ etiqueta, seccion, nombre, rango, version, conocido: ver.conocido });
        if (!ver.ok && ver.conocido) {
          errores.push(
            `${etiqueta}: ${seccion} ${nombre} declara ${rango} pero hay ${version} instalado`,
          );
        }
      }
    }
  }

  const declarado = raizPkg?.packageManager;
  const marcas = gestorDelArbol(base);
  if (declarado && marcas.length) {
    const dice = String(declarado).split('@')[0];
    if (!marcas.some((m) => m.startsWith(dice))) {
      // AVISO y no error, a proposito: durante la migracion npm -> pnpm es
      // legitimo que ci.yml siga con `npm ci` y por tanto produzca un arbol
      // de npm mientras el manifiesto ya declara pnpm. Fallar aqui dejaria el
      // CI rojo por una discrepancia que todavia no se ha decidido. Lo que si
      // es un error es la deriva de versiones, que no admite dos lecturas.
      avisos.push(
        `raiz: packageManager declara ${declarado} pero el arbol instalado es de ` +
          `${marcas.join(' + ')} (el CI puede seguir con npm durante la migracion)`,
      );
    }
  }

  return { errores, avisos, comprobados, gestor: marcas, declarado };
}

function main() {
  const r = verificar();
  const total = r.comprobados.length;
  const incognitos = r.comprobados.filter((c) => !c.conocido).length;

  for (const a of r.avisos) console.log(`AVISO  ${a}`);
  for (const e of r.errores) console.log(`ERROR  ${e}`);

  console.log('');
  console.log(`manifiesto      ${r.declarado ?? '(sin packageManager)'}`);
  console.log(`arbol instalado ${r.gestor.length ? r.gestor.join(' + ') : '(sin marcas de gestor)'}`);
  console.log(`comprobados     ${total} dependencias`);
  console.log(
    `deriva          ${r.errores.length} error(es), ${r.avisos.length} aviso(s), ` +
      `${total - incognitos} rango(s) verificados`,
  );

  if (r.errores.length) {
    console.log('');
    console.log('DERIVA DETECTADA: el arbol instalado no corresponde a los manifiestos.');
    console.log('Un "npm test" en verde aqui no describe lo que CI instalara.');
    process.exitCode = 1;
    return;
  }

  // El corte F4 (DOCS/bank-manager-module-cut.md) dejo Source/Contracts como
  // shim hacia ../ABDSharedCode/BankManager/Contracts: sin el hermano clonado
  // al lado, `npm run generate` y la suite mueren en "Could not resolve" de
  // esbuild. Aqui el aviso llega antes y con la accion escrita. Va en main()
  // y no en verificar(): verificar() es una funcion pura sobre un arbol
  // fixture y sus tests exigen que no conoce nada fuera de ese arbol.
  const canonico = path.resolve(raizPorDefecto, '..', 'ABDSharedCode', 'BankManager', 'Contracts', 'index.ts');
  if (!fs.existsSync(canonico)) {
    console.log(`ERROR  falta ${canonico}`);
    console.log('');
    console.log('ENTORNO INCOMPLETO: Source/Contracts es un shim hacia ../ABDSharedCode (corte F4).');
    console.log('Clona ABDSharedCode al lado (ci.yml lo hace en los jobs npm) y vuelve a lanzar.');
    process.exitCode = 1;
    return;
  }
  console.log('OK: el arbol instalado corresponde a los manifiestos.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}