/**
 * ABD Bank Manager — ParamStore
 * Centralized UI state synchronization for all controls
 * Keeps all UI elements in sync when patches are loaded, randomized, or modified via SysEx/DAW
 */

export class ParamStore {
  constructor() {
    this.controls = new Map();  // paramId → Set of UI controls
    this.values = new Map();    // paramId → current value
    this.listeners = new Map(); // paramId → Set of change callbacks
  }

  /**
   * Register a UI element (RotaryKnob, <select>, <input>, etc.)
   * @param {string} paramId - Parameter ID from registry
   * @param {Object} control - UI control instance with .setValue() method
   */
  register(paramId, control) {
    if (!this.controls.has(paramId)) {
      this.controls.set(paramId, new Set());
    }
    this.controls.get(paramId).add(control);

    // Apply current value immediately if available
    if (this.values.has(paramId)) {
      this.applyToControl(control, this.values.get(paramId));
    }
  }

  /**
   * Unregister a UI element
   */
  unregister(paramId, control) {
    const set = this.controls.get(paramId);
    if (set) {
      set.delete(control);
      if (set.size === 0) {
        this.controls.delete(paramId);
      }
    }
  }

  /**
   * Batch-update all controls from C++ state sync
   * @param {Object} data - Object with paramId: value pairs
   */
  syncAll(data) {
    for (const [paramId, value] of Object.entries(data)) {
      this.values.set(paramId, value);
      const controls = this.controls.get(paramId);
      if (controls) {
        for (const ctrl of controls) {
          this.applyToControl(ctrl, value);
        }
      }
      // Notify listeners
      this.notifyListeners(paramId, value);
    }
  }

  /**
   * Update a single parameter value and sync to all registered controls
   */
  setValue(paramId, value) {
    this.values.set(paramId, value);
    const controls = this.controls.get(paramId);
    if (controls) {
      for (const ctrl of controls) {
        this.applyToControl(ctrl, value);
      }
    }
    this.notifyListeners(paramId, value);
  }

  /**
   * Get current value for a parameter
   */
  getValue(paramId) {
    return this.values.get(paramId);
  }

  /**
   * Subscribe to parameter changes
   */
  subscribe(paramId, callback) {
    if (!this.listeners.has(paramId)) {
      this.listeners.set(paramId, new Set());
    }
    this.listeners.get(paramId).add(callback);
    return () => this.unsubscribe(paramId, callback);
  }

  unsubscribe(paramId, callback) {
    const set = this.listeners.get(paramId);
    if (set) set.delete(callback);
  }

  notifyListeners(paramId, value) {
    const set = this.listeners.get(paramId);
    if (set) {
      for (const cb of set) {
        try { cb(value); } catch (e) { console.error('ParamStore listener error:', e); }
      }
    }
  }

  /**
   * Apply value to a specific control (handles different control types)
   */
  applyToControl(control, value) {
    if (typeof control.setValue === 'function') {
      control.setValue(value);
    } else if (control.value !== undefined) {
      control.value = value;
    } else if (control.checked !== undefined) {
      control.checked = Boolean(value);
    } else if (control.selectedIndex !== undefined) {
      control.selectedIndex = Number(value);
    }
  }

  /**
   * Clear all state
   */
  clear() {
    this.controls.clear();
    this.values.clear();
    this.listeners.clear();
  }
}

// Global singleton instance
export const paramStore = new ParamStore();