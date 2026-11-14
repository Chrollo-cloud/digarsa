import { validateCoordinates } from "../location/locationModel.js";

const ADDRESS_KEYS = [
  "id",
  "recipientName",
  "phone",
  "province",
  "regency",
  "district",
  "village",
  "postalCode",
  "street",
  "houseNumber",
  "rtRw",
  "unit",
  "landmark",
  "isPrimary",
  "coordinates",
  "createdAt",
  "updatedAt",
];

const clean = (value, label, min, max) => {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const result = value.trim();
  if (
    result.length < min ||
    result.length > max ||
    [...result].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && !"\n\r\t".includes(character);
    })
  )
    throw new Error(`${label} must be ${min}–${max} characters.`);
  return result;
};

export function validateRegion(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Select a ${fieldName.toLowerCase()}.`);
  return {
    id: clean(value.id, `${fieldName} code`, 1, 20),
    name: clean(value.name, fieldName, 1, 100),
  };
}

export function validateShippingAddress(input, { requireId = false } = {}) {
  if (
    !input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).some((key) => !ADDRESS_KEYS.includes(key))
  ) throw new Error("Address information is invalid.");

  const id = !input.id && !requireId ? "" : clean(input.id, "Address ID", 1, 80);
  const phone = clean(input.phone, "Recipient phone number", 7, 25);
  if (!/^\+?[\d ()-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, "")))
    throw new Error("Enter a valid phone number with 7–15 digits.");
  const postalCode = clean(input.postalCode, "Postal code", 5, 5);
  if (!/^\d{5}$/.test(postalCode)) throw new Error("Postal code must contain exactly five digits.");
  if (typeof input.isPrimary !== "boolean") throw new Error("Choose whether this is your primary address.");

  const now = new Date().toISOString();
  const timestamp = (value, field) => {
    const result = value || now;
    if (typeof result !== "string" || !Number.isFinite(Date.parse(result)))
      throw new Error(`${field} is invalid.`);
    return result;
  };
  return {
    id,
    recipientName: clean(input.recipientName, "Recipient name", 2, 100),
    phone,
    province: validateRegion(input.province, "Province"),
    regency: validateRegion(input.regency, "City / regency"),
    district: validateRegion(input.district, "District"),
    village: validateRegion(input.village, "Village / subdistrict"),
    postalCode,
    street: clean(input.street, "Street", 2, 160),
    houseNumber: clean(input.houseNumber, "House number", 1, 20),
    rtRw: clean(input.rtRw || "", "RT/RW", 0, 30),
    unit: clean(input.unit || "", "Block or unit", 0, 60),
    landmark: clean(input.landmark || "", "Location landmark", 0, 160),
    isPrimary: input.isPrimary,
    coordinates: input.coordinates == null ? null : validateCoordinates(input.coordinates),
    createdAt: timestamp(input.createdAt, "Created date"),
    updatedAt: timestamp(input.updatedAt, "Updated date"),
  };
}

export function validateAddressBook(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 30)
    throw new Error("Saved addresses could not be verified.");
  const rows = value.map((item) => validateShippingAddress(item, { requireId: true }));
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error("Saved address IDs must be unique.");
  if (rows.length && rows.filter((row) => row.isPrimary).length !== 1)
    throw new Error("Saved addresses must have exactly one primary address.");
  return rows;
}