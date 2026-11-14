import { z } from "zod";

const imageUrlSchema = z.string().trim().min(1).max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Gambar portfolio harus memakai URL HTTP atau HTTPS tanpa kredensial.");

const portfolioFields = {
  title: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  image_url: imageUrlSchema,
};

export const createPortfolioItemSchema = z.object(portfolioFields).strict();
export const updatePortfolioItemSchema = z.object(portfolioFields).partial().strict().refine(
  (value) => Object.keys(value).length > 0,
  "Minimal satu kolom harus diubah.",
);
