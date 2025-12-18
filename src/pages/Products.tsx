import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProductsTable from "@/components/dashboard/ProductsTable";
import CostsManager from "@/components/products/CostsManager";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, Sparkles, LayoutGrid, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { getSmartDiagnosis, calculateFinancials } from "@/lib/ad-calculations";

interface Product {
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
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); 
  const [actionFilter, setActionFilter] = useState("all");
  const [diagnosisFilter, setDiagnosisFilter] = useState("all");

  const fetchProducts = async () => {
    if (products.length === 0) setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from("products_snapshot")
        .select("*")
        .neq("status", "closed") // Mantém os fechados escondidos
        .order("sales_last_30_days", { ascending: false });

      if (error) throw error;
      setProducts((data as Product[]) || []);
    } catch (error: any) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // OTIMIZAÇÃO E LÓGICA DE FILTROS
  const filteredData = useMemo(() => {
    let filtered = products;

    // 1. Status (Agora suporta 'under_review')
    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // 2. Busca
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(searchLower) ||
          p.item_id.toLowerCase().includes(searchLower) ||
          p.seller_sku?.toLowerCase().includes(searchLower)
      );
    }

    // 3. Ação
    if (actionFilter !== "all") {
      filtered = filtered.filter((p) => p.strategic_action === actionFilter);
    }

    // 4. Diagnóstico IA
    if (diagnosisFilter !== "all") {
      filtered = filtered.filter((p) => {
        const financials = calculateFinancials({
          price: p.price,
          sales_last_30_days: p.sales_last_30_days,
          visits_last_30_days: p.visits_last_30_days,
          cost_price: p.cost_price,
          average_shipping_cost: p.average_shipping_cost,
          custom_tax_rate: p.custom_tax_rate,
          listing_type_id: p.listing_type_id
        });

        const diagnosis = getSmartDiagnosis({
          price: p.price,
          visits: p.visits_last_30_days,
          sales: p.sales_last_30_days,
          sales_prev: p.sales_last_30_days_prev || 0,
          marginPercent: financials.marginPercent,
          date_created: p.date_created,
          logistic_type: p.logistic_type || undefined,
          health: p.health || 0
        });

        return diagnosis.label === diagnosisFilter;
      });
    }

    // Contagens Atualizadas
    return {
      list: filtered,
      counts: {
        all: products.length,
        active: products.filter((p) => p.status === "active").length,
        paused: products.filter((p) => p.status === "paused").length,
        // NOVA CONTAGEM: Em Revisão
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
            <p className="text-muted-foreground text-sm">
              Visualize e otimize seu catálogo do Mercado Livre.
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full space-y-6">
          
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger 
              value="overview" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 font-medium text-muted-foreground data-[state=active]:text-primary transition-all hover:text-primary/80"
            >
              <LayoutGrid className="w-4 h-4 mr-2" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger 
              value="costs" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 font-medium text-muted-foreground data-[state=active]:text-primary transition-all hover:text-primary/80"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Importar Custos
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: VISÃO GERAL */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            
            {/* Filtros Superiores */}
            <div className="flex flex-col lg:flex-row justify-between gap-4">
              
              {/* ABAS DE STATUS */}
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
                <TabsList className="bg-muted/50 h-9">
                  <TabsTrigger value="all" className="text-xs h-7">Todos ({filteredData.counts.all})</TabsTrigger>
                  <TabsTrigger value="active" className="text-xs h-7">Ativos ({filteredData.counts.active})</TabsTrigger>
                  <TabsTrigger value="paused" className="text-xs h-7">Pausados ({filteredData.counts.paused})</TabsTrigger>
                  
                  {/* NOVA ABA: SÓ APARECE SE TIVER ITENS EM REVISÃO */}
                  {filteredData.counts.review > 0 && (
                    <TabsTrigger value="under_review" className="text-xs h-7 text-amber-700 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Em Revisão ({filteredData.counts.review})
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>

              <div className="flex flex-1 flex-col sm:flex-row gap-3 justify-end">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar título ou SKU..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-background h-9"
                  />
                </div>
                
                <Select value={diagnosisFilter} onValueChange={setDiagnosisFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] h-9 border-dashed border-primary/40 bg-background/50">
                    <Sparkles className="w-4 h-4 mr-2 text-primary" />
                    <SelectValue placeholder="Diagnóstico IA" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Diagnósticos</SelectItem>
                    <SelectItem value="Saúde Crítica">🚨 Saúde Crítica</SelectItem>
                    <SelectItem value="Em Queda">📉 Em Queda</SelectItem>
                    <SelectItem value="Zumbi">💀 Zumbi</SelectItem>
                    <SelectItem value="Baixa Conversão">👁️ Turista</SelectItem>
                    <SelectItem value="Margem Baixa">💸 Margem Baixa</SelectItem>
                    <SelectItem value="Potencial">💎 Potencial</SelectItem>
                    <SelectItem value="Gargalo Logístico">🚚 Gargalo Logístico</SelectItem>
                    <SelectItem value="Crescendo">🚀 Crescendo</SelectItem>
                    <SelectItem value="Estável">✅ Estável</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-full sm:w-[150px] h-9">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Ação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas Ações</SelectItem>
                    <SelectItem value="Analisar">Analisar</SelectItem>
                    <SelectItem value="Ajustar Preço">Ajustar Preço</SelectItem>
                    <SelectItem value="Melhorar Foto">Melhorar Foto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ProductsTable 
              products={filteredData.list} 
              loading={loading} 
              onUpdate={fetchProducts} 
            />

            {!loading && filteredData.list.length === 0 && (
              <div className="text-center py-12 border border-dashed rounded-lg bg-muted/5">
                <p className="text-muted-foreground text-sm">Nenhum produto encontrado com os filtros atuais.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="costs" className="mt-6">
             <CostsManager onUpdate={fetchProducts} />
          </TabsContent>

        </Tabs>
      </div>
    </DashboardLayout>
  );
}