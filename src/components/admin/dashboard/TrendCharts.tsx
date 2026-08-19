import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  BarChart,
} from "recharts";
import { GlassPanel } from "@/components/glass";
import { inr } from "@/lib/format";

export interface TrendPoint {
  key: string;
  label: string;
  collected: number;
  expenses: number;
  profit: number;
  rate: number;
}

const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const;

const compact = (v: number) =>
  v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);

function ChartTip({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-panel-border bg-panel-strong px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="capitalize text-muted-foreground">{p.name}</span>
          <span className="font-mono font-semibold" style={{ color: p.color }}>
            {money ? inr(p.value) : `${Math.round(p.value)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrendCharts({ data, selected }: { data: TrendPoint[]; selected: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <GlassPanel className="p-4 sm:p-5 lg:col-span-2">
        <h3 className="mb-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Collected vs expenses · last 6 months
        </h3>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--panel-border)" vertical={false} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} tickFormatter={compact} width={44} />
              <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--panel)" }} />
              <Bar name="collected" dataKey="collected" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {data.map((d) => (
                  <Cell key={d.key} fill="var(--violet)" opacity={d.key === selected ? 1 : 0.45} />
                ))}
              </Bar>
              <Bar name="expenses" dataKey="expenses" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {data.map((d) => (
                  <Cell key={d.key} fill="var(--magenta)" opacity={d.key === selected ? 1 : 0.45} />
                ))}
              </Bar>
              <Line name="profit" type="monotone" dataKey="profit" stroke="var(--emerald)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </GlassPanel>

      <GlassPanel className="p-4 sm:p-5">
        <h3 className="mb-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Collection rate</h3>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--panel-border)" vertical={false} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "var(--panel)" }} />
              <Bar name="rate" dataKey="rate" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {data.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.rate >= 80 ? "var(--emerald)" : d.rate >= 50 ? "var(--gold)" : "var(--rose)"}
                    opacity={d.key === selected ? 1 : 0.5}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassPanel>
    </div>
  );
}
