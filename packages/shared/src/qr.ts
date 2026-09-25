/**
 * Tandur merchant-presented QR, encoded in EMVCo MPM TLV grammar (the same grammar QRIS uses),
 * but under Tandur's own merchant-account template so it never masquerades as QRIS.
 *
 * Root tags
 *  00 payload format indicator      "01"
 *  01 point of initiation method    "12" (dynamic, one invoice)
 *  26 merchant account info (template)
 *      00 globally unique id        "id.tandur"
 *      01 merchant address (0x..)
 *      02 invoice id (uuid)
 *  52 merchant category code        "5193" (agricultural supplies)
 *  53 transaction currency          "360" (IDR)
 *  54 transaction amount            integer rupiah
 *  58 country code                  "ID"
 *  59 merchant name
 *  60 merchant city
 *  62 additional data (template)
 *      01 bill number               invoice no
 *  80 invoice hash (0x + 64 hex)          } Tandur data lives in root tags 80-82 because an EMVCo
 *  81 expiry unix seconds                  } template body is limited to 99 characters
 *  82 category totals "PUPUK:120000;BENIH:50000"
 *  63 CRC-16/CCITT-FALSE over everything up to and including "6304"
 */
export interface TandurQR {
  merchantAddress: string;
  invoiceId: string;
  invoiceNo: string;
  amount: number;
  merchantName: string;
  merchantCity: string;
  invoiceHash: string;
  expiresAt: number;
  categoryTotals: Record<string, number>;
}

function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  if (value.length > 99) throw new Error(`TLV value too long for tag ${tag}`);
  return tag + len + value;
}

export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(input);
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function encodeTandurQR(q: TandurQR): string {
  const merchantInfo = tlv("00", "id.tandur") + tlv("01", q.merchantAddress) + tlv("02", q.invoiceId);
  const additional = tlv("01", q.invoiceNo.slice(0, 40));
  const cats = Object.entries(q.categoryTotals).map(([k, v]) => `${k}:${v}`).join(";");
  let s =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", merchantInfo) +
    tlv("52", "5193") +
    tlv("53", "360") +
    tlv("54", String(q.amount)) +
    tlv("58", "ID") +
    tlv("59", q.merchantName.slice(0, 25)) +
    tlv("60", q.merchantCity.slice(0, 15)) +
    tlv("62", additional) +
    tlv("80", q.invoiceHash) +
    tlv("81", String(q.expiresAt)) +
    tlv("82", cats) +
    "6304";
  return s + crc16ccitt(s);
}

function parseTLV(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) throw new Error("bad TLV length");
    out[tag] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

export function decodeTandurQR(payload: string): TandurQR {
  const body = payload.slice(0, -4);
  const crc = payload.slice(-4);
  if (crc16ccitt(body) !== crc.toUpperCase()) throw new Error("CRC mismatch: QR rusak atau bukan QR Tandur");
  const root = parseTLV(body);
  const m = parseTLV(root["26"] ?? "");
  if (m["00"] !== "id.tandur") throw new Error("Bukan QR Tandur");
  const add = parseTLV(root["62"] ?? "");
  const categoryTotals: Record<string, number> = {};
  for (const part of (root["82"] ?? "").split(";").filter(Boolean)) {
    const [k, v] = part.split(":");
    categoryTotals[k] = Number(v);
  }
  return {
    merchantAddress: m["01"],
    invoiceId: m["02"],
    invoiceNo: add["01"] ?? "",
    amount: Number(root["54"]),
    merchantName: root["59"] ?? "",
    merchantCity: root["60"] ?? "",
    invoiceHash: root["80"],
    expiresAt: Number(root["81"]),
    categoryTotals,
  };
}
