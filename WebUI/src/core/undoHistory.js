/**
 * ABD Bank Manager — MF.13 Global Undo/Redo History
 *
 * Records operations and allows undo/redo.
 * History is lost on page close (not persistent).
 * Max 50 steps.
 */

const MAX_STEPS = 50;

class UndoHistory {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = [];
  }

  /**
   * Record an operation for undo.
   * @param {object} entry - { label, undo: async () => void, redo: async () => void }
   */
  async record(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_STEPS) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
    this._notify();
  }

  /**
   * Undo the last operation.
   * @returns {{ success: boolean, label?: string }}
   */
  async undo() {
    if (this.undoStack.length === 0) return { success: false };
    const entry = this.undoStack.pop();
    try {
      await entry.undo();
      this.redoStack.push(entry);
      this._notify();
      return { success: true, label: entry.label };
    } catch (err) {
      console.error('[Undo] Failed:', err);
      this.undoStack.push(entry); // Put it back
      return { success: false };
    }
  }

  /**
   * Redo the last undone operation.
   * @returns {{ success: boolean, label?: string }}
   */
  async redo() {
    if (this.redoStack.length === 0) return { success: false };
    const entry = this.redoStack.pop();
    try {
      await entry.redo();
      this.undoStack.push(entry);
      this._notify();
      return { success: true, label: entry.label };
    } catch (err) {
      console.error('[Redo] Failed:', err);
      this.redoStack.push(entry);
      return { success: false };
    }
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  onChange(callback) {
    this.listeners.push(callback);
    return () => { this.listeners = this.listeners.filter(l => l !== callback); };
  }

  _notify() {
    for (const l of this.listeners) {
      try { l({ canUndo: this.canUndo(), canRedo: this.canRedo() }); } catch {}
    }
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._notify();
  }
}

export const undoHistory = new UndoHistory();
