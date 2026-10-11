/**
 * Panel de diagnóstico del anfitrión (sello de build + nivel de protocolo).
 *
 * Lo que se cubre es lo que el usuario necesita poder leer sin adivinar:
 *  - embebido con ficha: el sello de build y el nivel de puente están a la vista;
 *  - sin ficha pero con host vivo: se distingue «contestó pero no se identifica»
 *    de «no contestó nada» (builds anteriores a la ficha vs. anteriores al canal);
 *  - standalone: no hay host, así que no hay chip que mostrar;
 *  - cada nivel de puente se traduce a la capacidad que habilita (2/3/4, el
 *    contrato del PASO 5.1 de la guía), incluidas las que el host no reporta.
 */

import { describe, it, expect } from 'vitest';
import {
  HOST_DIAG_CHIP_ID,
  HOST_DIAG_PANEL_ID,
  BANK_MANAGER_KNOWN_PROTOCOL,
  BRIDGE_PROTOCOL_LEVELS,
  describeHostProtocol,
  hostDiagnosticsModel,
  hostDiagnosticsPanel
} from '../../src/ui/hostDiagnostics.js';

const fullHost = {
  modelId: 'abd-sm002',
  displayName: 'ABD MS2000 (SM002)',
  manufacturer: 'ABDSynths',
  protocol: 4,
  buildStamp: 'Sep 12 2026 12:06:00',
  buildRevision: '5b7d69ce9'
};

describe('niveles de puente del anfitrión', () => {
  it('traduce cada nivel a la capacidad que habilita', () => {
    expect(describeHostProtocol(4).capabilities.map(c => c.level)).toEqual([2, 3, 4]);
    expect(describeHostProtocol(3).capabilities.map(c => c.level)).toEqual([2, 3]);
    expect(describeHostProtocol(2).capabilities.map(c => c.level)).toEqual([2]);
    expect(describeHostProtocol(2).missing.map(c => c.level)).toEqual([3, 4]);
  });

  it('sin nivel reportado, todo queda por reportar (no se asume nada)', () => {
    const unknown = describeHostProtocol(null);
    expect(unknown.reported).toBe(false);
    expect(unknown.level).toBeNull();
    expect(unknown.capabilities).toEqual([]);
    expect(unknown.missing).toHaveLength(BRIDGE_PROTOCOL_LEVELS.length);
  });

  it('un nivel por encima del que este build conoce se marca como más nuevo', () => {
    const ahead = describeHostProtocol(BANK_MANAGER_KNOWN_PROTOCOL + 1);
    expect(ahead.unknownToUs).toBe(true);
    expect(describeHostProtocol(BANK_MANAGER_KNOWN_PROTOCOL).unknownToUs).toBe(false);
  });
});

describe('modelo del panel de diagnóstico', () => {
  it('embebido con ficha: el chip lleva el sello de build y el nivel de protocolo', () => {
    const model = hostDiagnosticsModel({ hostInfo: fullHost, embedded: true, bridgeType: 'plugin-host' });

    expect(model.state).toBe('ok');
    expect(model.chipLabel).toContain('Sep 12 2026 12:06:00');
    expect(model.chipLabel).toContain('protocol 4');

    const rows = Object.fromEntries(model.rows.map(r => [r.label, r.value]));
    expect(rows['Host']).toBe('ABD MS2000 (SM002) (abd-sm002)');
    expect(rows['Build stamp']).toBe('Sep 12 2026 12:06:00');
    expect(rows['Build revision']).toBe('5b7d69ce9');
    expect(rows['Bridge protocol']).toBe('4');
    expect(rows['Bridge']).toBe('plugin-host');
  });

  it('la ficha sin sello no se lee como un host mudo', () => {
    const model = hostDiagnosticsModel({
      hostInfo: { modelId: 'abd-sm002', displayName: 'ABD MS2000 (SM002)' },
      embedded: true
    });

    expect(model.state).toBe('unsigned');
    expect(model.headline).toMatch(/predates the host info handshake/i);
    expect(model.chipLabel).toMatch(/no build stamp/i);
  });

  it('un host que contesta el bridge pero no se identifica se distingue del silencioso', () => {
    const answered = hostDiagnosticsModel({ embedded: true, answered: true });
    const silent = hostDiagnosticsModel({ embedded: true, answered: false });

    expect(answered.state).toBe('unidentified');
    expect(answered.headline).toMatch(/hostModel/);
    expect(silent.state).toBe('silent');
    expect(silent.headline).toMatch(/has not answered the bridge handshake/i);
    // Dos diagnósticos distintos no pueden compartir chip.
    expect(answered.chipLabel).not.toBe(silent.chipLabel);
  });

  it('standalone: no hay host que diagnosticar (ni chip)', () => {
    const model = hostDiagnosticsModel({ embedded: false, bridgeType: 'mock' });

    expect(model.state).toBe('standalone');
    expect(model.chipLabel).toBeNull();
    expect(hostDiagnosticsPanel(model)).toBe('');
  });
});

describe('panel de diagnóstico (HTML)', () => {
  it('publica el estado y las capacidades soportadas y no soportadas', () => {
    const html = hostDiagnosticsPanel(hostDiagnosticsModel({
      hostInfo: { ...fullHost, protocol: 2 },
      embedded: true,
      bridgeType: 'plugin-host'
    }));

    expect(html).toContain(`id="${HOST_DIAG_PANEL_ID}"`);
    expect(html).toContain('data-host-diag-state="ok"');
    expect(html).toContain('Sep 12 2026 12:06:00');
    // Nivel 2: anuncia, pero no responde la ficha ni mueve bytes.
    expect(html).toContain('announces its modelId');
    expect(html).toMatch(/not reported: answers the host info handshake/);
    expect(html).toMatch(/not reported: moves bytes over the hardware MIDI bridge/);
  });

  it('avisa cuando el host habla un nivel más nuevo del que este build conoce', () => {
    const html = hostDiagnosticsPanel(hostDiagnosticsModel({
      hostInfo: { ...fullHost, protocol: BANK_MANAGER_KNOWN_PROTOCOL + 1 },
      embedded: true
    }));

    expect(html).toMatch(/newer than the 4 this Bank Manager build knows/i);
  });

  it('escapa lo que viene del host', () => {
    const html = hostDiagnosticsPanel(hostDiagnosticsModel({
      hostInfo: { ...fullHost, displayName: '<b>MS2000</b>', modelId: 'x&y' },
      embedded: true
    }));

    expect(html).toContain('&lt;b&gt;MS2000&lt;/b&gt;');
    expect(html).not.toContain('<b>MS2000</b>');
    expect(html).toContain('x&amp;y');
  });

  it('los ids del chip y del panel son los que app.js cablea', () => {
    expect(HOST_DIAG_CHIP_ID).toBe('host-diag');
    expect(HOST_DIAG_PANEL_ID).toBe('host-diagnostics');
  });
});
