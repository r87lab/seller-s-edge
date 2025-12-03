import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface SalesChartProps {
  data: Array<{ date: string; sales: number; visits: number }>;
  loading?: boolean;
}

export default function SalesChart({ data, loading }: SalesChartProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
        <div className="h-5 w-40 bg-muted rounded mb-6 animate-pulse" />
        <div className="h-[300px] bg-muted/50 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 animate-fade-in">
      <h3 className="text-lg font-semibold mb-6">Evolução de Vendas (30 dias)</h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
            <XAxis
              dataKey="date"
              stroke="hsl(215, 20%, 55%)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(215, 20%, 55%)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(222, 47%, 10%)",
                border: "1px solid hsl(222, 30%, 18%)",
                borderRadius: "8px",
                color: "hsl(210, 40%, 98%)",
              }}
              labelStyle={{ color: "hsl(215, 20%, 55%)" }}
            />
            <Area
              type="monotone"
              dataKey="visits"
              stroke="hsl(199, 89%, 48%)"
              strokeWidth={2}
              fill="url(#visitsGradient)"
              name="Visitas"
            />
            <Area
              type="monotone"
              dataKey="sales"
              stroke="hsl(38, 92%, 50%)"
              strokeWidth={2}
              fill="url(#salesGradient)"
              name="Vendas"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm text-muted-foreground">Vendas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent" />
          <span className="text-sm text-muted-foreground">Visitas</span>
        </div>
      </div>
    </div>
  );
}