import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
// IMPORTANTE: Atualize os imports para as novas funções
import { getStoredSales, syncSales, SaleOrder } from "@/services/salesService"; 
import SalesChart from "@/components/dashboard/SalesChart";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { 
  DollarSign, ShoppingBag, Filter, Calendar, RefreshCw, Wallet, Package, ArrowUpDown, Loader2 
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner"; // Assumindo que você usa sonner ou use-toast

type SortConfig = { key: keyof SaleOrder | 'net_profit' | 'margin_percent' | 'date_created'; direction: 'asc' | 'desc' } | null;

export default function Sales() {
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [productImages, setProductImages] = useState<Record<string, string>>({});
  
  // Estados de Carregamento
  const [loadingData, setLoadingData] = useState(true); // Carregando do Banco
  const [isSyncing, setIsSyncing] = useState(false);    // Robô trabalhando

  // Filtros
  const [statusFilter, setStatusFilter] = useState("paid");
  const [periodFilter, setPeriodFilter] = useState("30d");

  // Ordenação (Padrão: Data decrescente)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date_created', direction: 'desc' });

  // 1. FUNÇÃO DE LEITURA (Do Banco de Dados)
  const loadData = async () => {
    setLoadingData(true);
    try {
      // Converte o filtro de texto para dias numéricos
      let days = 30;
      switch (periodFilter) {
         case "7d": days = 7; break;
         case "15d": days = 15; break;
         case "30d": days = 30; break;
         case "60d": days = 60; break;
         case "90d": days = 90; break;
         case "month": days = 30; break; // Simplificação, pode ajustar se quiser
         default: days = 30;
      }

      // Busca instantânea do Supabase
      const salesData = await getStoredSales(days);
      setOrders(salesData);

      // Busca Imagens (Thumbnails) da tabela products_snapshot
      const itemIds = salesData.map(o => o.items[0]?.id).filter(id => id);
      if (itemIds.length > 0) {
          const uniqueIds = [...new Set(itemIds)];
          const { data: products } = await supabase
            .from("products_snapshot")
            .select("item_id, thumbnail")
            .in("item_id", uniqueIds);
          
          const imgMap: Record<string, string> = {};
          products?.forEach(p => { imgMap[p.item_id] = p.thumbnail });
          setProductImages(imgMap);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar vendas.");
    } finally {
      setLoadingData(false);
    }
  };

  // 2. FUNÇÃO DE SINCRONIZAÇÃO (O Robô)
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      // 1. Pega o Token
      const { data: integration } = await supabase
        .from("integrations")
        .select("access_token, seller_id")
        .maybeSingle();

      if (!integration?.access_token || !integration?.seller_id) {
        toast.error("Integração não configurada.");
        return;
      }

      // 2. Dispara o Robô
      toast.info("Sincronizando vendas e financeiro...");
      await syncSales(integration.access_token, integration.seller_id, false); // false = sync rápida (últimas páginas)
      
      toast.success("Sincronização concluída!");
      
      // 3. Recarrega a tela com os dados novos
      await loadData();

    } catch (error) {
      console.error("Erro na sincronização:", error);
      toast.error("Falha ao sincronizar com Mercado Livre.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Recarrega sempre que mudar o filtro de período
  useEffect(() => { loadData(); }, [periodFilter]);

  // --- ORDENAÇÃO ---
  const requestSort = (key: keyof SaleOrder | 'net_profit' | 'margin_percent' | 'date_created') => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // --- FILTRAGEM + ORDENAÇÃO (Client Side) ---
  const processedOrders = useMemo(() => {
    let result = [...orders];

    // 1. Filtro de Status
    if (statusFilter !== "all") {
      result = result.filter(o => o.status === statusFilter);
    }

    // 2. Ordenação
    if (sortConfig) {
      result.sort((a, b) => {
        let valA: any = (a as any)[sortConfig.key];
        let valB: any = (b as any)[sortConfig.key];
        
        // Acessa propriedades aninhadas se necessário (ex: shipping.cost seria complexo aqui, mantemos nível raiz)
        // Se precisar ordenar por shipping, teria que achatar o objeto antes ou tratar aqui.
        
        if (sortConfig.key === 'date_created') {
             valA = new Date(valA).getTime();
             valB = new Date(valB).getTime();
        } else {
             valA = Number(valA || 0);
             valB = Number(valB || 0);
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [orders, statusFilter, sortConfig]);

  // --- KPIs ---
  const metrics = useMemo(() => {
    const revenue = processedOrders.reduce((acc, curr) => acc + curr.total_amount, 0);
    const profit = processedOrders.reduce((acc, curr) => acc + (curr.net_profit || 0), 0);
    const count = processedOrders.length;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const ticket = count > 0 ? revenue / count : 0;

    return { revenue, profit, count, margin, ticket };
  }, [processedOrders]);

  // --- GRÁFICO ---
  const chartData = useMemo(() => {
    const grouped: Record<string, { sales: number, count: number }> = {};
    // Garante ordem cronológica
    const chronological = [...processedOrders].sort((a,b) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime());

    chronological.forEach(order => {
      const date = format(parseISO(order.date_created), "dd/MM");
      if (!grouped[date]) grouped[date] = { sales: 0, count: 0 };
      grouped[date].sales += order.total_amount;
      grouped[date].count += 1;
    });

    return Object.keys(grouped).map(date => ({ 
        date, 
        sales: grouped[date].sales,
        count: grouped[date].count 
    }));
  }, [processedOrders]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-emerald-500/15 text-emerald-600 border-emerald-200";
      case "cancelled": return "bg-red-500/15 text-red-600 border-red-200";
      default: return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in max-w-[1600px] mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Raio-X Financeiro</h1>
            <p className="text-muted-foreground mt-1">Análise de lucro real por pedido.</p>
          </div>
          <Button onClick={handleSync} disabled={isSyncing} variant="default" className="w-full md:w-auto">
            {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {isSyncing ? "Sincronizando..." : "Atualizar ML"}
          </Button>
        </div>

        {/* FILTROS */}
        <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-6 items-center shadow-sm">
           <div className="flex flex-col gap-1.5">
             <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Filter className="w-3 h-3" /> Status</label>
             <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[150px] bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Pagos (Aprovados)</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                </SelectContent>
             </Select>
           </div>

           <div className="flex flex-col gap-1.5">
             <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Período</label>
             <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="h-9 w-[180px] bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="15d">Últimos 15 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="60d">Últimos 60 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                </SelectContent>
             </Select>
           </div>
           
           <div className="hidden md:flex flex-1 justify-end gap-6 text-sm">
             <div><span className="text-muted-foreground">Vendas:</span><span className="ml-2 font-bold">{metrics.count}</span></div>
             <div><span className="text-muted-foreground">Margem:</span><span className={`ml-2 font-bold ${metrics.margin > 15 ? "text-emerald-600" : "text-amber-600"}`}>{metrics.margin.toFixed(1)}%</span></div>
           </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento Real</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">R$ {metrics.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Líquido</CardTitle>
              <Wallet className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent><div className={`text-2xl font-bold ${metrics.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>R$ {metrics.profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Médio</CardTitle>
              <ShoppingBag className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-600">R$ {metrics.ticket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div></CardContent>
          </Card>
        </div>

        {/* GRÁFICO */}
        <SalesChart data={chartData} loading={loadingData} />

        {/* TABELA */}
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[100px] cursor-pointer hover:bg-muted/50" onClick={() => requestSort('date_created')}>
                      <div className="flex items-center gap-1">Data <ArrowUpDown className="w-3 h-3" /></div>
                  </TableHead>
                  <TableHead>Produto</TableHead>
                  
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('total_amount')}>
                    <div className="flex items-center justify-end gap-1">Venda <ArrowUpDown className="w-3 h-3" /></div>
                  </TableHead>
                  
                  <TableHead className="text-right text-red-500">Taxas ML</TableHead>
                  <TableHead className="text-right text-red-500">Envio</TableHead>
                  <TableHead className="text-right text-amber-600">Custo</TableHead>
                  
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('net_profit')}>
                     <div className="flex items-center justify-end gap-1">Lucro <ArrowUpDown className="w-3 h-3" /></div>
                  </TableHead>

                  <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => requestSort('margin_percent')}>
                     <div className="flex items-center justify-end gap-1">Margem <ArrowUpDown className="w-3 h-3" /></div>
                  </TableHead>

                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingData ? (
                  <TableRow><TableCell colSpan={9} className="text-center h-32 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2"><Loader2 className="animate-spin w-5 h-5"/> Carregando dados do banco...</div>
                  </TableCell></TableRow>
                ) : processedOrders.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center h-32 text-muted-foreground">Nenhuma venda encontrada para o período.</TableCell></TableRow>
                ) : (
                  processedOrders.map((order) => {
                    // Tenta pegar imagem do primeiro item
                    const itemId = order.items[0]?.id;
                    const thumb = itemId ? productImages[itemId] : null;
                    
                    // Valores Seguros
                    const fees = order.payments?.[0]?.marketplace_fee || 0;
                    const shipping = order.shipping?.cost || 0;
                    const cost = order.unit_cost || 0;
                    const profit = order.net_profit || 0;

                    return (
                        <TableRow key={order.id} className="hover:bg-muted/50 group">
                        <TableCell>
                            <div className="flex flex-col">
                            <span className="font-mono text-sm font-medium">{format(parseISO(order.date_created), "dd/MM")}</span>
                            <span className="text-[10px] text-muted-foreground">{format(parseISO(order.date_created), "HH:mm")}</span>
                            </div>
                        </TableCell>
                        <TableCell>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded bg-white border border-border flex-shrink-0 overflow-hidden flex items-center justify-center p-0.5">
                                    {thumb ? <img src={thumb} alt="" className="w-full h-full object-contain" /> : <Package className="w-5 h-5 text-muted-foreground/30" />}
                                </div>
                                <div className="flex flex-col max-w-[220px]">
                                    <span className="font-medium text-sm truncate" title={order.items[0]?.title}>{order.items[0]?.title || "Item Desconhecido"}</span>
                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                        <span className="font-mono opacity-70">#{order.id}</span>
                                        {order.items[0]?.quantity > 1 && <span className="text-foreground font-bold bg-secondary px-1 rounded">x{order.items[0].quantity}</span>}
                                    </div>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">R$ {order.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-red-500 text-xs font-mono">- {fees.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-red-500 text-xs font-mono">- {shipping.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-amber-600 text-xs font-mono">- {cost.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                            <div className={`font-bold text-sm ${profit > 0 ? "text-emerald-600" : "text-red-600"}`}>R$ {profit.toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className={`text-[10px] font-medium ${order.margin_percent && order.margin_percent > 15 ? "text-emerald-600" : "text-amber-600"}`}>{order.margin_percent?.toFixed(1)}%</div>
                        </TableCell>
                        <TableCell className="text-center">
                            <Badge variant="outline" className={`font-normal text-xs ${getStatusColor(order.status)}`}>{order.status === 'paid' ? 'Pago' : order.status}</Badge>
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