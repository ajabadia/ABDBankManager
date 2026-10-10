/**
 * @abdsynths/bank-manager-ui — Reusable UI components of ABD Bank Manager.
 *
 * Single source of truth for components that hosts (plugins, standalone apps,
 * other ABDSynths WebUIs) embed to open the Universal Bank Manager:
 *
 *   - BankManagerModal: full-screen modal hosting the Bank Manager WebUI in an
 *     iframe, with theme propagation (setTheme) and same-origin URL resolution.
 *
 * The WebUI of this repo consumes the same file (WebUI/src/components/ is kept
 * in sync by the release script); external consumers should import from this
 * package instead of copying.
 */

export { BankManagerModal } from './BankManagerModal.js';
export { mountBankManager, BANK_MANAGER_HTML } from './mountBankManager.js';
