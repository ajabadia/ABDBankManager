/**
 * ABD Bank Manager — Panel Factory
 * Registry-driven panel generation: reads PANEL_DEFS and PARAMETER_REGISTRY
 * Auto-maps registry types to UI widgets
 */

import { PARAMETER_REGISTRY } from '../contracts/registry.gen.js';
import { paramStore } from '../store/paramStore.js';

// Widget creators
function createRotaryKnob(param, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'param-control rotary-knob-wrapper';
  wrapper.dataset.paramId = param.id;

  const knob = document.createElement('div');
  knob.className = 'rotary-knob';
  knob.dataset.paramId = param.id;

  const label = document.createElement('div');
  label.className = 'param-label';
  label.textContent = param.name;

  const valueDisplay = document.createElement('div');
  valueDisplay.className = 'param-value';
  valueDisplay.dataset.paramId = param.id;

  wrapper.appendChild(knob);
  wrapper.appendChild(label);
  wrapper.appendChild(valueDisplay);
  container.appendChild(wrapper);

  // Initialize RotaryKnob interaction (simplified - full impl in rotaryKnob.js)
  let isDragging = false;
  let startY = 0;
  let startValue = 0;

  const updateDisplay = (val) => {
    const normalized = (val - param.min) / (param.max - param.min);
    const angle = -135 + normalized * 270;
    knob.style.transform = `rotate(${angle}deg)`;
    valueDisplay.textContent = param.type === 'choice' && param.choices
      ? param.choices[Math.round(val)] || val
      : (param.type === 'boolean' ? (val ? 'On' : 'Off') : val.toFixed(param.type === 'integer' ? 0 : 2));
  };

  const setValue = (val) => {
    const clamped = Math.max(param.min, Math.min(param.max, val));
    updateDisplay(clamped);
    paramStore.setValue(param.id, clamped);
  };

  knob.addEventListener('mousedown', (e) => {
    isDragging = true;
    startY = e.clientY;
    startValue = paramStore.getValue(param.id) ?? param.default;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = startY - e.clientY;
    const step = (param.max - param.min) / 200;
    const newVal = startValue + delta * step * (e.shiftKey ? 0.2 : 1);
    setValue(newVal);
  });

  document.addEventListener('mouseup', () => { isDragging = false; });

  knob.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = (param.max - param.min) * (e.shiftKey ? 0.01 : 0.05);
    const newVal = (paramStore.getValue(param.id) ?? param.default) - e.deltaY * step;
    setValue(newVal);
  });

  knob.addEventListener('dblclick', () => setValue(param.default));

  // Register with ParamStore
  paramStore.register(param.id, { setValue, updateDisplay });

  // Initial display
  updateDisplay(paramStore.getValue(param.id) ?? param.default);

  return wrapper;
}

function createChoiceSelect(param, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'param-control choice-wrapper';
  wrapper.dataset.paramId = param.id;

  const label = document.createElement('label');
  label.textContent = param.name;
  label.className = 'param-label';

  const select = document.createElement('select');
  select.className = 'param-select';
  select.dataset.paramId = param.id;

  param.choices.forEach((choice, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = choice;
    select.appendChild(option);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  container.appendChild(wrapper);

  const setValue = (val) => {
    select.value = Math.round(val);
    paramStore.setValue(param.id, Math.round(val));
  };

  select.addEventListener('change', () => {
    paramStore.setValue(param.id, Number(select.value));
  });

  paramStore.register(param.id, { setValue });

  setValue(paramStore.getValue(param.id) ?? param.default);

  return wrapper;
}

function createBooleanToggle(param, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'param-control boolean-wrapper';
  wrapper.dataset.paramId = param.id;

  const label = document.createElement('label');
  label.className = 'toggle-label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'toggle-input';
  checkbox.dataset.paramId = param.id;

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  const text = document.createElement('span');
  text.className = 'toggle-text';
  text.textContent = param.name;

  label.appendChild(checkbox);
  label.appendChild(slider);
  label.appendChild(text);
  wrapper.appendChild(label);
  container.appendChild(wrapper);

  const setValue = (val) => {
    checkbox.checked = Boolean(val);
    paramStore.setValue(param.id, val ? 1 : 0);
  };

  checkbox.addEventListener('change', () => {
    paramStore.setValue(param.id, checkbox.checked ? 1 : 0);
  });

  paramStore.register(param.id, { setValue });

  setValue(paramStore.getValue(param.id) ?? param.default);

  return wrapper;
}

// Widget factory map
export const WIDGET_FACTORY = {
  continuous: createRotaryKnob,
  integer: createRotaryKnob,
  choice: createChoiceSelect,
  boolean: createBooleanToggle
};

/**
 * PANEL_DEFS — Define panels declaratively
 * Each entry maps to a panel container in the HTML
 */
export const PANEL_DEFS = [
  // Kit de editor para los plugins ABD: sin paneles definidos en el gestor de bancos.
  // El registry de parámetros está vacío (los ajustes MIDI se derivan del ModelContract.midi
  // y de HARDWARE_QUEUE_CONFIGS). Los plugins añadirán aquí sus paneles de editor al integrar el kit.
];

/**
 * Build a panel from definition
 */
export function buildPanel(def) {
  const container = document.getElementById(def.containerId);
  if (!container) {
    console.warn(`Panel container not found: ${def.containerId}`);
    return;
  }

  // Clear existing
  container.innerHTML = '';

  // Add title
  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = def.title;
  container.appendChild(title);

  const paramsContainer = document.createElement('div');
  paramsContainer.className = 'params-grid';
  container.appendChild(paramsContainer);

  // Build each parameter
  for (const paramId of def.params) {
    const param = PARAMETER_REGISTRY.getParam(paramId);
    if (!param) {
      console.warn(`Parameter not found in registry: ${paramId}`);
      continue;
    }

    const factory = WIDGET_FACTORY[param.type];
    if (!factory) {
      console.warn(`No widget factory for type: ${param.type}`);
      continue;
    }

    factory(param, paramsContainer);
  }
}

/**
 * Build all panels
 */
export function buildAllPanels() {
  PANEL_DEFS.forEach(buildPanel);
}

/**
 * Get parameter definitions for a specific model contract
 * Filters PANEL_DEFS to only include params that exist in the model's registry
 */
export function getPanelDefsForModel(modelContract) {
  // Could filter PANEL_DEFS based on modelContract.sysexParams etc.
  return PANEL_DEFS;
}