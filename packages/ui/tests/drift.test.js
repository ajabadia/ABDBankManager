/**
 * Anti-drift guard: the distributed package (@abdsynths/bank-manager-ui) and
 * the static-served WebUI copy of BankManagerModal must stay byte-identical.
 *
 * Flow: edits land in packages/ui/src (canonical) and are mirrored to
 * WebUI/src/components for static serving (sirv + importmap). If this test
 * fails, re-copy from packages/ui/src or update the canonical file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');

const PAIRS = [
  ['packages/ui/src/BankManagerModal.js', 'WebUI/src/components/BankManagerModal.js'],
  ['packages/ui/src/BankManagerModal.css', 'WebUI/src/components/BankManagerModal.css']
];

describe('BankManagerModal anti-drift (packages/ui ↔ WebUI copy)', () => {
  for (const [pkgFile, webuiFile] of PAIRS) {
    it(`${webuiFile} matches ${pkgFile} byte-for-byte`, () => {
      const pkg = readFileSync(join(ROOT, pkgFile));
      const webui = readFileSync(join(ROOT, webuiFile));
      expect(webui.equals(pkg)).toBe(true);
    });
  }
});

// El motor de foco del canónico va INLINE (la WebUI estática no resuelve
// @abdsynths/shared): es la misma semántica que ABDSharedAssets/components/
// overlayFocus.js — cajón compartido, slideDrawer de MS2000, block-drawer de
// CZ101. Estas comprobaciones impiden que un vendor antiguo (o una edición a
// mano) pierda las piezas del contrato: sin ellas, el modal queda fuera de la
// tabulación al cerrar, Tab se escapa del dialogo abierto o el foco no vuelve
// al disparador.
describe('BankManagerModal: invariantes del contrato de foco (overlayFocus)', () => {
  const source = readFileSync(join(ROOT, 'packages/ui/src/BankManagerModal.js'), 'utf8');

  it('trae las piezas del contrato (inert, trampa de Tab, disparador, primer control)', () => {
    for (const piece of [
      "root.setAttribute('inert', '')",      // cerrado: fuera de tabulacion
      "root.removeAttribute('inert')",       // abierto: de vuelta al documento
      'trapTab',                             // Tab cicla y no se escapa
      'rememberTrigger',                     // apunta el disparador al abrir
      'restoreFocus',                        // foco al disparador al cerrar
      'focusFirst',                          // foco al primer control al abrir
      "event.key === 'Escape'",              // Escape pide el cierre
    ]) {
      expect(source).toContain(piece);
    }
  });

  it('el orden del contrato: foco ANTES del inert al cerrar; disparador ANTES de soltarlo al abrir', () => {
    // El constructor TAMBIEN llama a setInert (nace cerrado: nace inerte), asi
    // que el orden se mira DENTRO de cada metodo, no en todo el fichero.
    const closeStart = source.indexOf('  close() {');
    const restore = source.indexOf('this._focusContract.restoreFocus();', closeStart);
    const inert = source.indexOf('this._focusContract.setInert();', closeStart);
    expect(restore).toBeGreaterThan(-1);
    expect(inert).toBeGreaterThan(restore);

    const openStart = source.indexOf('  open() {');
    const trigger = source.indexOf('this._focusContract.rememberTrigger();', openStart);
    const release = source.indexOf('this._focusContract.releaseInert();', openStart);
    expect(trigger).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(trigger);
  });
});
