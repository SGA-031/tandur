import { useEffect, useState } from "react";
import { api, type Notification } from "../api";
import { fmtDate, useT } from "../i18n";
import { Empty, Page, Skeleton, TopBar } from "../components/Shell";
import { useToast } from "../components/Toast";

export default function Inbox() {
  const { t } = useT();
  const toast = useToast();
  const [items, setItems] = useState<Notification[] | null>(null);

  useEffect(() => {
    api.notifications().then((r) => setItems(r.notifications)).catch((e) => { toast((e as Error).message, "error"); setItems([]); });
  }, [toast]);

  return (
    <Page>
      <TopBar title={t("inbox_title")} />
      {items === null && <div className="stack"><Skeleton h={90} w="85%" r={18} /><Skeleton h={70} w="80%" r={18} /></div>}
      {items && items.length === 0 && <Empty art="💬" title={t("inbox_empty_title")} sub={t("inbox_empty_sub")} />}
      {items && items.map((n) => (
        <div key={n.id} className="bubble">
          <div className="ch">{n.channel}</div>
          <div className="body">{n.body}</div>
          <div className="ts">{fmtDate(n.createdAt, { time: true, short: true })}</div>
        </div>
      ))}
    </Page>
  );
}
