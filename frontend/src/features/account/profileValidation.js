export function validateProfilePatch(input) {
  const allowed = ["name", "avatarUrl", "phone", "birthDate", "gender"];
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  ) {
    throw new Error("Hanya informasi profil akun aktif yang dapat diubah.");
  }
  const result = {};
  for (const key of Object.keys(input)) {
    if (typeof input[key] !== "string")
      throw new Error("Format informasi profil tidak valid.");
    result[key] = input[key].trim();
  }
  if ("name" in result && (result.name.length < 2 || result.name.length > 80))
    throw new Error("Nama harus 2–80 karakter.");
  if (result.avatarUrl) {
  if (result.avatarUrl.startsWith("data:")) {
    const validUploadedJpeg =
      /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(
        result.avatarUrl,
      );

    if (
      !validUploadedJpeg ||
      result.avatarUrl.length > 250_000
    ) {
      throw new Error(
        "Foto hasil upload tidak valid atau terlalu besar. Pilih ulang gambar.",
      );
    }
  } else {
    try {
      const url = new URL(result.avatarUrl);

      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.href.length > 2048
      ) {
        throw new Error();
      }

      result.avatarUrl = url.href;
    } catch {
      throw new Error(
        "Foto profil harus berupa URL http atau https yang valid.",
      );
    }
  }
}
  if (
    result.phone &&
    (!/^\+?[\d ()-]+$/.test(result.phone) ||
      result.phone.length > 25 ||
      !/^\d{7,15}$/.test(result.phone.replace(/\D/g, "")))
  )
    throw new Error("Nomor telepon harus berisi 7–15 digit.");
  if (result.birthDate) {
    const date = new Date(`${result.birthDate}T00:00:00Z`);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(result.birthDate) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== result.birthDate ||
      result.birthDate > today
    )
      throw new Error(
        "Tanggal lahir harus tanggal yang valid dan tidak di masa depan.",
      );
  }
  if (
    "gender" in result &&
    !["", "Perempuan", "Laki-laki", "Tidak ingin menyebutkan"].includes(
      result.gender,
    )
  )
    throw new Error("Pilih jenis kelamin dari pilihan yang tersedia.");
  return result;
}

export function validateNewPassword(password, confirmation) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  )
    throw new Error("Kata sandi baru harus 8–128 karakter.");
  if (password !== confirmation)
    throw new Error("Konfirmasi kata sandi baru tidak cocok.");
}


export function isBuyerProfileComplete(user) {
  if (!user) return false;

  const nameComplete =
    typeof user.name === "string" &&
    user.name.trim().length >= 2;

  const phoneDigits =
    typeof user.phone === "string"
      ? user.phone.replace(/\D/g, "")
      : "";

  const phoneComplete =
    /^\+?[\d ()-]+$/.test(user.phone || "") &&
    phoneDigits.length >= 7 &&
    phoneDigits.length <= 15;

  return nameComplete && phoneComplete;
}
