/**
 * MF.5 — Bank Custom Image Utility
 *
 * Handles image upload, resize, and storage for bank thumbnails.
 * Images are stored as data URLs in the bank object (IndexedDB).
 */

const TARGET_WIDTH = 400;
const TARGET_HEIGHT = 240;
const MAX_SIZE_BYTES = 500 * 1024; // 500KB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Load an image from a File object and resize it to TARGET_WIDTH × TARGET_HEIGHT.
 * Returns a data URL string, or null on error.
 */
export async function processBankImage(file) {
  if (!file) return null;
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`Formato no soportado: ${file.type}. Usa JPEG, PNG o WebP.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`Archivo demasiado grande (${(file.size / 1024).toFixed(0)}KB). Máximo 500KB.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = TARGET_WIDTH;
          canvas.height = TARGET_HEIGHT;
          const ctx = canvas.getContext('2d');

          // Cover-fit: fill the canvas, cropping excess
          const imgRatio = img.width / img.height;
          const canvasRatio = TARGET_WIDTH / TARGET_HEIGHT;
          let sx, sy, sw, sh;
          if (imgRatio > canvasRatio) {
            // Image is wider — crop sides
            sh = img.height;
            sw = img.height * canvasRatio;
            sx = (img.width - sw) / 2;
            sy = 0;
          } else {
            // Image is taller — crop top/bottom
            sw = img.width;
            sh = img.width / canvasRatio;
            sx = 0;
            sy = (img.height - sh) / 2;
          }

          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_WIDTH, TARGET_HEIGHT);
          const dataUrl = canvas.toDataURL('image/webp', 0.85);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Error leyendo el archivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Create a file input for bank image upload.
 * Returns a Promise that resolves with the processed data URL or null.
 */
export function promptBankImageUpload() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_TYPES.join(',');
    input.style.display = 'none';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const dataUrl = await processBankImage(file);
        resolve(dataUrl);
      } catch (err) {
        resolve({ error: err.message });
      }
      input.remove();
    };
    input.oncancel = () => { resolve(null); input.remove(); };
    document.body.appendChild(input);
    input.click();
  });
}
