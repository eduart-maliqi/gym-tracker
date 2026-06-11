/** Compress an image file to a JPEG data URL, capped at maxSize px on the long edge. */
export function compressImage(file: File, maxSize = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht geladen werden"));
    };
    img.src = url;
  });
}

// Firestore documents max out at 1 MB; leave headroom for the other fields.
const MAX_DATA_URL_BYTES = 700_000;

/** Compress for Firestore storage, retrying smaller/lower quality until it fits. */
export async function compressForStorage(file: File): Promise<string> {
  const attempts: [number, number][] = [
    [1024, 0.8],
    [900, 0.7],
    [720, 0.6],
    [560, 0.5],
  ];
  let result = "";
  for (const [maxSize, quality] of attempts) {
    result = await compressImage(file, maxSize, quality);
    if (result.length <= MAX_DATA_URL_BYTES) return result;
  }
  throw new Error("Bild ist zu groß zum Speichern");
}
