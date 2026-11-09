import jwt from "jsonwebtoken";

type AppRole = "USER" | "ADMIN";

export function createAccessToken(
  userId: string,
  role: AppRole,
  tokenVersion = 0,
): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET belum diatur dengan benar.");
  }

  return jwt.sign(
    { role, tokenVersion },
    secret,
    {
      subject: userId,
      expiresIn: "1d",
    }
  );
}