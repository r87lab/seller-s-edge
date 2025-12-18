import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

// CORREÇÃO 1: Tornar 'visits' opcional (?) e adicionar 'count' se necessário
interface SalesChartProps {
  data: Array<{ 
    date: string; 
    sales: number; 
    visits?: number; // Agora é opcional
    count?: number; 
  }>;
  loading?: boolean;
}

export default function SalesChart({ data, loading }: SalesChartProps) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 animate-pulse">
        <div className="h-5 w-40 bg-muted rounded mb-6" />
        <div className="h-[300px] bg-muted/50 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 animate-fade-in shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Evolução de Vendas (30 dias)</h3>
        {/* Legenda simples */}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="text-sm text-muted-foreground">Vendas (R$)</span>
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EAB308" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EAB308" stopOpacity={0} />
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `R$${value}`}
            />
            
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              itemStyle={{ color: "#EAB308" }}
              formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Vendas"]}
            />
            
            <Area
              type="monotone"
              dataKey="sales"
              stroke="#EAB308" // Cor Amarela (Primary)
              strokeWidth={2}
              fill="url(#salesGradient)"
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}