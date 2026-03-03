import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProductsTable from "@/components/dashboard/ProductsTable";
import CostsManager from "@/components/products/CostsManager";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Search, Filter, Sparkles, LayoutGrid, FileSpreadsheet, DownloadCloud, Loader2 } from "lucide-react";
import { getSmartDiagnosis, calculateFinancials } from "@/lib/ad-calculations";
import { subDays, differenceInDays, isWithinInterval } from "date-fns";
import { toast } from "sonner";
import { syncSalesPage } from "@/services/salesService";

export interface Product {
  id: string;
  item_id: string;
  title: string;
  price: number;
  permalink: string;
  thumbnail: string;
  seller_sku: string | null;
  status: string;
  visits_last_30_days: number;
  sales_last_30_days: number;
  strategic_action: string | null;
  my_notes: string | null;
  date_created: string | null;
  cost_price?: number;
  average_shipping_cost?: number;
  custom_tax_rate?: number;
  listing_type_id?: string;
  health?: number;
  logistic_type?: string;
  sales_last_30_days_prev?: number;
  
  // Campos computados em tempo real
  real_profit_30d?: number;
  problems_count?: number;
  catalog_listing?: boolean;
  last_sale_date?: string | null;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRescuing, setIsRescuing] = useState(false);
  const [rescueProgress, setRescueProgress] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); 
  const [actionFilter, setActionFilter] = useState("all");
  const [diagnosisFilter, setDiagnosisFilter] = useState("all");

  const fetchProducts = async () => {
    setLoading(true);
    try {
      // 1. Catálogo
      const { data: productsData, error: prodError } = await supabase
        .from("products_snapshot")
        .select("*")
        .neq("status", "closed") 
        .order("sales_last_30_days", { ascending: false });

      if (prodError) throw prodError;

      // 2. Pedidos (Últimos 90 dias para cálculos precisos)
      const ninetyDaysAgo = subDays(new Date(), 90).toISOString();
      const { data: ordersData } = await supabase
        .from("orders" as any)
        .select("items, net_profit, status, date_created, shipping_cost")
        .gte("date_created", ninetyDaysAgo);

      // 3. Cruzamento e Cálculos Inteligentes
      const metricsByItem: Record<string, { 
          profit30d: number, 
          count30d: number, 
          countPrev30d: number, // Vendas do mês anterior (30-60 dias atrás)
          shippingTotal: number, // Soma de frete para média
          shippingCount: number,
          problems30d: number, 
          lastSale: string | null 
      }> = {};

      const now = new Date();
      const day30 = subDays(now, 30);
      const day60 = subDays(now, 60);

      if (ordersData) {
        ordersData.forEach((order: any) => {
            const orderDate = new Date(order.date_created);
            
            // Janelas de Tempo
            const isRecent30d = orderDate >= day30;
            const isPrevious30d = orderDate >= day60 && orderDate < day30;

            const isProblem = order.status === 'cancelled' || order.status === 'mediation';
            const profit = Number(order.net_profit || 0);
            const shipping = Number(order.shipping_cost || 0);

            if (Array.isArray(order.items)) {
                order.items.forEach((item: any) => {
                    const itemId = item.item?.id;
                    const qty = Number(item.quantity || 1);
                    
                    if (itemId) {
                        if (!metricsByItem[itemId]) {
                            metricsByItem[itemId] = { 
                                profit30d: 0, count30d: 0, countPrev30d: 0, 
                                shippingTotal: 0, shippingCount: 0,
                                problems30d: 0, lastSale: null 
                            };
                        }
                        
                        // Data da última venda
                        const currentLast = metricsByItem[itemId].lastSale ? new Date(metricsByItem[itemId].lastSale!) : new Date(0);
                        if (orderDate > currentLast) {
                            metricsByItem[itemId].lastSale = order.date_created;
                        }

                        // Métricas de 30 dias (Atual)
                        if (isRecent30d) {
                            metricsByItem[itemId].profit30d += profit; 
                            metricsByItem[itemId].count30d += qty;
                            if (isProblem) metricsByItem[itemId].problems30d += 1;
                        }

                        // Métricas do Mês Anterior (Tendência)
                        if (isPrevious30d) {
                            metricsByItem[itemId].countPrev30d += qty;
                        }

                        // Cálculo de Frete Médio (Histórico total de 90d para maior precisão)
                        if (shipping > 0) {
                            metricsByItem[itemId].shippingTotal += shipping;
                            metricsByItem[itemId].shippingCount += 1;
                        }
                    }
                });
            }
        });
      }

      // 4. Mescla Final
      const enrichedProducts = (productsData as Product[]).map(p => {
          const realMetrics = metricsByItem[p.item_id];
          
          // Cálculo do Frete Médio Real
          let calculatedAvgShipping = p.average_shipping_cost || 0;
          if (realMetrics && realMetrics.shippingCount > 0) {
              calculatedAvgShipping = realMetrics.shippingTotal / realMetrics.shippingCount;
          }

          return {
            ...p,
            sales_last_30_days: realMetrics ? realMetrics.count30d : p.sales_last_30_days,
            // Aqui injetamos o cálculo da tendência!
            sales_last_30_days_prev: realMetrics ? realMetrics.countPrev30d : 0,
            
            real_profit_30d: realMetrics ? realMetrics.profit30d : 0,
            problems_count: realMetrics ? realMetrics.problems30d : 0,
            last_sale_date: realMetrics ? realMetrics.lastSale : null,
            
            // Atualizamos o custo médio virtualmente (sem salvar no banco ainda)
            average_shipping_cost: calculatedAvgShipping,
            
            // Taxa padrão de 6% se estiver zerado
            custom_tax_rate: (p.custom_tax_rate === 0 || !p.custom_tax_rate) ? 6 : p.custom_tax_rate,

            catalog_listing: p.catalog_listing || false
          };
      });

      setProducts(enrichedProducts);

    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  const handleRescueHistory = async () => {
    if (isRescuing) return;
    setIsRescuing(true);
    setRescueProgress("Iniciando...");
    let offset = 0;
    let hasMore = true;
    let totalProcessed = 0;
    const SAFETY_LIMIT = 2000;

    try {
        toast.info("Iniciando varredura de histórico...");
        while (hasMore && offset < SAFETY_LIMIT) {
            const pageNum = Math.floor(offset / 50) + 1;
            setRescueProgress(`Pág ${pageNum}...`);
            const response = await syncSalesPage(offset);
            totalProcessed += response.processed;
            hasMore = response.has_more;
            offset += 50;
            await new Promise(r => setTimeout(r, 300));
        }
        toast.success(`Resgate concluído! ${totalProcessed} pedidos atualizados.`);
        await fetchProducts();
    } catch (error) {
        console.error(error);
        toast.error("Erro durante o resgate.");
    } finally {
        setIsRescuing(false);
        setRescueProgress("");
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const filteredData = useMemo(() => {
    let filtered = products;

    if (statusFilter !== "all") filtered = filtered.filter((p) => p.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((p) => 
        p.title.toLowerCase().includes(s) || p.item_id.toLowerCase().includes(s) || p.seller_sku?.toLowerCase().includes(s)
      );
    }
    if (actionFilter !== "all") filtered = filtered.filter((p) => p.strategic_action === actionFilter);

    if (diagnosisFilter !== "all") {
      filtered = filtered.filter((p) => {
        const fin = calculateFinancials({
          price: p.price, sales_last_30_days: p.sales_last_30_days, visits_last_30_days: p.visits_last_30_days,
          cost_price: p.cost_price, average_shipping_cost: p.average_shipping_cost, 
          custom_tax_rate: p.custom_tax_rate, listing_type_id: p.listing_type_id
        });
        const diag = getSmartDiagnosis({
          price: p.price, visits: p.visits_last_30_days, sales: p.sales_last_30_days,
          sales_prev: p.sales_last_30_days_prev || 0, marginPercent: fin.marginPercent,
          date_created: p.date_created, logistic_type: p.logistic_type, health: p.health || 0
        });
        return diag.label === diagnosisFilter;
      });
    }

    return {
      list: filtered,
      counts: {
        all: products.length,
        active: products.filter((p) => p.status === "active").length,
        paused: products.filter((p) => p.status === "paused").length,
        review: products.filter((p) => p.status === "under_review").length, 
      }
    };
  }, [products, search, statusFilter, actionFilter, diagnosisFilter]);

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gerenciador de Anúncios</h1>
            <p className="text-muted-foreground text-sm">Visualize e otimize seu catálogo com dados de lucro real.</p>
          </div>
          <div className="flex gap-2">
             <Button 
                onClick={handleRescueHistory} 
                disabled={isRescuing || loading} 
                variant="outline" 
                className="border-dashed border-primary/50 text-primary hover:bg-primary/5"
             >
                {isRescuing ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <DownloadCloud className="w-4 h-4 mr-2"/>}
                {isRescuing ? rescueProgress : "Resgatar Histórico Completo"}
             </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full space-y-6">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3 font-medium data-[state=active]:text-primary"><LayoutGrid className="w-4 h-4 mr-2" /> Visão Geral</TabsTrigger>
            <TabsTrigger value="costs" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 py-3 font-medium data-[state=active]:text-primary"><FileSpreadsheet className="w-4 h-4 mr-2" /> Importar Custos</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="flex flex-col lg:flex-row justify-between gap-4">
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
                <TabsList className="bg-muted/50 h-9">
                  <TabsTrigger value="all" className="text-xs h-7">Todos ({filteredData.counts.all})</TabsTrigger>
                  <TabsTrigger value="active" className="text-xs h-7">Ativos ({filteredData.counts.active})</TabsTrigger>
                  <TabsTrigger value="paused" className="text-xs h-7">Pausados ({filteredData.counts.paused})</TabsTrigger>
                  {filteredData.counts.review > 0 && <TabsTrigger value="under_review" className="text-xs h-7 text-amber-700 bg-amber-50">Em Revisão ({filteredData.counts.review})</TabsTrigger>}
                </TabsList>
              </Tabs>

              <div className="flex flex-1 flex-col sm:flex-row gap-3 justify-end">
                <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar título ou SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background h-9" /></div>
                <Select value={diagnosisFilter} onValueChange={setDiagnosisFilter}><SelectTrigger className="w-full sm:w-[180px] h-9 border-dashed border-primary/40"><Sparkles className="w-4 h-4 mr-2 text-primary" /><SelectValue placeholder="Diagnóstico IA" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="Saúde Crítica">🚨 Saúde Crítica</SelectItem><SelectItem value="Em Queda">📉 Em Queda</SelectItem><SelectItem value="Zumbi">💀 Zumbi</SelectItem><SelectItem value="Potencial">💎 Potencial</SelectItem><SelectItem value="Crescendo">🚀 Crescendo</SelectItem><SelectItem value="Estável">✅ Estável</SelectItem></SelectContent></Select>
                <Select value={actionFilter} onValueChange={setActionFilter}><SelectTrigger className="w-full sm:w-[150px] h-9"><Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Ação" /></SelectTrigger><SelectContent><SelectItem value="all">Todas Ações</SelectItem><SelectItem value="Analisar">Analisar</SelectItem><SelectItem value="Ajustar Preço">Ajustar Preço</SelectItem><SelectItem value="Melhorar Foto">Melhorar Foto</SelectItem></SelectContent></Select>
              </div>
            </div>

            <ProductsTable products={filteredData.list} loading={loading} onUpdate={fetchProducts} />
            {!loading && filteredData.list.length === 0 && <div className="text-center py-12 border border-dashed rounded-lg bg-muted/5"><p className="text-muted-foreground text-sm">Nenhum produto encontrado.</p></div>}
          </TabsContent>

          <TabsContent value="costs" className="mt-6"><CostsManager onUpdate={fetchProducts} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}