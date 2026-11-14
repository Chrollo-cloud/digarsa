export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const photoTypes = ["image/jpeg", "image/png", "image/webp"];
export const isMediaId = value => typeof value === "string" && /^local-photo-[a-zA-Z0-9-]{1,100}$/.test(value);
export function validatePhoto(file) {
  if (!(file instanceof Blob) || !photoTypes.includes(file.type)) throw new Error("Pilih foto JPEG, PNG, atau WebP.");
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error("Ukuran foto harus lebih of 0 dan maksimal 5 MB.");
}
export async function preparePhoto(file, { decode = createImageBitmap, canvas = () => document.createElement("canvas") } = {}) {
  validatePhoto(file);
  let image;
  try { image = await decode(file); } catch { throw new Error("Berkas tidak dapat dibaca sebagai gambar."); }
  try {
    if (!image.width || !image.height || image.width * image.height > 40000000)
      throw new Error("Dimensi foto tidak valid atau terlalu besar (maksimal 40 megapiksel).");
    const surface = canvas();
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    surface.width = Math.max(1, Math.round(image.width * scale));
    surface.height = Math.max(1, Math.round(image.height * scale));
    const context = surface.getContext("2d");
    if (!context) throw new Error("Pemrosesan foto belum tersedia pada browser ini.");
    context.drawImage(image, 0, 0, surface.width, surface.height);
    const blob = await new Promise(resolve => surface.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("Foto gagal diproses.");
    validatePhoto(blob);
    return blob; // Re-encoding keeps the pixel image, not original file metadata.
  } finally { image.close?.(); }
}
export function createMediaStore(indexedDB = globalThis.indexedDB) {
  async function open() {
    if (!indexedDB) throw new Error("Penyimpanan foto lokal tidak tersedia.");
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("digarsa.demo.media.v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Penyimpanan foto lokal tidak dapat dibuka."));
      request.onblocked = () => reject(new Error("Tutup tab demo lain lalu coba penyimpanan foto lagi."));
    });
  }
  async function transaction(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction("photos", mode); }
      catch { db.close(); reject(new Error("Penyimpanan foto tidak kompatibel. Data tidak dihapus otomatis.")); return; }
      let result;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error("Foto belum tersimpan. Penyimpanan lokal gagal atau penuh.")); };
      action(tx.objectStore("photos"), value => { result = value; });
    });
  }
  return {
    async put(blob, ownerUserId, scope) {
      validatePhoto(blob);
      if (!ownerUserId || !["account", "seller"].includes(scope)) throw new Error("Pemilik foto tidak valid.");
      const id = `local-photo-${crypto.randomUUID()}`;
      await transaction("readwrite", (store, done) => { store.add({ id, ownerUserId, scope, blob }); done(id); });
      return id;
    },
    async get(id, ownerUserId, scope) {
      if (!isMediaId(id)) return null;
      return transaction("readonly", (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => {
          const row = request.result;
          done(row?.ownerUserId === ownerUserId && row?.scope === scope ? row.blob : null);
        };
      });
    },
    async remove(id, ownerUserId, scope) {
      if (!isMediaId(id)) return;
      await transaction("readwrite", (store) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result?.ownerUserId === ownerUserId && request.result?.scope === scope) store.delete(id);
        };
      });
    },
  };
}
export const mediaStore = createMediaStore();
