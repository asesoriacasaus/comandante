// Utilidades de medios del navegador (grabación y pantallazos). Sin dependencias.

/** Formato de grabación que el navegador soporta (en iPhone: audio/mp4). */
export function pickAudioMime(MR = globalThis.MediaRecorder) {
  if (!MR) return '';
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  if (typeof MR.isTypeSupported !== 'function') return '';
  return candidates.find((c) => MR.isTypeSupported(c)) || '';
}

/** Blob → base64 sin prefijo data:. */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(blob);
  });
}

/** Reduce una imagen a JPEG de lado máximo `max` px para respetar el límite de 4 MB. */
export async function shrinkImage(file, max = 1600, quality = 0.85) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo reducir la imagen'))), 'image/jpeg', quality));
}
