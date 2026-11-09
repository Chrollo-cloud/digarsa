import { DEMO_BOOKING_KEY, EDITORIAL_SAMPLE_SERVICE_IDS } from "../features/customer/demoBookingFixture.js";
export { DEMO_BOOKING_KEY };
export const demoIdentities = { seller: "seller.booking@example.test", buyer: "buyer.booking@example.test" };
export function assertLocalDevelopment(dev, hostname) {
  if (!dev || !["localhost", "127.0.0.1", "[::1]"].includes(hostname)) throw new Error("Penyiapan hanya tersedia pada pengembangan localhost.");
}
export function createDemoBookingSetup({ accounts, services, storage, enabled, editorialServiceIds = EDITORIAL_SAMPLE_SERVICE_IDS }) {
  function read() {
    if (!enabled()) throw new Error("Penyiapan demo tidak diizinkan pada lingkungan ini.");
    const raw = storage.getItem(DEMO_BOOKING_KEY);
    if (raw === null) return { version: 1, sellerId: null, buyerId: null, profileId: null, serviceIds: [], editorialServiceIds: [] };
    let row;
    try { row = JSON.parse(raw); } catch { throw new Error("Registri demo rusak; data tidak ditimpa."); }
    if (row?.version !== 1 || !Array.isArray(row.serviceIds) || row.serviceIds.length > 2 || new Set(row.serviceIds).size !== row.serviceIds.length || ![row.sellerId, row.buyerId, row.profileId].every(id => id === null || typeof id === "string") || row.serviceIds.some(id => typeof id !== "string") || (row.editorialServiceIds !== undefined && (!Array.isArray(row.editorialServiceIds) || new Set(row.editorialServiceIds).size !== row.editorialServiceIds.length || row.editorialServiceIds.some(id => !EDITORIAL_SAMPLE_SERVICE_IDS.includes(id))))) throw new Error("Registri demo tidak kompatibel; data tidak ditimpa.");
    return { ...row, editorialServiceIds: row.editorialServiceIds || [] };
  }
  const save = row => storage.setItem(DEMO_BOOKING_KEY, JSON.stringify(row));
  async function signIn(role, password, row) {
    const key = role === "seller" ? "sellerId" : "buyerId";
    if (row[key]) {
      const user = await accounts.login(demoIdentities[role], password);
      if (user.id !== row[key]) throw new Error("Identitas tidak cocok dengan registri demo.");
      return user;
    }
    // Existing-email collisions fail; never adopt an unrelated account.
    const user = await accounts.register({ name: role === "seller" ? "Studio Demo Booking" : "Pembeli Demo Booking", email: demoIdentities[role], password });
    row[key] = user.id; save(row); return user;
  }
  return {
    async setup({ sellerPassword, buyerPassword, enableEditorialSamples = false }) {
      const row = read();
      if (typeof enableEditorialSamples !== "boolean") throw new Error("Pilihan fixture editorial tidak valid.");
      row.editorialServiceIds = enableEditorialSamples ? [...editorialServiceIds] : [];
      await signIn("seller", sellerPassword, row);
      if (!row.profileId) {
        const profile = accounts.activateSeller({ name: "Studio Demo Booking", category: "Fotografi & Film", city: "Makassar", bio: "Studio pengujian lokal untuk pemesanan Digarsa, bukan seller terverifikasi identitas.", image: "", portfolioLink: "", specialties: "Fotografi, Video", publicLocation: { version: 1, visibility: "pin", area: "Area QA sintetis Makassar — bukan lokasi pribadi", coordinates: { lat: -5.14, lng: 119.42 }, confirmed: true } });
        row.profileId = profile.id; save(row);
      }
      if (accounts.getOwnedSeller(row.profileId).ownerUserId !== row.sellerId) throw new Error("Kepemilikan profil demo tidak cocok.");
      const owned = services.mine();
      if (owned.error || row.serviceIds.some(id => !owned.services.some(item => item.id === id)))
        throw new Error("Layanan fixture tidak dapat diverifikasi; data tidak ditimpa.");
      {
        for (const [index, [title, delivery, price]] of [["Sesi fotografi demo Makassar", "Onsite", 350000], ["Penyuntingan video demo daring", "Remote", 250000]].entries()) {
          if (row.serviceIds[index]) continue;
          const item = services.create({ title, delivery, price, category: "Fotografi & Film", description: "Layanan QA sintetis untuk mencoba permintaan pesanan melalui akun pemilik yang sah.", turnaround: "3 hari kerja", availability: "Open", image: "", serviceLocation: null });
          row.serviceIds.push(item.id); save(row);
        }
      }
      await signIn("buyer", buyerPassword, row);
      save(row);
      return { ...row, serviceIds: [...row.serviceIds] };
    },
    async login(role, password) {
      if (!["buyer", "seller"].includes(role)) throw new Error("Pilih akun demo yang valid.");
      const row = read();
      if (!row[role === "seller" ? "sellerId" : "buyerId"]) throw new Error("Siapkan akun demo terlebih dahulu.");
      return signIn(role, password, row);
    },
    async reset(sellerPassword) {
      const row = read();
      if (!row.sellerId) throw new Error("Belum ada fixture untuk direset.");
      await signIn("seller", sellerPassword, row);
      const owned = services.mine();
      if (owned.error) throw new Error(owned.error);
      if (row.serviceIds.some(id => !owned.services.some(service => service.id === id))) throw new Error("Layanan demo tidak dapat diverifikasi; reset dihentikan.");
      for (const id of row.serviceIds) services.setActive(id, false);
      row.serviceIds = []; row.editorialServiceIds = []; save(row); // Keep accounts, orders and history intact.
    },
  };
}
