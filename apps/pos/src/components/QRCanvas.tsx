import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QRCanvas({ value, size = 360, dim }: { value: string; size?: number; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#12301F", light: "#FFFFFF" },
    }).catch(() => { /* leave blank */ });
  }, [value, size]);
  return (
    <div className={`qr-box${dim ? " dim" : ""}`}>
      <canvas ref={ref} width={size} height={size} aria-label="Kode QR pembayaran" />
      {dim && <div className="qr-overlay">QR tidak berlaku</div>}
    </div>
  );
}
