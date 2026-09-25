import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_BY_CODE, formatIDR, type CategoryCode, type InvoiceDTO } from "@tandur/shared";
import { api } from "../api";
import { dayKey, fmtDate, fmtTime, useT } from "../i18n";
import { Empty, Page, Skeleton, TopBar } from "../components/Shell";
import { useToast } from "../components/Toast";

export default function History() {
  const { t } = useT();
  const toast = useToast();
  const [items, setItems] = useState<InvoiceDTO[] | null>(null);

  useEffect(() => {
    api.invoices().then((r) => setItems(r.invoices)).catch((e) => { toast((e as Error).message, "error"); setItems([]); });
  }, [toast]);

  const groups = new Map<string, InvoiceDTO[]>();
  for (const inv of items ?? []) {
    const k = dayKey(inv.paidAt ?? inv.createdAt);
    groups.set(k, [...(groups.get(k) ?? []), inv]);
  }

  return (
    <Page>
      <TopBar title={t("hist_title")} />
      {items === null && <div className="card"><Skeleton h={56} /><Skeleton h={56} style={{ marginTop: 12 }} /><Skeleton h={56} style={{ marginTop: 12 }} /></div>}
      {items && items.length === 0 && <Empty art="🧺" title={t("hist_empty_title")} sub={t("hist_empty_sub")} />}
      {Array.from(groups.entries()).map(([day, list]) => (
        <section key={day}>
          <div className="date-head">{fmtDate(list[0].paidAt ?? list[0].createdAt)}</div>
          <div className="card tight list">
            {list.map((inv) => (
              <Link key={inv.id} to={`/invoice/${inv.id}`} className="item">
                <div className="lead" aria-hidden>{CATEGORY_BY_CODE[Object.keys(inv.categoryTotals)[0] as CategoryCode]?.icon ?? "🧾"}</div>
                <div className="grow">
                  <div className="title">{inv.merchant.name}</div>
                  <div className="chips" style={{ margin: "4px 0" }}>
                    {(Object.keys(inv.categoryTotals) as CategoryCode[]).map((c) => <span key={c} className="chip">{CATEGORY_BY_CODE[c]?.short ?? c}</span>)}
                  </div>
                  <div className="sub">{fmtTime(inv.paidAt ?? inv.createdAt)} · {inv.invoiceNo}</div>
                </div>
                <div className="amt num">{formatIDR(inv.total)}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </Page>
  );
}
