import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Eye, TrendingUp, RefreshCw, Link2, Download, DollarSign, Calendar, ShoppingBag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, subDays, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import DashboardLayout from "@/components/layout/DashboardLayout";
import StatCard from "@/components/dashboard/StatCard";
import SalesChart from "@/components/dashboard/SalesChart";
import ProductsTable from "@/components/dashboard/ProductsTable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Interface Completa
interface Product {
  id: string; item_id: string; title: string; price: number; permalink: string; thumbnail: string; seller_sku: string | null; status: string; visits_last_30_days: number; sales_last_30_days: number; 
  sold_quantity_total?: number | null; 
  sales_previous_30_days?: number; strategic_action: string | null; my_notes: string | null; date_created: string | null; cost_price?: number; listing_type_id?: string; custom_tax_rate?: number; logistic_type?: string; health?: number; free_shipping?: boolean; average_shipping_cost?: number; catalog_listing?: boolean;
}
interface Order {
  id: string; total_amount: number; date_created: string; status: string;
}
interface Integration {
  id: string; seller_id: string | null; access_token: string;
}

export default function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]); 
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState("30"); 
  const [sortType, setSortType] = useState("30d"); // Pode ser '30d', '60d' ou 'total'
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: integrationData } = await supabase.from("integrations").select("*").maybeSingle();
      setIntegration(integrationData);

      // Busca produtos
      const { data: productsData, error } = await supabase.from("products_snapshot").select("*").order("sales_last_30_days", { ascending: false });
      if (error) throw error;
      setProducts((productsData as Product[]) || []);

      // Busca pedidos (Buffer de 65 dias)
      const bufferDate = subDays(new Date(), 65).toISOString();
      const { data: ordersData, error: ordersError } = await (supabase.from("orders" as any).select("*").gte("date_created", bufferDate).order("date_created", { ascending: true }));
      if (ordersError) throw ordersError;
      
      const mappedOrders: Order[] = (ordersData as any[] || []).map(o => ({ id: o.id, total_amount: Number(o.total_amount), date_created: o.date_created, status: o.status }));
      setOrders(mappedOrders);

    } catch (error: any) { console.error("Erro ao buscar dados:", error); } 
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []); 

  const handleSyncAds = async () => {
    if (!integration) { navigate("/integration"); return; }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-sync", { body: {} });
      if (error) throw error;
      toast({ title: "Anúncios Atualizados!", description: `${data?.synced || 0} produtos.` });
      fetchData();
    } catch (error: any) { toast({ title: "Erro", description: error.message, variant: "destructive" }); } 
    finally { setSyncing(false); }
  };

  const handleSyncOrders = async () => {
    if (!integration) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ml-orders-sync');
      if (error) throw error;
      toast({ title: "Sucesso!", description: `Vendas sincronizadas.` });
      await fetchData();
    } catch (error: any) { 
      console.error(error); 
      toast({ title: "Erro de Sincronização", description: error.message, variant: "destructive" }); 
    } finally { setSyncing(false); }
  };

  // 1. Métricas Gerais (KPIs)
  const [filteredOrders, stats] = useMemo(() => {
    const cutoffDate = subDays(new Date(), Number(period));
    const currentOrders = orders.filter(o => parseISO(o.date_created) >= cutoffDate);
    const paidOrders = currentOrders.filter(o => o.status === 'paid');
    
    const revenue = paidOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
    const count = paidOrders.length;
    const ticket = count > 0 ? revenue / count : 0;
    
    const totalVisitsRaw = products.reduce((sum, p) => sum + (p.visits_last_30_days || 0), 0);
    const estimatedVisits = Math.round(totalVisitsRaw * (Number(period) / 30)); 
    const conversion = estimatedVisits > 0 ? ((count / estimatedVisits) * 100) : 0;
    
    return [currentOrders, { revenue, count, ticket, conversion }];
  }, [orders, products, period]);

  // 2. Dados do Gráfico
  const chartData = useMemo(() => {
    const daysCount = Number(period);
    const days = Array.from({ length: daysCount }, (_, i) => {
      const date = subDays(new Date(), daysCount - 1 - i);
      return { dateObj: date, date: format(date, "dd/MM", { locale: ptBR }), sales: 0 };
    });

    filteredOrders.forEach(order => {
      if (order.status === 'paid') {
        const orderDate = parseISO(order.date_created);
        const dayStat = days.find(d => isSameDay(d.dateObj, orderDate));
        if (dayStat) dayStat.sales += Number(order.total_amount);
      }
    });
    return days;
  }, [filteredOrders, period]);

  // 3. Lógica de Ordenação Inteligente (30d, 60d, Total)
  const topProductsSorted = useMemo(() => {
    // Filtra produtos que tenham alguma venda em qualquer período relevante
    const activeProducts = products.filter(p => 
        (p.sales_last_30_days || 0) > 0 || 
        (p.sales_previous_30_days || 0) > 0 ||
        (p.sold_quantity_total || 0) > 0
    );

    return activeProducts.sort((a, b) => {
        if (sortType === '30d') {
            return (b.sales_last_30_days || 0) - (a.sales_last_30_days || 0);
        }
        if (sortType === '60d') {
            // Soma mês atual + mês anterior
            const sales60dA = (a.sales_last_30_days || 0) + (a.sales_previous_30_days || 0);
            const sales60dB = (b.sales_last_30_days || 0) + (b.sales_previous_30_days || 0);
            return sales60dB - sales60dA;
        }
        // Total Geral
        return (Number(b.sold_quantity_total) || 0) - (Number(a.sold_quantity_total) || 0);
    }).slice(0, 5);
  }, [products, sortType]);

  // Título Dinâmico
  const tableTitle = {
    '30d': 'Top Performance (Últimos 30 dias)',
    '60d': 'Top Performance (Últimos 60 dias)',
    'total': 'Top Performance (Total Geral)'
  }[sortType];

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
            <p className="text-muted-foreground text-sm">Resumo da operação e saúde da conta</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">Top Performance</h2>

            {!integration ? (
              <Button onClick={() => navigate("/integration")} variant="outline" size="sm" className="gap-2 border-primary text-primary">
                <Link2 className="w-4 h-4" /> Conectar ML
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={handleSyncOrders} disabled={syncing} variant="outline" size="sm" className="gap-2">
                  <Download className={`w-4 h-4 ${syncing ? "animate-pulse" : ""}`} />
                  <span className="hidden sm:inline">Vendas</span>
                </Button>
                <Button onClick={handleSyncAds} disabled={syncing} size="sm" className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={`Faturamento (${period} dias)`} value={`R$ ${stats.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} change={`${stats.count} pedidos pagos`} changeType="positive" icon={DollarSign} loading={loading} />
          <StatCard title="Ticket Médio" value={`R$ ${stats.ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} change="por pedido" changeType="neutral" icon={ShoppingBag} loading={loading} />
          <StatCard title="Conversão Real" value={`${stats.conversion.toFixed(2)}%`} change={stats.conversion > 1 ? "Saudável" : "Baixa"} changeType={stats.conversion > 1 ? "positive" : "neutral"} icon={TrendingUp} loading={loading} />
          <StatCard title="Total de Anúncios" value={`${products.length}`} change="na sua conta" changeType="neutral" icon={Eye} loading={loading} />
        </div>

        {/* GRÁFICO */}
        <div className="h-[350px]">
             <SalesChart data={chartData} loading={loading} />
        </div>

        {/* TABELA TOP PERFORMANCE */}
        {products.length > 0 && (
          <div className="pt-12">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4 px-1 justify-between">
                <h2 className="text-lg font-bold">{tableTitle}</h2>
            </div>

            <ProductsTable products={topProductsSorted} loading={loading} onUpdate={fetchData} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}