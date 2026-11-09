import jwt from "jsonwebtoken";

type AppRole = "USER" | "ADMIN";

export function createAccessToken(
  userId: string,
  role: AppRole
): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET belum diatur dengan benar.");
  }

  return jwt.sign(
    { role },
    secret,
    {
      subject: userId,
      expiresIn: "1d",
    }
  );
}