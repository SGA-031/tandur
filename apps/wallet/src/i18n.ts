import { useSyncExternalStore } from "react";

export type Lang = "id" | "en";
const KEY = "tandur.lang";

const dict = {
  id: {
    appName: "Tandur",
    tagline: "Program subsidi sarana produksi",
    ministry: "Kementerian Pertanian",
    nav_home: "Beranda", nav_history: "Riwayat", nav_inbox: "Pesan", nav_profile: "Profil",
    login_title: "Masuk ke Tandur", login_sub: "Gunakan NIK dan PIN yang diberikan penyuluh.",
    login_nik: "Nomor Induk Kependudukan (NIK)", login_nik_hint: "16 angka sesuai KTP",
    login_next: "Lanjut", login_pin_title: "Masukkan PIN", login_pin_sub: "6 angka rahasia Anda",
    login_change_nik: "Ganti NIK", login_busy: "Memeriksa…", login_failed: "Gagal masuk",
    login_nik_invalid: "NIK harus 16 angka",
    greeting_morning: "Selamat pagi", greeting_day: "Selamat siang", greeting_afternoon: "Selamat sore", greeting_night: "Selamat malam",
    home_total: "Total saldo subsidi", home_season: "Musim tanam", home_categories: "Jatah per kategori",
    home_used: "terpakai", home_of: "dari", home_valid_until: "Berlaku sampai", home_scan: "Pindai QR untuk bayar",
    home_no_balance: "Belum ada jatah subsidi untuk musim ini.", home_frozen: "Akun Anda dibekukan. Hubungi penyuluh atau kantor desa.",
    home_refresh: "Muat ulang",
    scan_title: "Pindai QR kasir", scan_hint: "Arahkan kamera ke kode QR di layar kasir.",
    scan_no_camera: "Kamera tidak tersedia. Tempel kode QR di bawah.", scan_paste_label: "Tempel kode QR",
    scan_paste_placeholder: "Tempel kode dari kasir di sini…", scan_paste_btn: "Periksa kode", scan_checking: "Memeriksa…",
    scan_use_paste: "Tidak bisa memindai? Tempel kode", scan_use_camera: "Gunakan kamera", scan_cancel: "Batal",
    pay_title: "Rincian belanja", pay_invoice: "No. nota", pay_items: "Barang", pay_coverage: "Jatah subsidi",
    pay_needed: "Perlu", pay_available: "Tersedia", pay_short: "kurang", pay_total: "Total bayar",
    pay_btn: "Bayar dengan PIN", pay_cannot: "Saldo tidak cukup untuk nota ini", pay_frozen: "Akun dibekukan, tidak bisa membayar",
    pay_expires: "Nota berlaku", pay_expired: "Nota kedaluwarsa. Minta kasir membuat nota baru.",
    pay_pin_title: "Masukkan PIN untuk membayar", pay_processing: "Mengirim ke ledger…", pay_retry: "Coba lagi",
    pay_success: "Pembayaran berhasil", pay_ledger: "Tercatat di ledger", pay_view: "Lihat bukti", pay_done: "Selesai",
    pay_missing: "Data nota tidak ditemukan. Pindai ulang kode QR.", pay_back_scan: "Pindai ulang",
    hist_title: "Riwayat belanja", hist_empty_title: "Belum ada belanja", hist_empty_sub: "Nota yang sudah dibayar akan muncul di sini.",
    inv_title: "Bukti pembayaran", inv_date: "Tanggal", inv_merchant: "Tempat belanja", inv_lines: "Barang", inv_cat_totals: "Per kategori",
    inv_total: "Total", inv_mode: "Cara bayar", inv_mode_scan: "Pindai QR", inv_mode_assisted: "Dibantu kasir",
    inv_proof: "Bukti di ledger", inv_hash: "Sidik jari nota", inv_tx: "Nomor transaksi", inv_block: "Blok",
    inv_verified: "Terverifikasi di ledger", inv_verifying: "Memeriksa ledger…", inv_unverified: "Belum terverifikasi",
    inv_share: "Bagikan", inv_print: "Cetak", inv_copied: "Teks bukti disalin", inv_not_found: "Bukti tidak ditemukan",
    inbox_title: "Pesan", inbox_empty_title: "Belum ada pesan", inbox_empty_sub: "Pemberitahuan pembayaran dan jatah akan muncul di sini.",
    prof_title: "Profil", prof_nik: "NIK", prof_phone: "Telepon", prof_address: "Alamat", prof_land: "Luas lahan", prof_commodity: "Komoditas",
    prof_status: "Status akun", prof_active: "Aktif", prof_frozen: "Dibekukan", prof_account: "Akun di ledger", prof_lang: "Bahasa",
    prof_help_title: "Butuh bantuan?", prof_help_body: "Hubungi penyuluh pertanian atau kantor desa Anda.",
    prof_logout: "Keluar", prof_logout_confirm: "Keluar dari Tandur?", prof_copied: "Disalin",
    offline: "Tidak ada koneksi internet", back: "Kembali", loading: "Memuat…", error_generic: "Terjadi kesalahan", retry: "Coba lagi",
    pin_delete: "Hapus", pin_clear: "Kosongkan", ok: "OK", cancel: "Batal", copy: "Salin", yes: "Ya", no: "Tidak",
    merchant_kdmp: "Koperasi Desa (KDMP)", merchant_kios: "Kios tani", merchant_dist: "Distributor",
    remaining: "Sisa", session_expired: "Sesi berakhir, masuk lagi",
  },
  en: {
    appName: "Tandur",
    tagline: "Farm input subsidy programme",
    ministry: "Ministry of Agriculture",
    nav_home: "Home", nav_history: "History", nav_inbox: "Inbox", nav_profile: "Profile",
    login_title: "Sign in to Tandur", login_sub: "Use the NIK and PIN given by your extension officer.",
    login_nik: "National ID number (NIK)", login_nik_hint: "16 digits as on your ID card",
    login_next: "Continue", login_pin_title: "Enter PIN", login_pin_sub: "Your 6-digit secret PIN",
    login_change_nik: "Change NIK", login_busy: "Checking…", login_failed: "Sign-in failed",
    login_nik_invalid: "NIK must be 16 digits",
    greeting_morning: "Good morning", greeting_day: "Good day", greeting_afternoon: "Good afternoon", greeting_night: "Good evening",
    home_total: "Total subsidy balance", home_season: "Planting season", home_categories: "Allowance per category",
    home_used: "used", home_of: "of", home_valid_until: "Valid until", home_scan: "Scan QR to pay",
    home_no_balance: "No subsidy allowance for this season yet.", home_frozen: "Your account is frozen. Contact your extension officer or village office.",
    home_refresh: "Refresh",
    scan_title: "Scan cashier QR", scan_hint: "Point the camera at the QR code on the cashier's screen.",
    scan_no_camera: "Camera unavailable. Paste the QR code below.", scan_paste_label: "Paste QR code",
    scan_paste_placeholder: "Paste the code from the cashier here…", scan_paste_btn: "Check code", scan_checking: "Checking…",
    scan_use_paste: "Can't scan? Paste the code", scan_use_camera: "Use camera", scan_cancel: "Cancel",
    pay_title: "Purchase details", pay_invoice: "Invoice no.", pay_items: "Items", pay_coverage: "Subsidy allowance",
    pay_needed: "Needed", pay_available: "Available", pay_short: "short", pay_total: "Total to pay",
    pay_btn: "Pay with PIN", pay_cannot: "Balance not enough for this invoice", pay_frozen: "Account frozen, cannot pay",
    pay_expires: "Invoice valid for", pay_expired: "Invoice expired. Ask the cashier for a new one.",
    pay_pin_title: "Enter PIN to pay", pay_processing: "Sending to ledger…", pay_retry: "Try again",
    pay_success: "Payment successful", pay_ledger: "Recorded on ledger", pay_view: "View receipt", pay_done: "Done",
    pay_missing: "Invoice data not found. Scan the QR code again.", pay_back_scan: "Scan again",
    hist_title: "Purchase history", hist_empty_title: "No purchases yet", hist_empty_sub: "Paid invoices will appear here.",
    inv_title: "Payment receipt", inv_date: "Date", inv_merchant: "Merchant", inv_lines: "Items", inv_cat_totals: "Per category",
    inv_total: "Total", inv_mode: "Payment mode", inv_mode_scan: "QR scan", inv_mode_assisted: "Cashier-assisted",
    inv_proof: "Ledger proof", inv_hash: "Invoice fingerprint", inv_tx: "Transaction id", inv_block: "Block",
    inv_verified: "Verified on ledger", inv_verifying: "Checking ledger…", inv_unverified: "Not yet verified",
    inv_share: "Share", inv_print: "Print", inv_copied: "Receipt text copied", inv_not_found: "Receipt not found",
    inbox_title: "Inbox", inbox_empty_title: "No messages yet", inbox_empty_sub: "Payment and allowance notices will appear here.",
    prof_title: "Profile", prof_nik: "NIK", prof_phone: "Phone", prof_address: "Address", prof_land: "Land area", prof_commodity: "Commodity",
    prof_status: "Account status", prof_active: "Active", prof_frozen: "Frozen", prof_account: "Ledger account", prof_lang: "Language",
    prof_help_title: "Need help?", prof_help_body: "Contact your agricultural extension officer or village office.",
    prof_logout: "Sign out", prof_logout_confirm: "Sign out of Tandur?", prof_copied: "Copied",
    offline: "No internet connection", back: "Back", loading: "Loading…", error_generic: "Something went wrong", retry: "Try again",
    pin_delete: "Delete", pin_clear: "Clear", ok: "OK", cancel: "Cancel", copy: "Copy", yes: "Yes", no: "No",
    merchant_kdmp: "Village cooperative (KDMP)", merchant_kios: "Farm kiosk", merchant_dist: "Distributor",
    remaining: "Remaining", session_expired: "Session ended, sign in again",
  },
} as const;

export type Key = keyof typeof dict.id;

let current: Lang = (() => { try { const v = localStorage.getItem(KEY); return v === "en" ? "en" : "id"; } catch { return "id"; } })();
const listeners = new Set<() => void>();

export function getLang(): Lang { return current; }
export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function t(key: Key): string { return (dict[current] as Record<string, string>)[key] ?? dict.id[key] ?? key; }

/** Re-renders the component when the language changes. Returns t bound to the current language. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return { t, lang, setLang };
}

/* ---------- locale helpers ---------- */
export function fmtDate(iso: string | number | Date, opts: { time?: boolean; short?: boolean } = {}): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = current === "en" ? "en-GB" : "id-ID";
  const o: Intl.DateTimeFormatOptions = opts.short
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "long", year: "numeric" };
  if (opts.time) { o.hour = "2-digit"; o.minute = "2-digit"; }
  return new Intl.DateTimeFormat(locale, o).format(d);
}
export function fmtTime(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(current === "en" ? "en-GB" : "id-ID", { hour: "2-digit", minute: "2-digit" }).format(d);
}
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function merchantTypeLabel(type: string | undefined): string {
  const k = (type ?? "").toLowerCase();
  if (k === "kdmp") return t("merchant_kdmp");
  if (k === "kios") return t("merchant_kios");
  if (k === "dist") return t("merchant_dist");
  return type ?? "";
}
export function catLabel(code: string, fallback: string): string {
  return fallback || code;
}
