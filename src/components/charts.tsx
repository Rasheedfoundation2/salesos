"use client";
import { Bar, BarChart, CartesianGrid, Cell, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/utils";

const axis = { fontSize: 11, fill: "#5b6b82" };
const fmt = (currency: string) => (v: number) => money(v, currency, true);

export function HBar({ data, currency, valueKey = "value", color = "#2563eb", height, count }: { data: { label: string; [k: string]: string | number | null }[]; currency?: string; valueKey?: string; color?: string; height?: number; count?: boolean }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data for this period.</p>;
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 34 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" tick={axis} tickFormatter={count ? undefined : fmt(currency ?? "AED")} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={axis} width={130} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => (count ? Number(v) : money(Number(v), currency ?? "AED"))} cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 8, borderColor: "#e3e8f0", fontSize: 12 }} />
        <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} fill={color} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StageFunnel({ data, currency }: { data: { label: string; color: string; value: number; count: number }[]; currency: string }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No stages.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#eef2f7" />
        <XAxis type="number" tick={axis} tickFormatter={fmt(currency)} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={axis} width={150} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v, _n, p) => [`${money(Number(v), currency)} · ${(p.payload as { count: number }).count} deals`, "Pipeline"]} cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 8, borderColor: "#e3e8f0", fontSize: 12 }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>{data.map((d) => <Cell key={d.label} fill={d.color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Trend({ data, currency }: { data: { month: string; won: number; created: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} tickFormatter={fmt(currency)} axisLine={false} tickLine={false} width={70} />
        <Tooltip formatter={(v, n) => [money(Number(v), currency), n === "won" ? "Revenue won" : "Pipeline created"]} contentStyle={{ borderRadius: 8, borderColor: "#e3e8f0", fontSize: 12 }} />
        <Bar dataKey="won" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Line dataKey="created" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
