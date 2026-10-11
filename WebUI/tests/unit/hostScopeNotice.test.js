/**
 * Textos del aviso de ámbito del anfitrión (panel de bienvenida + sidebar).
 *
 * Los tres estados tienen que leerse distinto, porque piden cosas distintas:
 *  - `awaiting`    — todavía esperando al host (milisegundos, no es un fallo);
 *  - `expired`     — el anfitrión no anunció nada: hay que decir qué hacer
 *                    (conectar MIDI) y por qué puede pasar (build del host
 *                    anterior a este Bank Manager);
 *  - `unsupported` — el host respondió con un modelId que este build no conoce.
 *
 * Regresión cubierta: el aviso `expired` decía "running inside a synthesizer that
 * has not reported its model" sin ninguna pista accionable, que es exactamente lo
 * que ve el usuario cuando lanza un binario del host anterior al arreglo del canal
 * nativo → JS.
 */

import { describe, it, expect } from 'vitest';
import {
  HOST_SCOPE_NOTICE_ID,
  HOST_SCOPE_CONNECT_BTN_ID,
  blockedNavHint,
  hostScopeNotice
} from '../../src/ui/hostScopeNotice.js';

describe('aviso de ámbito del anfitrión', () => {
  it('awaiting: esperando al host, sin botón ni lenguaje de fallo', () => {
    const { scope, message } = hostScopeNotice();

    expect(scope).toBe('awaiting');
    expect(message).toMatch(/waiting for the host/i);
    expect(message).not.toContain(HOST_SCOPE_CONNECT_BTN_ID);
    expect(message).not.toMatch(/no hardware/i);
  });

  it('expired sin respuesta del host: lo dice (ni siquiera contestó el handshake)', () => {
    const { scope, message } = hostScopeNotice({ expired: true });

    expect(scope).toBe('expired');
    expect(message).toMatch(/no hardware selected/i);
    expect(message).toMatch(/did not answer the bridge handshake/i);
    expect(message).toMatch(/rebuild and restart/i);
    expect(message).toContain(HOST_SCOPE_CONNECT_BTN_ID);
  });

  it('expired con host que contesta pero no se identifica: build anterior al anuncio', () => {
    const { scope, message } = hostScopeNotice({ expired: true, hostAnswered: true });

    expect(scope).toBe('expired');
    expect(message).toMatch(/answered the bridge but did not report/i);
    expect(message).toMatch(/predates/i);
    expect(message).toMatch(/rebuild and restart/i);
    expect(message).not.toMatch(/did not answer the bridge handshake/i);
  });

  it('unsupported nombra el build del host cuando reportó su sello', () => {
    const { scope, message } = hostScopeNotice({
      unknownModelId: 'nope-9000',
      hostInfo: { buildStamp: 'Sep 12 2026 11:41:00', protocol: 4, buildRevision: '5b7d69ce9' }
    });

    expect(scope).toBe('unsupported');
    expect(message).toContain('Sep 12 2026 11:41:00');
    expect(message).toContain('bridge protocol 4');
    expect(message).toContain('git 5b7d69ce9');
  });

  it('sin ficha del host, unsupported no inventa sello', () => {
    const { message } = hostScopeNotice({ unknownModelId: 'nope-9000' });

    expect(message).not.toMatch(/bridge protocol/);
    expect(message).not.toMatch(/git /);
  });

  it('unsupported: nombra el modelId anunciado y lo escapa', () => {
    const { scope, message } = hostScopeNotice({ unknownModelId: '<b>nope-9000</b>' });

    expect(scope).toBe('unsupported');
    expect(message).toContain('&lt;b&gt;nope-9000&lt;/b&gt;');
    expect(message).not.toContain('<b>nope-9000');
    expect(message).toMatch(/out of sync/i);
  });

  it('el botón y el aviso publican los ids que app.js cablea', () => {
    const { message } = hostScopeNotice({ expired: true });

    expect(message).toContain(`id="${HOST_SCOPE_CONNECT_BTN_ID}"`);
    expect(HOST_SCOPE_NOTICE_ID).toBe('host-scope-notice');
  });
});

describe('pista de la sidebar mientras el catálogo está bloqueado', () => {
  it('cada estado tiene su texto', () => {
    expect(blockedNavHint()).toBe('Waiting for host…');
    expect(blockedNavHint({ expired: true })).toBe('Connect MIDI hardware');
    expect(blockedNavHint({ unknown: true })).toBe('Unsupported hardware');
    // Un modelId desconocido manda sobre el plazo agotado: el host sí respondió.
    expect(blockedNavHint({ unknown: true, expired: true })).toBe('Unsupported hardware');
  });
});
