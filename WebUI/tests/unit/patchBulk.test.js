/**
 * Patch Bulk — renombrado masivo con plantilla y CSV de nombres.
 */

import { describe, it, expect } from 'vitest';
import {
  applyRenameTemplate, validateRenameTemplate,
  patchesToCsv, parseNamesCsv, parseCsvLine
} from '../../src/core/patchBulk.js';

const cz101 = {
  displayName: 'Casio CZ-101',
  getProgramAddress: (i) => `A${i + 1}`
};

const ms2000 = {
  displayName: 'Korg MS2000',
  getProgramAddress: (i) => `A.${String((i % 16) + 1).padStart(2, '0')}`
};

describe('applyRenameTemplate', () => {
  it('sustituye {address} con la dirección del contrato', () => {
    expect(applyRenameTemplate('BRASS {address}', { index: 0, contract: cz101 })).toBe('BRASS A1');
    expect(applyRenameTemplate('{address}', { index: 15, contract: cz101 })).toBe('A16');
    expect(applyRenameTemplate('BRASS {address}', { index: 0, contract: ms2000 })).toBe('BRASS A.01');
  });

  it('sustituye {name}, {index}, {model} y {bank}', () => {
    const ctx = { name: 'Old', index: 3, contract: cz101, bankName: 'Live Set' };
    expect(applyRenameTemplate('{name} {index} {model} {bank}', ctx)).toBe('Old 4 Casio CZ-101 Live Set');
  });

  it('sin contrato usa índice 1-based como dirección', () => {
    expect(applyRenameTemplate('PATCH {index}', { index: 4 })).toBe('PATCH 5');
    expect(applyRenameTemplate('PATCH {address}', { index: 4 })).toBe('PATCH 5');
  });

  it('deja intacto el texto sin placeholders', () => {
    expect(applyRenameTemplate('INIT', { index: 0 })).toBe('INIT');
  });
});

describe('validateRenameTemplate', () => {
  it('rechaza plantillas vacías', () => {
    expect(validateRenameTemplate('', 1).valid).toBe(false);
    expect(validateRenameTemplate('   ', 1).valid).toBe(false);
  });

  it('rechaza plantillas sin placeholders cuando hay varios patches', () => {
    const r = validateRenameTemplate('BRASS', 5);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('mismo nombre');
  });

  it('permite plantilla sin placeholders para un solo patch', () => {
    expect(validateRenameTemplate('BRASS', 1).valid).toBe(true);
  });

  it('permite placeholders para varios patches', () => {
    expect(validateRenameTemplate('BRASS {address}', 16).valid).toBe(true);
  });
});

describe('patchesToCsv / parseNamesCsv', () => {
  const rows = [
    { bankId: 'b1', bankName: 'Live Set', index: 0, name: 'BRASS A1', contract: cz101 },
    { bankId: 'b1', bankName: 'Live Set', index: 1, name: 'Lead, 2nd', contract: cz101 }
  ];

  it('serializa con cabecera y columnas', () => {
    const csv = patchesToCsv(rows);
    expect(csv.split('\n')[0]).toBe('bankId,bankName,index,name,address');
    expect(csv).toContain('b1,Live Set,0,BRASS A1,A1');
    expect(csv).toContain('"Lead, 2nd"');
  });

  it('roundtrip: parsear el CSV exportado devuelve las filas', () => {
    const csv = patchesToCsv(rows);
    const { rows: parsed, errors } = parseNamesCsv(csv);
    expect(errors).toEqual([]);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toMatchObject({ bankId: 'b1', index: 1, name: 'Lead, 2nd' });
  });

  it('rechaza cabecera sin las columnas obligatorias', () => {
    const { rows, errors } = parseNamesCsv('a,b,c\n1,2,3');
    expect(rows).toEqual([]);
    expect(errors[0]).toContain('bankId');
  });

  it('acepta columnas en cualquier orden y extra (CSV editado fuera)', () => {
    const csv = 'name,index,notes,bankId\n"Lead 2",1,x,b1';
    const { rows, errors } = parseNamesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ bankId: 'b1', bankName: '', index: 1, name: 'Lead 2' }]);
  });

  it('acepta cabecera mínima bankId,index,name (creado a mano)', () => {
    const csv = 'bankId,index,name\nb1,0,BRASS A1';
    const { rows, errors } = parseNamesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ bankId: 'b1', index: 0, name: 'BRASS A1' });
  });

  it('tolera BOM UTF-8 y nombres de columna en mayúsculas', () => {
    const csv = '\uFEFFBANKID,INDEX,NAME\nb1,2,Bass';
    const { rows, errors } = parseNamesCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ bankId: 'b1', index: 2, name: 'Bass' });
  });

  it('ignora filas con formato inválido y reporta el error', () => {
    const csv = 'bankId,bankName,index,name,address\nb1,Live,0,OK,A1\nBADROW\nb1,Live,x,Bad,A1';
    const { rows, errors } = parseNamesCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });

  it('respeta comillas escapadas en el nombre', () => {
    expect(parseCsvLine('b1,Live,0,"Say ""Hi""",A1')).toEqual(['b1', 'Live', '0', 'Say "Hi"', 'A1']);
  });
});
