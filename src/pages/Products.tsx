import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProductsTable from "@/components/dashboard/ProductsTable";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, TrendingUp } from "lucide-react";

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
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [conversionFilter, setConversionFilter] = useState("all");

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products_snapshot")
        .select("*")
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

  useEffect(() => {
    let filtered = products;

    // Status filter (from tabs)
    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(searchLower) ||
          p.item_id.toLowerCase().includes(searchLower) ||
          p.seller_sku?.toLowerCase().includes(searchLower)
      );
    }

    // Action filter
    if (actionFilter !== "all") {
      filtered = filtered.filter((p) => p.strategic_action === actionFilter);
    }

    // Conversion filter
    if (conversionFilter !== "all") {
      filtered = filtered.filter((p) => {
        const visits = p.visits_last_30_days || 0;
        const sales = p.sales_last_30_days || 0;
        const conversion = visits > 0 ? (sales / visits) * 100 : 0;

        if (conversionFilter === "low") return conversion < 0.5;
        if (conversionFilter === "medium") return conversion >= 0.5 && conversion <= 2;
        if (conversionFilter === "high") return conversion > 2;
        return true;
      });
    }

    setFilteredProducts(filtered);
  }, [products, search, statusFilter, actionFilter, conversionFilter]);

  const getStatusCounts = () => {
    const all = products.length;
    const active = products.filter((p) => p.status === "active").length;
    const paused = products.filter((p) => p.status === "paused").length;
    return { all, active, paused };
  };

  const counts = getStatusCounts();

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Anúncios</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie e analise todos os seus anúncios
          </p>
        </div>

        {/* Status Tabs */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="bg-secondary/50 p-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Todos ({counts.all})
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Ativos ({counts.active})
            </TabsTrigger>
            <TabsTrigger value="paused" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Pausados ({counts.paused})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, ID ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-background"
            />
          </div>
          <div className="flex gap-3">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Recomendação" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">Todas Recomendações</SelectItem>
                <SelectItem value="Analisar">Analisar</SelectItem>
                <SelectItem value="Melhorar Foto">Melhorar Foto</SelectItem>
                <SelectItem value="Ajustar Preço">Ajustar Preço</SelectItem>
                <SelectItem value="Ativar Ads">Ativar Ads</SelectItem>
              </SelectContent>
            </Select>
            <Select value={conversionFilter} onValueChange={setConversionFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <TrendingUp className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Conversão" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">Todos Níveis</SelectItem>
                <SelectItem value="low">Baixa (&lt;0.5%)</SelectItem>
                <SelectItem value="medium">Média (0.5-2%)</SelectItem>
                <SelectItem value="high">Alta (&gt;2%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results */}
        <ProductsTable products={filteredProducts} loading={loading} onUpdate={fetchProducts} />

        {!loading && filteredProducts.length === 0 && products.length > 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum produto encontrado com os filtros selecionados.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
