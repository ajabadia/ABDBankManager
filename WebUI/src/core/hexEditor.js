/**
 * ABD Bank Manager — MF.15 Hex Editor Component
 * Inline editable hexdump for patch rawData.
 */

/**
 * Create a hex editor DOM element for a patch's rawData.
 *
 * @param {Uint8Array} originalData - Original bytes (for revert/diff)
 * @param {object} options
 * @param {number} [options.bytesPerLine=16]
 * @param {boolean} [options.readOnly=false]
 * @param {(newData: Uint8Array) => void} [options.onChange] - Called when a byte is edited
 * @returns {{ element: HTMLElement, getData: () => Uint8Array, revert: () => void, hasChanges: () => boolean }}
 */
export function createHexEditor(originalData, options = {}) {
  const { bytesPerLine = 16, readOnly = false, onChange } = options;
  const data = new Uint8Array(originalData); // working copy
  const original = new Uint8Array(originalData); // for revert
  const modified = new Set(); // indices of modified bytes
  const container = document.createElement('div');
  container.className = 'hex-editor';

  let selectedByte = -1;

  function isMidiValid(val) {
    return val >= 0 && val <= 127;
  }

  function render() {
    container.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'hex-editor-toolbar';

    const byteCount = document.createElement('span');
    byteCount.className = 'hex-editor-info';
    byteCount.textContent = `${data.length} bytes · ${modified.size} modificados`;

    toolbar.appendChild(byteCount);

    if (!readOnly) {
      const revertBtn = document.createElement('button');
      revertBtn.className = 'btn btn-sm';
      revertBtn.textContent = '↩ Revertir';
      revertBtn.disabled = modified.size === 0;
      revertBtn.onclick = () => { revert(); };
      toolbar.appendChild(revertBtn);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-sm';
      copyBtn.textContent = '📋 Copiar hex';
      copyBtn.onclick = () => copyHex();
      toolbar.appendChild(copyBtn);

      const pasteBtn = document.createElement('button');
      pasteBtn.className = 'btn btn-sm';
      pasteBtn.textContent = '📋 Pegar hex';
      pasteBtn.onclick = () => pasteHex();
      toolbar.appendChild(pasteBtn);

      const selectAllBtn = document.createElement('button');
      selectAllBtn.className = 'btn btn-sm';
      selectAllBtn.textContent = 'Seleccionar todo';
      selectAllBtn.onclick = () => selectAllBytes();
      toolbar.appendChild(selectAllBtn);
    } else {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-sm';
      copyBtn.textContent = '📋 Copiar hex';
      copyBtn.onclick = () => copyHex();
      toolbar.appendChild(copyBtn);
    }

    container.appendChild(toolbar);

    // Hex dump table
    const table = document.createElement('div');
    table.className = 'hex-editor-table';

    for (let rowStart = 0; rowStart < data.length; rowStart += bytesPerLine) {
      const row = document.createElement('div');
      row.className = 'hex-editor-row';

      // Offset column
      const offset = document.createElement('span');
      offset.className = 'hex-editor-offset';
      offset.textContent = rowStart.toString(16).toUpperCase().padStart(8, '0');
      row.appendChild(offset);

      // Separator
      const sep1 = document.createElement('span');
      sep1.className = 'hex-editor-sep';
      sep1.textContent = '│';
      row.appendChild(sep1);

      // Hex bytes
      const hexGroup = document.createElement('span');
      hexGroup.className = 'hex-editor-bytes';

      for (let i = 0; i < bytesPerLine; i++) {
        const idx = rowStart + i;
        if (idx >= data.length) break;

        const cell = document.createElement('span');
        cell.className = 'hex-editor-byte';
        cell.textContent = toHex(data[idx]);
        cell.dataset.offset = idx;

        if (modified.has(idx)) {
          cell.classList.add('modified');
        }
        if (idx === selectedByte) {
          cell.classList.add('selected');
        }
        if (!isMidiValid(data[idx])) {
          cell.classList.add('invalid');
        }

        if (!readOnly) {
          cell.contentEditable = 'true';
          cell.spellcheck = false;
          cell.addEventListener('focus', () => onByteFocus(idx, cell));
          cell.addEventListener('blur', () => onByteBlur(idx, cell));
          cell.addEventListener('keydown', (e) => onByteKeydown(e, idx, cell));
        }

        hexGroup.appendChild(cell);

        // Space between bytes (thicker every 8)
        if (i < bytesPerLine - 1 && idx < data.length - 1) {
          const spacer = document.createElement('span');
          spacer.className = (i + 1) % 8 === 0 ? 'hex-editor-spacer-wide' : 'hex-editor-spacer';
          spacer.textContent = ' ';
          hexGroup.appendChild(spacer);
        }
      }
      row.appendChild(hexGroup);

      // Separator
      const sep2 = document.createElement('span');
      sep2.className = 'hex-editor-sep';
      sep2.textContent = '│';
      row.appendChild(sep2);

      // ASCII column
      const asciiGroup = document.createElement('span');
      asciiGroup.className = 'hex-editor-ascii';
      for (let i = 0; i < bytesPerLine; i++) {
        const idx = rowStart + i;
        if (idx >= data.length) break;
        const b = data[idx];
        const ch = (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
        asciiGroup.textContent += ch;
      }
      row.appendChild(asciiGroup);

      table.appendChild(row);
    }

    container.appendChild(table);
  }

  function onByteFocus(idx, cell) {
    selectedByte = idx;
    // Select all text in the cell for easy replacement
    const range = document.createRange();
    range.selectNodeContents(cell);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function onByteBlur(idx, cell) {
    const text = cell.textContent.trim();
    const val = parseInt(text, 16);

    if (isNaN(val) || val < 0 || val > 255) {
      // Revert to original value
      cell.textContent = toHex(data[idx]);
      cell.classList.remove('invalid');
      return;
    }

    if (val !== data[idx]) {
      const oldVal = data[idx];
      data[idx] = val;
      modified.add(idx);
      cell.textContent = toHex(val);
      cell.classList.toggle('invalid', !isMidiValid(val));
      cell.classList.add('modified');

      if (onChange) onChange(new Uint8Array(data));
      updateInfo();
    }
  }

  function onByteKeydown(e, idx, cell) {
    // Tab to next byte
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
      if (nextIdx >= 0 && nextIdx < data.length) {
        const nextCell = container.querySelector(`[data-offset="${nextIdx}"]`);
        if (nextCell) nextCell.focus();
      }
    }
    // Enter to blur (commit)
    if (e.key === 'Enter') {
      e.preventDefault();
      cell.blur();
    }
    // Arrow keys
    if (e.key === 'ArrowRight' && idx + 1 < data.length) {
      const nextCell = container.querySelector(`[data-offset="${idx + 1}"]`);
      if (nextCell) { e.preventDefault(); nextCell.focus(); }
    }
    if (e.key === 'ArrowLeft' && idx - 1 >= 0) {
      const prevCell = container.querySelector(`[data-offset="${idx - 1}"]`);
      if (prevCell) { e.preventDefault(); prevCell.focus(); }
    }
    if (e.key === 'ArrowDown' && idx + bytesPerLine < data.length) {
      const nextCell = container.querySelector(`[data-offset="${idx + bytesPerLine}"]`);
      if (nextCell) { e.preventDefault(); nextCell.focus(); }
    }
    if (e.key === 'ArrowUp' && idx - bytesPerLine >= 0) {
      const prevCell = container.querySelector(`[data-offset="${idx - bytesPerLine}"]`);
      if (prevCell) { e.preventDefault(); prevCell.focus(); }
    }
  }

  function updateInfo() {
    const info = container.querySelector('.hex-editor-info');
    if (info) {
      info.textContent = `${data.length} bytes · ${modified.size} modificados`;
    }
    const revertBtn = container.querySelector('.hex-editor-toolbar .btn');
    if (revertBtn && revertBtn.textContent.includes('Revertir')) {
      revertBtn.disabled = modified.size === 0;
    }
  }

  function toHex(b) {
    return b.toString(16).toUpperCase().padStart(2, '0');
  }

  function copyHex() {
    const hexStr = Array.from(data).map(b => toHex(b)).join(' ');
    navigator.clipboard.writeText(hexStr).then(
      () => {}, // silent success
      () => {}
    );
  }

  async function pasteHex() {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = text.replace(/[^0-9a-fA-F]/g, '');
      if (cleaned.length < 2) return;
      const bytes = [];
      for (let i = 0; i < cleaned.length - 1; i += 2) {
        bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
      }
      // Apply starting from selected byte or byte 0
      const startIdx = selectedByte >= 0 ? selectedByte : 0;
      for (let i = 0; i < bytes.length && startIdx + i < data.length; i++) {
        const idx = startIdx + i;
        data[idx] = bytes[i] & 0x7F; // Clamp to MIDI range
        modified.add(idx);
      }
      render();
      if (onChange) onChange(new Uint8Array(data));
    } catch {
      // Clipboard not available
    }
  }

  function selectAllBytes() {
    // Select all hex text in the editor
    const range = document.createRange();
    const bytesEl = container.querySelector('.hex-editor-bytes');
    if (bytesEl) {
      range.selectNodeContents(bytesEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function revert() {
    data.set(original);
    modified.clear();
    selectedByte = -1;
    render();
    if (onChange) onChange(new Uint8Array(data));
  }

  render();

  return {
    element: container,
    getData: () => new Uint8Array(data),
    revert,
    hasChanges: () => modified.size > 0,
  };
}
