import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export async function signUserToken(
  secret: string,
  userId: string,
  email: string,
  expiresIn = "7d",
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyUserToken(secret: string, token: string): Promise<JWTPayload & { sub: string; email?: string }> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Invalid token");
  return payload as JWTPayload & { sub: string; email?: string };
}
