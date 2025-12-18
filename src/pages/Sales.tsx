import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  format, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval, 
  parseISO, 
  getDate,
  subDays
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign, ShoppingBag, XCircle, TrendingUp, TrendingDown, Filter, CalendarRange, Package } from "lucide-react";

// Interfaces
interface OrderItem {
  item: {
    id: string;
    title: string;
  };
  quantity: number;
  unit_price: number;
}

interface Order {
  id: string;
  ml_order_id: string;
  total_amount: number;
  date_created: string;
  status: string;
  items: OrderItem[];
}

interface ProductSnapshot {
  item_id: string;
  thumbnail: string;
  title: string;
}

export default function Sales() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, ProductSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [period, setPeriod] = useState("current_month");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Buscar Pedidos (90 dias) para histórico
      const ninetyDaysAgo = subMonths(new Date(), 3).toISOString();
      
      // Usamos 'as any' para contornar a tipagem estrita do Supabase enquanto não atualizamos os tipos globais
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders" as any)
        .select("*")
        .eq("user_id", user.id)
        .gte("date_created", ninetyDaysAgo)
        .order("date_created", { ascending: false });

      if (ordersError) throw ordersError;

      // 2. Buscar Produtos (Para pegar as FOTOS e Títulos bonitos)
      const { data: productsData, error: productsError } = await supabase
        .from("products_snapshot")
        .select("item_id, thumbnail, title");
      
      if (productsError) console.error("Erro ao buscar fotos:", productsError);

      // Criar mapa de produtos para acesso rápido: { "MLB123": { thumbnail: "..." } }
      const pMap: Record<string, ProductSnapshot> = {};
      if (productsData) {
        productsData.forEach((p: any) => {
          pMap[p.item_id] = p;
        });
      }
      setProductsMap(pMap);

      // Processar Pedidos
      setOrders((ordersData as any[]).map(o => ({
        id: o.id,
        ml_order_id: o.ml_order_id,
        total_amount: Number(o.total_amount),
        date_created: o.date_created,
        status: o.status,
        items: o.items || []
      })));

    } catch (error) {
      console.error("Erro geral:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- LÓGICA DE DATAS E COMPARAÇÃO PROPORCIONAL ---
  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date, compareStart: Date, compareEnd: Date;
    let label = "";

    switch (period) {
      case "last_month":
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        compareStart = startOfMonth(subMonths(now, 2));
        compareEnd = endOfMonth(subMonths(now, 2));
        label = format(start, "MMMM", { locale: ptBR });
        break;
      case "last_30":
        start = subDays(now, 30);
        end = now;
        compareStart = subDays(now, 60);
        compareEnd = subDays(now, 31);
        label = "Últimos 30 dias";
        break;
      case "current_month":
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        compareStart = startOfMonth(subMonths(now, 1));
        compareEnd = endOfMonth(subMonths(now, 1));
        label = format(start, "MMMM", { locale: ptBR }); // ex: Dezembro
        break;
    }
    return { start, end, compareStart, compareEnd, label };
  }, [period]);

  const metrics = useMemo(() => {
    const now = new Date();
    const currentDayOfMonth = getDate(now);

    // Filtros de Data (Período Atual)
    const currentOrders = orders.filter(o => 
      o.status === 'paid' && 
      isWithinInterval(parseISO(o.date_created), { start: dateRange.start, end: dateRange.end })
    );

    // Lógica Proporcional para Comparação (Ajuste para "Dia X vs Dia X")
    const previousOrders = orders.filter(o => {
      if (o.status !== 'paid') return false;
      const orderDate = parseISO(o.date_created);
      const inRange = isWithinInterval(orderDate, { start: dateRange.compareStart, end: dateRange.compareEnd });
      
      // Se estamos vendo o "Mês Atual", compare apenas até o mesmo dia do mês passado para não distorcer
      if (period === "current_month" && inRange) {
        return getDate(orderDate) <= currentDayOfMonth;
      }
      return inRange;
    });

    const currentRevenue = currentOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const previousRevenue = previousOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const growth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    
    // Contar cancelados no período
    const canceledCount = orders.filter(o => 
      o.status === 'cancelled' &&
      isWithinInterval(parseISO(o.date_created), { start: dateRange.start, end: dateRange.end })
    ).length;

    return { currentRevenue, previousRevenue, growth, currentCount: currentOrders.length, canceledCount };
  }, [orders, dateRange, period]);

  const filteredOrders = orders.filter(order => {
    const matchesStatus = statusFilter === "all" ? true : order.status === statusFilter;
    const matchesDate = isWithinInterval(parseISO(order.date_created), { start: dateRange.start, end: dateRange.end });
    return matchesStatus && matchesDate;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-emerald-500/15 text-emerald-600 border-emerald-200";
      case "cancelled": return "bg-red-500/15 text-red-600 border-red-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const translateStatus = (status: string) => {
    const map: Record<string, string> = { paid: "Pago", cancelled: "Cancelado", pending: "Pendente" };
    return map[status] || status;
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8 animate-fade-in">
        
        {/* BARRA DE CONTROLE (FILTROS) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatório de Vendas</h1>
            <p className="text-muted-foreground mt-1">Análise de performance e pedidos</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro de Status */}
            <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-lg px-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] border-0 bg-transparent focus:ring-0 h-8">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pagos</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro de Data */}
            <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-lg px-2">
              <CalendarRange className="w-4 h-4 text-muted-foreground" />
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[160px] border-0 bg-transparent focus:ring-0 h-8">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Este Mês</SelectItem>
                  <SelectItem value="last_month">Mês Passado</SelectItem>
                  <SelectItem value="last_30">Últimos 30 Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento ({dateRange.label})</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {metrics.currentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {metrics.growth >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
                <span className={metrics.growth >= 0 ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
                  {Math.abs(metrics.growth).toFixed(1)}%
                </span>
                vs período anterior
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Vendas Confirmadas</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.currentCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Pedidos pagos no período</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cancelamentos</CardTitle>
              <XCircle className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{metrics.canceledCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Pedidos perdidos no período</p>
            </CardContent>
          </Card>
        </div>

        {/* TABELA DETALHADA COM FOTOS */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[100px]">Data</TableHead>
                  <TableHead>Produto Vendido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Nenhum pedido encontrado.</TableCell></TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const mainItem = order.items?.[0];
                    // Truque: Tenta pegar a foto do banco de produtos, se não tiver, tenta do pedido, se não, ícone.
                    const productSnapshot = mainItem ? productsMap[mainItem.item.id] : null;
                    const thumbnail = productSnapshot?.thumbnail || null;
                    const title = productSnapshot?.title || mainItem?.item.title || "Produto desconhecido";

                    return (
                      <TableRow key={order.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-mono text-sm">{format(parseISO(order.date_created), "dd/MM")}</span>
                            <span className="text-[10px] text-muted-foreground">{format(parseISO(order.date_created), "HH:mm")}</span>
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          {mainItem ? (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded bg-white border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
                                {thumbnail ? (
                                  <img src={thumbnail} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <Package className="w-5 h-5 text-muted-foreground/50" />
                                )}
                              </div>
                              <div className="flex flex-col max-w-[300px]">
                                <span className="font-medium text-sm truncate" title={title}>
                                  {title}
                                </span>
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                  <span className="font-mono">ID: {order.ml_order_id}</span>
                                  {mainItem.quantity > 1 && <span className="text-foreground font-bold">x{mainItem.quantity}</span>}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-sm">Detalhes indisponíveis</span>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline" className={`font-normal text-xs ${getStatusColor(order.status)}`}>
                            {translateStatus(order.status)}
                          </Badge>
                        </TableCell>
                        
                        <TableCell className="text-right font-medium text-sm font-mono">
                          R$ {order.total_amount.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}