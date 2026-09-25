import { SignJWT, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.ts";

export type Principal = { sub: string; kind: "farmer" | "merchant" | "admin"; name: string; role?: string };
const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function issueToken(p: Principal): Promise<string> {
  return new SignJWT(p as any).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret);
}

export async function verifyToken(token: string): Promise<Principal> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as Principal;
}

declare module "fastify" {
  interface FastifyRequest { principal?: Principal; }
}

export function requireKind(kind: Principal["kind"]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : (req.query as any)?.token;
    if (!token) return reply.code(401).send({ error: "Belum masuk (unauthenticated)" });
    try {
      const p = await verifyToken(token);
      if (p.kind !== kind) return reply.code(403).send({ error: "Akses ditolak" });
      req.principal = p;
    } catch {
      return reply.code(401).send({ error: "Sesi berakhir, masuk lagi" });
    }
  };
}
