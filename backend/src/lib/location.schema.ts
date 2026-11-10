import { z } from "zod";

const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

export const discoveryLocationSchema = z.object({
  version: z.literal(1),
  city: z.string().trim().max(120),
  coordinates: coordinatesSchema.nullable(),
  source: z.enum(["city", "manual", "geolocation"]),
  consent: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.coordinates) {
    if (!value.consent || value.source === "city") {
      ctx.addIssue({ code: "custom", message: "Persetujuan lokasi koordinat diperlukan.", path: ["consent"] });
    }
  } else if (value.source !== "city" || value.consent || value.city.length < 2) {
    ctx.addIssue({ code: "custom", message: "Lokasi kota harus berisi minimal dua karakter tanpa koordinat.", path: ["city"] });
  }
});

export const publicLocationSchema = z.object({
  version: z.literal(1),
  visibility: z.enum(["hidden", "area", "pin"]),
  area: z.string().trim().max(120),
  coordinates: coordinatesSchema.nullable(),
  confirmed: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const invalid = value.visibility === "hidden"
    ? value.area !== "" || value.coordinates !== null || value.confirmed
    : value.area.length < 2 || (value.visibility === "pin"
      ? !value.coordinates || !value.confirmed
      : value.coordinates !== null || value.confirmed);
  if (invalid) ctx.addIssue({ code: "custom", message: "Kombinasi visibilitas dan lokasi publik tidak valid." });
});
