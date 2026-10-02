import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export async function signUserToken(
  secret: string,
  userId: string,
  email: string,
  orgId: string,
  role: "owner" | "admin" | "member" | "viewer" = "owner",
  expiresIn = "7d",
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub: userId, email, role: "user", org_id: orgId, org_role: role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyUserToken(
  secret: string,
  token: string,
): Promise<JWTPayload & { sub: string; email?: string; org_id?: string; org_role?: string }> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Invalid token");
  if (payload.role === "portal") throw new Error("Invalid token");
  return payload as JWTPayload & { sub: string; email?: string; org_id?: string; org_role?: string };
}

export async function signPortalToken(secret: string, companyId: string, email: string, expiresIn = "7d"): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub: companyId, email, role: "portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyPortalToken(
  secret: string,
  token: string,
): Promise<{ companyId: string; email?: string }> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (payload.role !== "portal" || !payload.sub || typeof payload.sub !== "string") throw new Error("Invalid token");
  return { companyId: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}
