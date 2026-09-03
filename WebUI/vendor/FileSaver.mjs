// ESM wrapper for FileSaver UMD bundle
// The UMD bundle is loaded via <script> tag and attaches to globalThis.saveAs
const saveAs = globalThis.saveAs;
export default saveAs;
export { saveAs };
