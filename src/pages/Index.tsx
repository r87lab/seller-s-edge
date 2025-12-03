import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import StatCard from "@/components/dashboard/StatCard";
import SalesChart from "@/components/dashboard/SalesChart";
import ProductsTable from "@/components/dashboard/ProductsTable";
import { ShoppingCart, Eye, TrendingUp, RefreshCw, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

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

interface Integration {
  id: string;
  seller_id: string | null;
  access_token: string;
}

export default function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      // Check integration
      const { data: integrationData } = await supabase
        .from("integrations")
        .select("*")
        .maybeSingle();

      setIntegration(integrationData);

      // Fetch products
      const { data: productsData, error } = await supabase
        .from("products_snapshot")
        .select("*")
        .order("sales_last_30_days", { ascending: false });

      if (error) throw error;
      setProducts((productsData as Product[]) || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSync = async () => {
    if (!integration) {
      toast({
        title: "Integração necessária",
        description: "Conecte sua conta do Mercado Livre primeiro.",
        variant: "destructive",
      });
      navigate("/integration");
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-sync", {
        body: {},
      });

      if (error) throw error;
      toast({ title: "Sincronização concluída!", description: `${data?.synced || 0} produtos atualizados.` });
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro na sincronização", description: error.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Calculate totals
  const totalSales = products.reduce((sum, p) => sum + (p.sales_last_30_days || 0), 0);
  const totalVisits = products.reduce((sum, p) => sum + (p.visits_last_30_days || 0), 0);
  const globalConversion = totalVisits > 0 ? ((totalSales / totalVisits) * 100).toFixed(2) : "0.00";

  // Generate chart data (mock for now, would come from real data)
  const chartData = Array.from({ length: 30 }, (_, i) => ({
    date: `${i + 1}`,
    sales: Math.floor(Math.random() * 20) + 5,
    visits: Math.floor(Math.random() * 200) + 50,
  }));

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Visão Geral</h1>
            <p className="text-muted-foreground mt-1">
              Acompanhe o desempenho dos seus anúncios
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!integration && (
              <button
                onClick={() => navigate("/integration")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary/10 transition-colors"
              >
                <Link2 className="w-4 h-4" />
                Conectar ML
              </button>
            )}
            <button onClick={handleSync} disabled={syncing} className="btn-sync">
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title="Vendas (30 dias)"
            value={totalSales}
            change={products.length > 0 ? `${products.length} produtos ativos` : "Nenhum produto"}
            changeType="neutral"
            icon={ShoppingCart}
            loading={loading}
          />
          <StatCard
            title="Visitas (30 dias)"
            value={totalVisits.toLocaleString()}
            change="Últimos 30 dias"
            changeType="neutral"
            icon={Eye}
            loading={loading}
          />
          <StatCard
            title="Taxa de Conversão"
            value={`${globalConversion}%`}
            change={
              parseFloat(globalConversion) > 2
                ? "Acima da média"
                : parseFloat(globalConversion) < 0.5
                ? "Abaixo da média"
                : "Na média"
            }
            changeType={
              parseFloat(globalConversion) > 2
                ? "positive"
                : parseFloat(globalConversion) < 0.5
                ? "negative"
                : "neutral"
            }
            icon={TrendingUp}
            loading={loading}
          />
        </div>

        {/* Chart */}
        <SalesChart data={chartData} loading={loading} />

        {/* Products Table */}
        {products.length > 0 && (
          <ProductsTable products={products} loading={loading} onUpdate={fetchData} />
        )}

        {/* Empty state */}
        {!loading && products.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <ShoppingCart className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum produto sincronizado</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {integration
                ? "Clique em 'Sincronizar' para importar seus anúncios do Mercado Livre."
                : "Conecte sua conta do Mercado Livre para começar a gerenciar seus anúncios."}
            </p>
            {!integration ? (
              <button onClick={() => navigate("/integration")} className="btn-sync">
                <Link2 className="w-4 h-4" />
                Conectar Mercado Livre
              </button>
            ) : (
              <button onClick={handleSync} disabled={syncing} className="btn-sync">
                <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                Sincronizar Agora
              </button>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}