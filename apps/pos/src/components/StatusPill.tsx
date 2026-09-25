import type { InvoiceStatus } from "@tandur/shared";
import { STATUS_LABEL } from "../api";

export function StatusPill({ status, large }: { status: InvoiceStatus; large?: boolean }) {
  return <span className={`pill pill-${status}${large ? " pill-lg" : ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}
