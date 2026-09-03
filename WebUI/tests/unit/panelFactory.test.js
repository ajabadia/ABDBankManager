import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParamStore } from '@store/paramStore';
import { PANEL_DEFS, WIDGET_FACTORY } from '@ui/panelFactory';

describe('ParamStore', () => {
  let store;

  beforeEach(() => {
    store = new ParamStore();
  });

  it('should register and sync control values', () => {
    const mockControl = {
      setValue: vi.fn(),
      value: 0
    };

    store.register('testParam', mockControl);
    store.setValue('testParam', 42);

    expect(mockControl.setValue).toHaveBeenCalledWith(42);
    expect(store.getValue('testParam')).toBe(42);
  });

  it('should syncAll multiple values at once', () => {
    const control1 = { setValue: vi.fn() };
    const control2 = { setValue: vi.fn() };

    store.register('param1', control1);
    store.register('param2', control2);

    store.syncAll({ param1: 10, param2: 20 });

    expect(control1.setValue).toHaveBeenCalledWith(10);
    expect(control2.setValue).toHaveBeenCalledWith(20);
    expect(store.getValue('param1')).toBe(10);
    expect(store.getValue('param2')).toBe(20);
  });

  it('should notify subscribers on value change', () => {
    const callback = vi.fn();
    const unsubscribe = store.subscribe('testParam', callback);

    store.setValue('testParam', 99);

    expect(callback).toHaveBeenCalledWith(99);

    unsubscribe();
    store.setValue('testParam', 100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should unregister controls', () => {
    const control = { setValue: vi.fn() };
    store.register('testParam', control);
    store.unregister('testParam', control);
    store.setValue('testParam', 50);
    expect(control.setValue).not.toHaveBeenCalled();
  });

  it('should apply value to different control types', () => {
    const inputControl = { value: 0 };
    const checkboxControl = { checked: false };
    const selectControl = { selectedIndex: 0 }; // No 'value' property to avoid conflict

    store.register('input', inputControl);
    store.register('checkbox', checkboxControl);
    store.register('select', selectControl);

    store.setValue('input', 42);
    store.setValue('checkbox', true);
    store.setValue('select', 2);

    expect(inputControl.value).toBe(42);
    expect(checkboxControl.checked).toBe(true);
    // For select, the applyToControl sets selectedIndex
    expect(selectControl.selectedIndex).toBe(2);
  });
});

describe('PANEL_DEFS', () => {
  it('should have valid panel definitions', () => {
    // El gestor de bancos no renderiza paneles de parámetros (registry vacío):
    // PANEL_DEFS está vacío hasta que los plugins ABD definan sus parámetros de editor.
    expect(Array.isArray(PANEL_DEFS)).toBe(true);

    // PANEL_DEFS is intentionally empty in the bank manager
    // (parameter panels are defined by ABD plugins, not the bank manager)
    // So we just verify it's an array — no items to validate
  });
});

describe('WIDGET_FACTORY', () => {
  it('should have factories for all parameter types', () => {
    expect(WIDGET_FACTORY.continuous).toBeDefined();
    expect(WIDGET_FACTORY.integer).toBeDefined();
    expect(WIDGET_FACTORY.choice).toBeDefined();
    expect(WIDGET_FACTORY.boolean).toBeDefined();
  });

  it('should have function factories', () => {
    expect(typeof WIDGET_FACTORY.continuous).toBe('function');
    expect(typeof WIDGET_FACTORY.integer).toBe('function');
    expect(typeof WIDGET_FACTORY.choice).toBe('function');
    expect(typeof WIDGET_FACTORY.boolean).toBe('function');
  });
});
