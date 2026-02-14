import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Bar,
  ComposedChart
} from "recharts";

interface SalesChartProps {
  data: Array<{ 
    date: string; 
    sales: number; 
    count: number; // Agora aceita contagem
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
        <h3 className="text-lg font-semibold">Evolução de Vendas</h3>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-muted-foreground">Faturamento (R$)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500/50" />
            <span className="text-muted-foreground">Qtd. Vendas</span>
          </div>
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            
            {/* Eixo Esquerdo (Dinheiro) */}
            <YAxis
              yAxisId="left"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `R$${value}`}
            />

            {/* Eixo Direito (Quantidade) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number, name: string) => {
                  if (name === 'sales') return [`R$ ${value.toFixed(2)}`, "Faturamento"];
                  if (name === 'count') return [value, "Vendas"];
                  return [value, name];
              }}
            />
            
            {/* Barras de Quantidade (Ficam atrás) */}
            <Bar 
                yAxisId="right"
                dataKey="count" 
                fill="#3b82f6" 
                opacity={0.2}
                barSize={20}
                radius={[4, 4, 0, 0]}
            />

            {/* Linha de Faturamento (Fica na frente) */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="sales"
              stroke="#EAB308"
              strokeWidth={2}
              fill="url(#salesGradient)"
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}