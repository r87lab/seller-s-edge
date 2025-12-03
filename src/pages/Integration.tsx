import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Link2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

interface Integration {
  id: string;
  seller_id: string | null;
  expires_at: number;
  created_at: string;
}

export default function Integration() {
  const [searchParams] = useSearchParams();
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const fetchIntegration = async () => {
    try {
      const { data, error } = await supabase
        .from("integrations")
        .select("id, seller_id, expires_at, created_at")
        .maybeSingle();

      if (error) throw error;
      setIntegration(data);
    } catch (error: any) {
      console.error("Error fetching integration:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Handle OAuth callback
    const code = searchParams.get("code");
    if (code) {
      handleOAuthCallback(code);
    } else {
      fetchIntegration();
    }
  }, [searchParams]);

  const handleOAuthCallback = async (code: string) => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-auth", {
        body: { action: "callback", code, redirectUri: `${window.location.origin}/integration` },
      });

      if (error) throw error;
      toast({ title: "Conta conectada com sucesso!" });
      // Clear the code from URL
      window.history.replaceState({}, document.title, "/integration");
      fetchIntegration();
    } catch (error: any) {
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-auth", {
        body: { action: "login", redirectUri: `${window.location.origin}/integration` },
      });

      if (error) throw error;
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Tem certeza que deseja desconectar sua conta do Mercado Livre?")) return;

    try {
      const { error } = await supabase.from("integrations").delete().eq("id", integration!.id);
      if (error) throw error;
      toast({ title: "Conta desconectada" });
      setIntegration(null);
    } catch (error: any) {
      toast({ title: "Erro ao desconectar", description: error.message, variant: "destructive" });
    }
  };

  const isExpired = integration && integration.expires_at * 1000 < Date.now();

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Integração Mercado Livre</h1>
        <p className="text-muted-foreground mb-8">
          Conecte sua conta do Mercado Livre para sincronizar seus anúncios.
        </p>

        {loading || connecting ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">
              {connecting ? "Conectando sua conta..." : "Carregando..."}
            </p>
          </div>
        ) : integration ? (
          <div className="bg-card border border-border rounded-xl p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-xl ${isExpired ? "bg-destructive/10" : "bg-success/10"}`}
              >
                {isExpired ? (
                  <AlertCircle className="w-6 h-6 text-destructive" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-success" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">
                  {isExpired ? "Token expirado" : "Conta conectada"}
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {isExpired
                    ? "Reconecte sua conta para continuar sincronizando."
                    : "Sua conta está conectada e pronta para uso."}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Seller ID</span>
                <span className="font-mono">{integration.seller_id || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Conectado em</span>
                <span>{new Date(integration.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expira em</span>
                <span className={isExpired ? "text-destructive" : ""}>
                  {new Date(integration.expires_at * 1000).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-border">
              {isExpired ? (
                <Button onClick={handleConnect} className="btn-sync flex-1">
                  <RefreshCw className="w-4 h-4" />
                  Reconectar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  Desconectar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Link2 className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Conecte sua conta</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Clique no botão abaixo para autorizar o acesso à sua conta do Mercado Livre.
              Seus dados estão seguros e protegidos.
            </p>
            <Button onClick={handleConnect} className="btn-sync">
              <ExternalLink className="w-4 h-4" />
              Conectar Mercado Livre
            </Button>
          </div>
        )}

        {/* Info box */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
          <h4 className="font-medium text-sm mb-2">O que vamos acessar?</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Lista de seus anúncios ativos</li>
            <li>• Estatísticas de visitas e vendas</li>
            <li>• Informações básicas do vendedor</li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}