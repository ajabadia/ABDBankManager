/**
 * MF.5 — Bank Custom Image Utility
 *
 * Stores the original image as a data URL. The UI controls its presentation
 * with CSS, so user artwork is not cropped or recompressed on upload.
 */

const MAX_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 1536;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Load an image from a File object without changing its pixels.
 * Returns a data URL string, or null on error.
 */
export async function processBankImage(file) {
  if (!file) return null;
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error(`Unsupported format: ${file.type}. Use JPEG, PNG or WebP.`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`File too large (${(file.size / 1024).toFixed(0)}KB). Maximum 1MB.`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (img.width > MAX_WIDTH || img.height > MAX_HEIGHT) {
          reject(new Error(`Unsupported dimensions (${img.width}×${img.height}). Maximum ${MAX_WIDTH}×${MAX_HEIGHT}.`));
          return;
        }
        // Keep the original MIME type and bytes. CSS applies contain/cover at
        // render time; the bank file remains suitable for future re-use.
        resolve(String(e.target.result));
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Error reading file'));
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
