/**
 * Custodial key vault. Each farmer/merchant has an on-chain account whose private key is stored
 * encrypted with a key derived from (VAULT_SECRET, holder secret [PIN or password]). Neither the
 * server secret alone nor the PIN alone can unlock it. Production: HSM/MPC; this is the prototype shape.
 */
import crypto from "node:crypto";
import { ethers } from "ethers";
import { env } from "../env.ts";

function kek(secret: string, salt: Buffer): Buffer {
  return crypto.scryptSync(`${env.VAULT_SECRET}:${secret}`, salt, 32, { N: 16384, r: 8, p: 1 });
}

export function encryptKey(privateKey: string, secret: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", kek(secret, salt), iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(privateKey.replace(/^0x/, ""), "hex")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ct]).toString("base64");
}

export function decryptKey(encKey: string, secret: string): string {
  const buf = Buffer.from(encKey, "base64");
  const salt = buf.subarray(0, 16), iv = buf.subarray(16, 28), tag = buf.subarray(28, 44), ct = buf.subarray(44);
  const decipher = crypto.createDecipheriv("aes-256-gcm", kek(secret, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return "0x" + Buffer.concat([decipher.update(ct), decipher.final()]).toString("hex");
  } catch {
    throw new Error("PIN salah");
  }
}

export function createCustodiedAccount(secret: string): { address: string; encKey: string } {
  const w = ethers.Wallet.createRandom();
  return { address: w.address, encKey: encryptKey(w.privateKey, secret) };
}

export function unlockWallet(encKey: string, secret: string, provider?: ethers.Provider): ethers.Wallet {
  return new ethers.Wallet(decryptKey(encKey, secret), provider);
}

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
  return `${salt.toString("hex")}:${h.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hHex] = stored.split(":");
  const h = crypto.scryptSync(secret, Buffer.from(saltHex, "hex"), 32, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(h, Buffer.from(hHex, "hex"));
}

/** Pseudonymous farmer id committed on-chain, and the separate NIK lookup hash. Different peppers on purpose. */
export function pseudoIdFor(nik: string): string {
  return "0x" + crypto.createHash("sha256").update(`${env.VAULT_SECRET}:pseudo:${nik}`).digest("hex");
}
export function nikHashFor(nik: string): string {
  return crypto.createHash("sha256").update(`${env.VAULT_SECRET}:lookup:${nik}`).digest("hex");
}
export function maskNik(nik: string): string {
  return nik.slice(0, 4) + "********" + nik.slice(-4);
}
