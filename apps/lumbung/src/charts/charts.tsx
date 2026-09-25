import { useState, type ReactNode } from "react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from "recharts";
import { CHROME, SERIES, categoryColor } from "./palette";
import { idr, idrCompact, int, fmtDayShort, fmtDate } from "../lib/format";

/* ---------- Shared bits ---------- */
export function Legend({ items, line }: { items: { label: string; color: string }[]; line?: boolean }) {
  return <div className="legend" aria-label="Legenda">{items.map((i) => <span key={i.label}><i className={line ? "ln" : ""} style={{ background: i.color }} />{i.label}</span>)}</div>;
}

type TipRow = { label: string; value: string; color?: string; sq?: boolean };
export function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="chart-tip">
      <div className="t">{title}</div>
      {rows.map((r) => <div className="row" key={r.label}><span className="k">{r.color && <i className={r.sq ? "sq" : ""} style={{ background: r.color }} />}{r.label}</span><span className="v">{r.value}</span></div>)}
    </div>
  );
}

/** Chart / table toggle wrapper. Every chart ships with a table-view twin. */
export function ChartFrame({ chart, table, height = 260, legend, fading }: { chart: ReactNode; table: ReactNode; height?: number; legend?: ReactNode; fading?: boolean }) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  return (
    <div className={`chart ${fading ? "chart-fading" : ""}`}>
      <div className="row spread" style={{ marginBottom: 6 }}>
        <div>{legend}</div>
        <div className="seg" role="tablist" aria-label="Tampilan">
          <button className={mode === "chart" ? "on" : ""} onClick={() => setMode("chart")}>Grafik</button>
          <button className={mode === "table" ? "on" : ""} onClick={() => setMode("table")}>Tabel</button>
        </div>
      </div>
      {mode === "chart" ? <div style={{ height }}>{chart}</div> : <div style={{ maxHeight: height + 40, overflow: "auto" }}>{table}</div>}
    </div>
  );
}

const axisProps = { tickLine: false, axisLine: { stroke: CHROME.axis }, tick: { fill: CHROME.muted, fontSize: 11.5 } } as const;
const compactTick = (v: number) => idrCompact(v).replace("Rp ", "");

/* ---------- Time series (single or two series) ---------- */
export interface TimePoint { day: string; total: number; invoices?: number; [k: string]: unknown }
export function TimeSeriesChart({ data, height = 260, series = [{ key: "total", label: "Pengeluaran", color: SERIES.primary }], area = true, fading }: { data: TimePoint[]; height?: number; series?: { key: string; label: string; color: string }[]; area?: boolean; fading?: boolean }) {
  const table = (
    <table className="dt"><thead><tr><th>Tanggal</th>{series.map((s) => <th key={s.key} className="r">{s.label}</th>)}{data.some((d) => d.invoices !== undefined) && <th className="r">Invoice</th>}</tr></thead>
      <tbody>{data.map((d) => <tr key={d.day}><td>{fmtDate(d.day)}</td>{series.map((s) => <td key={s.key} className="r">{idr(d[s.key])}</td>)}{d.invoices !== undefined && <td className="r">{int(d.invoices)}</td>}</tr>)}</tbody></table>
  );
  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={CHROME.grid} vertical={false} />
        <XAxis dataKey="day" tickFormatter={(v: string) => fmtDayShort(v)} {...axisProps} minTickGap={24} />
        <YAxis tickFormatter={compactTick} width={54} {...axisProps} axisLine={false} />
        <Tooltip cursor={{ stroke: CHROME.axis, strokeWidth: 1 }} content={({ active, payload, label }) => active && payload?.length ? (
          <TipBox title={fmtDate(String(label))} rows={[...series.map((s) => ({ label: s.label, value: idr((payload[0].payload as TimePoint)[s.key]), color: s.color })), ...((payload[0].payload as TimePoint).invoices !== undefined ? [{ label: "Invoice", value: int((payload[0].payload as TimePoint).invoices) }] : [])]} />
        ) : null} />
        {series.map((s, i) => area && i === 0 ? <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={s.color} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }} isAnimationActive={false} />
          : <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }} isAnimationActive={false} />)}
      </ComposedChart>
    </ResponsiveContainer>
  );
  return <ChartFrame chart={chart} table={table} height={height} fading={fading} legend={series.length > 1 ? <Legend line items={series.map((s) => ({ label: s.label, color: s.color }))} /> : null} />;
}

/** Value at the bar tip, drawn as plain SVG text so recharts cannot word-wrap it to the bar's width. */
function BarEndLabel(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string }) {
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 6, y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2;
  return <text x={x} y={y} dy={4} fill={CHROME.muted} fontSize={11.5} textAnchor="start">{idrCompact(Number(props.value ?? 0))}</text>;
}

/* ---------- Horizontal bars (categorical, one value per row) ---------- */
export interface BarRow { key: string; label: string; value: number; color?: string; sub?: string; count?: number }
export function HorizontalBars({ rows, height, byCategory, fading, valueLabel = "Pengeluaran", labelWidth = 120 }: { rows: BarRow[]; height?: number; byCategory?: boolean; fading?: boolean; valueLabel?: string; labelWidth?: number }) {
  const h = height ?? Math.max(120, rows.length * 34 + 30);
  const table = (
    <table className="dt"><thead><tr><th>Kategori</th><th className="r">{valueLabel}</th>{rows.some((r) => r.count !== undefined) && <th className="r">Invoice</th>}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="r">{idr(r.value)}</td>{r.count !== undefined && <td className="r">{int(r.count)}</td>}</tr>)}</tbody></table>
  );
  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 84, bottom: 4, left: 4 }} barCategoryGap={8}>
        <CartesianGrid stroke={CHROME.grid} horizontal={false} />
        <XAxis type="number" tickFormatter={compactTick} {...axisProps} axisLine={false} />
        <YAxis type="category" dataKey="label" width={labelWidth} {...axisProps} axisLine={false} interval={0} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
        <Tooltip cursor={{ fill: "rgba(30,27,22,.04)" }} content={({ active, payload }) => active && payload?.length ? (() => { const r = payload[0].payload as BarRow; return <TipBox title={r.label} rows={[{ label: valueLabel, value: idr(r.value), color: r.color ?? (byCategory ? categoryColor(r.key) : SERIES.primary), sq: true }, ...(r.count !== undefined ? [{ label: "Invoice", value: int(r.count) }] : [])]} />; })() : null} />
        <Bar dataKey="value" maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false} label={<BarEndLabel />}>
          {rows.map((r) => <Cell key={r.key} fill={r.color ?? (byCategory ? categoryColor(r.key) : SERIES.primary)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  return <ChartFrame chart={chart} table={table} height={h} fading={fading} />;
}

/* ---------- Grouped bars (2 series) ---------- */
export interface GroupRow { label: string; a: number; b: number }
export function GroupedBars({ rows, aLabel, bLabel, aColor = SERIES.issued, bColor = SERIES.spent, height, fading }: { rows: GroupRow[]; aLabel: string; bLabel: string; aColor?: string; bColor?: string; height?: number; fading?: boolean }) {
  const h = height ?? Math.max(140, rows.length * 44 + 30);
  const table = (
    <table className="dt"><thead><tr><th>Wilayah</th><th className="r">{aLabel}</th><th className="r">{bLabel}</th><th className="r">Rasio</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="r">{idr(r.a)}</td><td className="r">{idr(r.b)}</td><td className="r">{r.a ? `${((r.b / r.a) * 100).toFixed(1)}%` : "–"}</td></tr>)}</tbody></table>
  );
  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap={10} barGap={2}>
        <CartesianGrid stroke={CHROME.grid} horizontal={false} />
        <XAxis type="number" tickFormatter={compactTick} {...axisProps} axisLine={false} />
        <YAxis type="category" dataKey="label" width={120} {...axisProps} axisLine={false} interval={0} />
        <Tooltip cursor={{ fill: "rgba(30,27,22,.04)" }} content={({ active, payload }) => active && payload?.length ? (() => { const r = payload[0].payload as GroupRow; return <TipBox title={r.label} rows={[{ label: aLabel, value: idr(r.a), color: aColor, sq: true }, { label: bLabel, value: idr(r.b), color: bColor, sq: true }, { label: "Rasio", value: r.a ? `${((r.b / r.a) * 100).toFixed(1)}%` : "–" }]} />; })() : null} />
        <Bar dataKey="a" name={aLabel} fill={aColor} maxBarSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        <Bar dataKey="b" name={bLabel} fill={bColor} maxBarSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
  return <ChartFrame chart={chart} table={table} height={h} fading={fading} legend={<Legend items={[{ label: aLabel, color: aColor }, { label: bLabel, color: bColor }]} />} />;
}

/* ---------- Inline progress bars (issued / spent / remaining per category) ---------- */
export function BalanceBars({ rows }: { rows: { key: string; label: string; issued: number; spent: number; color: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="bars">
      {rows.map((r) => {
        const p = r.issued ? Math.min(100, (r.spent / r.issued) * 100) : 0;
        return (
          <div className="bar-row" key={r.key} title={`${r.label}: terpakai ${idr(r.spent)} dari ${idr(r.issued)}`}>
            <span className="cat"><i style={{ background: r.color }} />{r.label}</span>
            <div className="track"><i style={{ width: `${p}%`, background: r.color }} /></div>
            <span className="v">{idrCompact(r.spent)} / {idrCompact(r.issued)}</span>
          </div>
        );
      })}
    </div>
  );
}
