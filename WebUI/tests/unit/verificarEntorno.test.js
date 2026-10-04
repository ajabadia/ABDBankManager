/**
 * Tests del verificador de entorno instalado (Scripts/verificar-entorno.mjs).
 *
 * Contexto: durante la migración npm -> pnpm el árbol instalado quedó en la
 * generación anterior. La suite pasaba en verde mientras vitest instalado era
 * 2.1.9 y los tres manifiestos declaraban ^4.1.11. Estos tests fijan que el
 * detector ve esa deriva, para que el rojo no dependa de que alguien mire.
 *
 * Todo se monta en un árbol sintético en os.tmpdir(): el test nunca toca el
 * node_modules real, ni la instalación real, ni necesita red.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  satisface,
  partirVersion,
  partirRango,
  miembrosWorkspace,
  instaladoEn,
  gestorDelArbol,
  verificar,
} from '../../../scripts/verificar-entorno.mjs';

// ---------------------------------------------------------------------------
// Arena sintética
// ---------------------------------------------------------------------------

let raiz = null;

function escribir(rel, contenido) {
  const destino = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, typeof contenido === 'string' ? contenido : JSON.stringify(contenido, null, 2));
}

function pkgInstalado(where, nombre, version) {
  escribir(path.join(where, 'node_modules', nombre, 'package.json'), { name: nombre, version });
}

beforeEach(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'abdm-entorno-'));
});

afterEach(() => {
  fs.rmSync(raiz, { recursive: true, force: true });
  raiz = null;
});

// ---------------------------------------------------------------------------
// Semver mínima
// ---------------------------------------------------------------------------

describe('satisface', () => {
  it('acepta una version dentro del caret', () => {
    expect(satisface('4.1.11', '^4.1.11')).toEqual({ ok: true, conocido: true });
    expect(satisface('4.9.0', '^4.1.11').ok).toBe(true);
    expect(satisface('4.1.0', '^4.1.11').ok).toBe(false);
  });

  it('rechaza un salto de mayor en el caret', () => {
    // El caso que lo motivo: 2.1.9 no pertenece a ^4.1.11.
    expect(satisface('2.1.9', '^4.1.11')).toEqual({ ok: false, conocido: true });
    expect(satisface('5.0.0', '^4.1.11').ok).toBe(false);
  });

  it('aplica la regla del cero mayor en el caret', () => {
    expect(satisface('0.28.2', '^0.28.2').ok).toBe(true);
    expect(satisface('0.29.0', '^0.28.2').ok).toBe(false);
    expect(satisface('1.0.0', '^0.28.2').ok).toBe(false);
  });

  it('entiende tilde, exacto y comparadores', () => {
    expect(satisface('1.2.9', '~1.2.3').ok).toBe(true);
    expect(satisface('1.3.0', '~1.2.3').ok).toBe(false);
    expect(satisface('3.0.0', '>=3.0.0').ok).toBe(true);
    expect(satisface('2.9.9', '>=3.0.0').ok).toBe(false);
    expect(satisface('2.0.0', '2.0.0').ok).toBe(true);
    expect(satisface('2.0.1', '2.0.0').ok).toBe(false);
    expect(satisface('1.5.0', '>=1.2.3 <2.0.0').ok).toBe(true);
    expect(satisface('2.0.1', '>=1.2.3 <2.0.0').ok).toBe(false);
  });

  it('entiende alternativas con doble barra vertical', () => {
    expect(satisface('3.0.0', '^2.0.0 || ^3.0.0').ok).toBe(true);
    expect(satisface('4.0.0', '^2.0.0 || ^3.0.0').ok).toBe(false);
  });

  it('compara versiones con distinta numero de segmentos', () => {
    expect(satisface('8.2', '^8.0.0').ok).toBe(true);
    expect(satisface('4.1.11', '^4.1').ok).toBe(true);
  });

  it('normaliza el prefijo v', () => {
    expect(satisface('v4.1.11', '^4.1.11').ok).toBe(true);
    expect(partirVersion('v4.1.11').partes).toEqual([4, 1, 11]);
  });

  it('no afirma nada ante un rango que no sabe interpretar', () => {
    // Un rango sin version (latest, *, workspace:*) no se verifica: se
    // degrada a conocido:false, que verificar() traduce en "ni error ni
    // aprobado en silencio". Inventarse un veredicto seria peor que callarse.
    for (const rango of ['latest', '*', 'workspace:*', 'next']) {
      const r = satisface('1.0.0', rango);
      expect(r.ok).toBe(false);
      expect(r.conocido).toBe(false);
    }

    const sinVersion = satisface('no-es-version', '^1.0.0');
    expect(sinVersion.ok).toBe(false);
    expect(sinVersion.conocido).toBe(false);
  });

  it('un rango no verificable no se convierte en error de deriva', () => {
    escribir('package.json', {
      name: 'raiz',
      packageManager: 'pnpm@10.25.0',
      devDependencies: { algo: 'latest' },
    });
    pkgInstalado('', 'algo', '9.9.9');
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');

    const r = verificar({ base: raiz });
    expect(r.errores).toEqual([]);
    expect(r.comprobados[0].conocido).toBe(false);
  });

  it('parte un rango en varios comparadores', () => {
    const partes = partirRango('>=1.2.3 <2.0.0');
    expect(partes).toHaveLength(2);
    expect(partes[0].op).toBe('>=');
    expect(partes[1].op).toBe('<');
  });
});

// ---------------------------------------------------------------------------
// Descubrimiento de manifiestos
// ---------------------------------------------------------------------------

describe('miembrosWorkspace', () => {
  it('expande pnpm-workspace.yaml leyendo el disco', () => {
    escribir('package.json', { name: 'raiz' });
    escribir('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    escribir('packages/contracts/package.json', { name: 'contracts' });
    escribir('packages/core/package.json', { name: 'core' });

    const miembros = miembrosWorkspace(raiz).map((p) => path.basename(path.dirname(p)));
    expect(miembros.sort()).toEqual(['contracts', 'core']);
  });

  it('cae al campo workspaces de la raiz si no hay yaml', () => {
    escribir('package.json', { name: 'raiz', workspaces: ['packages/*'] });
    escribir('packages/ui/package.json', { name: 'ui' });

    const miembros = miembrosWorkspace(raiz);
    expect(miembros).toHaveLength(1);
    expect(miembros[0]).toContain(path.join('packages', 'ui', 'package.json'));
  });

  it('no se cuela en patrones que no son de paquete', () => {
    escribir('package.json', { name: 'raiz' });
    escribir('pnpm-workspace.yaml', "packages:\n  - 'scripts'\n  - '!scripts/ignorar'\n");
    escribir('scripts/package.json', { name: 'scripts' });

    // El yaml con un patron que si es paquete lo recoge; el negated se ignora
    // porque no resuelve a un directorio existente.
    expect(miembrosWorkspace(raiz)).toHaveLength(1);
  });

  it('devuelve vacio si no hay nada', () => {
    escribir('package.json', { name: 'raiz' });
    expect(miembrosWorkspace(raiz)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Resolucion de instalaciones
// ---------------------------------------------------------------------------

describe('instaladoEn', () => {
  it('sube por la cadena de directorios hasta la raiz', () => {
    escribir('package.json', { name: 'raiz' });
    escribir('packages/contracts/package.json', { name: 'contracts' });
    pkgInstalado('', 'vitest', '4.1.11');

    const desde = path.join(raiz, 'packages', 'contracts');
    const encontrado = instaladoEn(desde, 'vitest', raiz);
    expect(encontrado).toBe(path.join(raiz, 'node_modules', 'vitest', 'package.json'));
  });

  it('prefiere la instalacion del miembro si existe', () => {
    escribir('package.json', { name: 'raiz' });
    escribir('packages/core/package.json', { name: 'core' });
    pkgInstalado('', 'vitest', '2.1.9');
    pkgInstalado(path.join('packages', 'core'), 'vitest', '4.1.11');

    const encontrado = instaladoEn(path.join(raiz, 'packages', 'core'), 'vitest', raiz);
    expect(encontrado).toContain(path.join('packages', 'core', 'node_modules'));
  });

  it('devuelve null si el paquete no esta en ninguna parte', () => {
    escribir('package.json', { name: 'raiz' });
    expect(instaladoEn(raiz, 'nada-de-esto', raiz)).toBeNull();
  });

  it('no se sale de la raiz del proyecto', () => {
    escribir('package.json', { name: 'raiz' });
    // Un paquete instalado por encima de la raiz no debe contar.
    expect(instaladoEn(path.join(raiz, 'a', 'b', 'c'), 'path', raiz)).toBeNull();
  });
});

describe('gestorDelArbol', () => {
  it('reconoce un arbol de pnpm', () => {
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');
    expect(gestorDelArbol(raiz).join(' ')).toContain('pnpm');
  });

  it('reconoce un arbol de npm', () => {
    escribir('node_modules/.package-lock.json', '{}');
    expect(gestorDelArbol(raiz)).toContain('npm (.package-lock.json)');
  });

  it('no inventa marcas si no hay node_modules', () => {
    expect(gestorDelArbol(raiz)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// La comprobacion completa: esto es lo que se ejecuta en la vida real
// ---------------------------------------------------------------------------

describe('verificar', () => {
  it('no reporta deriva cuando el arbol coincide con los manifiestos', () => {
    escribir('package.json', {
      name: 'raiz',
      packageManager: 'pnpm@10.25.0',
      devDependencies: { vitest: '^4.1.11' },
    });
    escribir('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    escribir('packages/core/package.json', { name: 'core', devDependencies: { vitest: '^4.1.11' } });
    pkgInstalado('', 'vitest', '4.1.11');
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');

    const r = verificar({ base: raiz });
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.comprobados).toHaveLength(2);
  });

  it('detecta la deriva de vitest 2.1.9 contra un manifiesto ^4.1.11', () => {
    escribir('package.json', {
      name: 'raiz',
      packageManager: 'pnpm@10.25.0',
      devDependencies: { vitest: '^4.1.11' },
    });
    escribir('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    escribir('packages/contracts/package.json', { name: 'contracts', devDependencies: { vitest: '^4.1.11' } });
    escribir('packages/core/package.json', { name: 'core', devDependencies: { vitest: '^4.1.11' } });
    pkgInstalado('', 'vitest', '2.1.9');
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');

    const r = verificar({ base: raiz });
    // Los tres manifiestos, no solo la raiz: es el fallo que se dio.
    expect(r.errores).toHaveLength(3);
    for (const e of r.errores) expect(e).toContain('2.1.9');
    expect(r.errores.some((e) => e.startsWith('raiz:'))).toBe(true);
    expect(r.errores.some((e) => e.startsWith('packages/contracts:'))).toBe(true);
    expect(r.errores.some((e) => e.startsWith('packages/core:'))).toBe(true);
  });

  it('avisa, sin fallar, de una dependencia no instalada', () => {
    escribir('package.json', {
      name: 'raiz',
      packageManager: 'pnpm@10.25.0',
      devDependencies: { vitest: '^4.1.11' },
    });
    pkgInstalado('', 'vitest', '4.1.11');
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');

    const r = verificar({ base: raiz });
    expect(r.errores).toEqual([]);
    expect(r.avisos).toHaveLength(0);
  });

  it('avisa de lo no instalado en vez de trippingar en silencio', () => {
    escribir('package.json', {
      name: 'raiz',
      packageManager: 'pnpm@10.25.0',
      devDependencies: { vitest: '^4.1.11', 'algo-que-no-esta': '^1.0.0' },
    });
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');

    const r = verificar({ base: raiz });
    expect(r.errores).toEqual([]);
    expect(r.avisos.some((a) => a.includes('algo-que-no-esta'))).toBe(true);
  });

  it('avisa, sin fallar, si el gestor del arbol no es el de packageManager', () => {
    escribir('package.json', { name: 'raiz', packageManager: 'pnpm@10.25.0' });
    escribir('node_modules/.package-lock.json', '{}');

    // Aviso y no error: mientras la migracion npm -> pnpm no aterrice, que
    // ci.yml siga con npm ci es legitimo y no debe poner el job en rojo.
    const r = verificar({ base: raiz });
    expect(r.errores).toEqual([]);
    expect(r.avisos.some((a) => a.includes('packageManager'))).toBe(true);
  });

  it('detecta esbuild declarado sin instalar la version pedida', () => {
    escribir('package.json', {
      name: 'raiz',
      packageManager: 'pnpm@10.25.0',
      devDependencies: { esbuild: '^0.28.2' },
    });
    pkgInstalado('', 'esbuild', '0.21.5');
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');

    const r = verificar({ base: raiz });
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain('0.28.2');
    expect(r.errores[0]).toContain('0.21.5');
  });

  it('separa dependencies de devDependencies en el mensaje', () => {
    escribir('package.json', {
      name: 'raiz',
      packageManager: 'pnpm@10.25.0',
      dependencies: { zod: '^3.22.0' },
      devDependencies: { vitest: '^4.1.11' },
    });
    pkgInstalado('', 'zod', '3.0.0');
    pkgInstalado('', 'vitest', '4.1.11');
    escribir('node_modules/.modules.yaml', 'nodeLinker: isolated\n');

    const r = verificar({ base: raiz });
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain('dependencies zod');
  });

  it('no se rompe con un manifiesto ilegible', () => {
    escribir('package.json', '{ esto no es json');
    const r = verificar({ base: raiz });
    expect(Array.isArray(r.errores)).toBe(true);
    expect(Array.isArray(r.avisos)).toBe(true);
  });
});