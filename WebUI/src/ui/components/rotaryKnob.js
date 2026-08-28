/**
 * ABD Bank Manager — RotaryKnob Component
 * Full-featured rotary knob with all interaction patterns from Guide §7.7
 */

export class RotaryKnob {
  constructor(param, options = {}) {
    this.param = param;
    this.options = {
      size: options.size || 64,
      sensitivity: options.sensitivity || 1.0,
      fineMultiplier: options.fineMultiplier || 0.2,
      wheelStep: options.wheelStep || 0.05,
      onChange: options.onChange || (() => {}),
      ...options
    };

    this.value = this.param.default;
    this.isDragging = false;
    this.startY = 0;
    this.startValue = 0;
    this.element = this.createElement();
    this.bindEvents();
  }

  createElement() {
    const wrapper = document.createElement('div');
    wrapper.className = 'rotary-knob-wrapper';
    wrapper.style.width = `${this.options.size}px`;
    wrapper.style.height = `${this.options.size}px`;
    wrapper.dataset.paramId = this.param.id;

    // Knob element
    this.knob = document.createElement('div');
    this.knob.className = 'rotary-knob';
    this.knob.style.width = `${this.options.size}px`;
    this.knob.style.height = `${this.options.size}px`;

    // Value display
    this.valueDisplay = document.createElement('div');
    this.valueDisplay.className = 'rotary-value';
    this.valueDisplay.dataset.paramId = this.param.id;

    // Label
    this.label = document.createElement('div');
    this.label.className = 'rotary-label';
    this.label.textContent = this.param.name;

    wrapper.appendChild(this.knob);
    wrapper.appendChild(this.valueDisplay);
    wrapper.appendChild(this.label);

    return wrapper;
  }

  bindEvents() {
    // Mouse drag (vertical)
    this.knob.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', () => this.onMouseUp());

    // Touch support
    this.knob.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener('touchend', () => this.onTouchEnd());

    // Mouse wheel
    this.knob.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Double-click to reset
    this.knob.addEventListener('dblclick', () => this.resetToDefault());

    // Keyboard support
    this.knob.setAttribute('tabindex', '0');
    this.knob.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  onMouseDown(e) {
    e.preventDefault();
    this.isDragging = true;
    this.startY = e.clientY;
    this.startValue = this.value;
    this.knob.classList.add('dragging');
  }

  onMouseMove(e) {
    if (!this.isDragging) return;
    const delta = this.startY - e.clientY;
    const step = (this.param.max - this.param.min) / 150;
    const multiplier = e.shiftKey ? this.options.fineMultiplier : 1;
    const newVal = this.startValue + delta * step * multiplier * this.options.sensitivity;
    this.setValue(newVal);
  }

  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.knob.classList.remove('dragging');
    }
  }

  onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.isDragging = true;
    this.startY = touch.clientY;
    this.startValue = this.value;
    this.knob.classList.add('dragging');
  }

  onTouchMove(e) {
    if (!this.isDragging) return;
    const touch = e.touches[0];
    const delta = this.startY - touch.clientY;
    const step = (this.param.max - this.param.min) / 150;
    const newVal = this.startValue + delta * step * this.options.sensitivity;
    this.setValue(newVal);
  }

  onTouchEnd() {
    if (this.isDragging) {
      this.isDragging = false;
      this.knob.classList.remove('dragging');
    }
  }

  onWheel(e) {
    e.preventDefault();
    const step = (this.param.max - this.param.min) * (e.shiftKey ? 0.01 : this.options.wheelStep);
    const newVal = this.value - e.deltaY * step;
    this.setValue(newVal);
  }

  onKeyDown(e) {
    const step = (this.param.max - this.param.min) * 0.02;
    let newVal = this.value;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newVal += e.shiftKey ? step * 5 : step;
        break;
      case 'ArrowDown':
        e.preventDefault();
        newVal -= e.shiftKey ? step * 5 : step;
        break;
      case 'Home':
        e.preventDefault();
        newVal = this.param.max;
        break;
      case 'End':
        e.preventDefault();
        newVal = this.param.min;
        break;
      default:
        return;
    }
    this.setValue(newVal);
  }

  setValue(val) {
    const clamped = Math.max(this.param.min, Math.min(this.param.max, val));
    const oldVal = this.value;
    this.value = clamped;
    this.updateDisplay();
    if (clamped !== oldVal) {
      this.options.onChange(this.param.id, clamped);
    }
  }

  getValue() {
    return this.value;
  }

  resetToDefault() {
    this.setValue(this.param.default);
  }

  updateDisplay() {
    const normalized = (this.value - this.param.min) / (this.param.max - this.param.min);
    const angle = -135 + normalized * 270;
    this.knob.style.transform = `rotate(${angle}deg)`;

    let displayVal;
    if (this.param.type === 'choice' && this.param.choices) {
      displayVal = this.param.choices[Math.round(this.value)] || this.value;
    } else if (this.param.type === 'boolean') {
      displayVal = this.value ? 'On' : 'Off';
    } else {
      displayVal = this.param.type === 'integer'
        ? Math.round(this.value)
        : this.value.toFixed(2);
    }
    this.valueDisplay.textContent = displayVal;
  }

  mount(container) {
    container.appendChild(this.element);
    this.updateDisplay();
    return this;
  }

  destroy() {
    this.element.remove();
  }
}

/**
 * Auto-initialize RotaryKnob instances from data attributes
 */
export function initRotaryKnobs(container = document) {
  const knobs = container.querySelectorAll('[data-rotary-knob]');
  knobs.forEach(el => {
    const paramId = el.dataset.paramId;
    // Would need param registry lookup here
    // new RotaryKnob(param).mount(el);
  });
}