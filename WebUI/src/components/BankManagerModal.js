/**
 * BankManagerModal.js
 * Universal Embeddable Modal Hosting the Full Native ABD Bank Manager WebUI
 */

export class BankManagerModal {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.iframeSrc = options.iframeSrc || 'src/components/bank/index.html';
    this.synthBridge = options.synthBridge || null;
    this.isOpen = false;

    // Expose bridge globally to child iframe
    if (this.synthBridge && !window.__synthBridge) {
      window.__synthBridge = this.synthBridge;
    }

    this._createDOM();
  }

  _createDOM() {
    // Avoid duplicate modals
    const existing = document.getElementById('abdbank-modal-overlay');
    if (existing) existing.remove();

    this.overlay = document.createElement('div');
    this.overlay.className = 'abdbank-modal-overlay';
    this.overlay.id = 'abdbank-modal-overlay';

    this.modal = document.createElement('div');
    this.modal.className = 'abdbank-modal-container';

    this.modal.innerHTML = `
      <button class="abdbank-close-floating-btn" id="abdbank-close-floating-btn" title="Close (Esc)">&times;</button>
      <iframe class="abdbank-iframe" id="abdbank-iframe" src="${this.iframeSrc}"></iframe>
    `;

    this.overlay.appendChild(this.modal);
    this.container.appendChild(this.overlay);

    this.modal.querySelector('#abdbank-close-floating-btn').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  open() {
    this.isOpen = true;
    this.overlay.classList.add('is-active');
  }

  close() {
    this.isOpen = false;
    this.overlay.classList.remove('is-active');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}

