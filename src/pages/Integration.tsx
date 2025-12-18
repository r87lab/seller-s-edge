import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Link2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Trash2, ShieldCheck } from "lucide-react";

// Função auxiliar para dividir array em lotes (Fica fora do componente para limpar o código)
const chunkArray = (arr: any[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

export default function Integration() {
  const [searchParams] = useSearchParams();
  const [integration, setIntegration] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [progress, setProgress] = useState("");

  const fetchIntegration = async () => {
    try {
      const { data, error } = await supabase.from("integrations").select("*").maybeSingle();
      if (error) throw error;
      setIntegration(data);
    } catch (error) { console.error(error); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) handleOAuthCallback(code);
    else fetchIntegration();
  }, [searchParams]);

  const handleOAuthCallback = async (code: string) => {
    setConnecting(true);
    try {
      const { error } = await supabase.functions.invoke("ml-auth", {
        body: { action: "callback", code, redirectUri: `${window.location.origin}/integration` },
      });
      if (error) throw error;
      toast({ title: "Sucesso", description: "Conta conectada!" });
      window.history.replaceState({}, document.title, "/integration");
      fetchIntegration();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally { setConnecting(false); }
  };

  const handleConnect = () => {
    const appId = import.meta.env.VITE_ML_APP_ID;
    const redirectUri = `${window.location.origin}/integration`;
    window.location.href = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  const handleDisconnect = async () => {
    if (!confirm("Deseja desconectar?")) return;
    const { error } = await supabase.from("integrations").delete().eq("id", integration.id);
    if (!error) { setIntegration(null); toast({ title: "Desconectado" }); }
  };

  // --- LÓGICA DE FAXINA (Otimizada) ---
  const handleCleanup = async () => {
    if (!integration?.access_token) return toast({ title: "Erro", description: "Token inválido.", variant: "destructive" });

    setCleaning(true);
    setProgress("Iniciando...");
    
    try {
      const { data: products } = await supabase.from('products_snapshot').select('id, item_id');
      if (!products?.length) return toast({ title: "Banco vazio" });

      const chunks = chunkArray(products, 20);
      let removed = 0, closed = 0;

      for (const [i, chunk] of chunks.entries()) {
        setProgress(`Lote ${i + 1}/${chunks.length}...`);
        
        // Chama o Backend (ml-auth) para evitar CORS
        const { data: mlData, error } = await supabase.functions.invoke('ml-auth', {
          body: { action: 'check_items', ids: chunk.map(p => p.item_id).join(','), accessToken: integration.access_token }
        });

        if (error || !Array.isArray(mlData)) continue;

        const toDelete = [], toClose = [];
        
        mlData.forEach((res: any, idx: number) => {
          if (res.code === 404) toDelete.push(chunk[idx].id);
          else if (res.code === 200 && ['closed', 'inactive'].includes(res.body.status)) toClose.push(chunk[idx].id);
        });

        if (toDelete.length) {
          await supabase.from('products_snapshot').delete().in('id', toDelete);
          removed += toDelete.length;
        }
        if (toClose.length) {
          await supabase.from('products_snapshot').update({ status: 'closed' } as any).in('id', toClose);
          closed += toClose.length;
        }
      }

      toast({ title: "Faxina Concluída!", description: `${removed} excluídos, ${closed} arquivados.` });
      if (removed > 0 || closed > 0) setTimeout(() => window.location.reload(), 1500);

    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { setCleaning(false); setProgress(""); }
  };

  const isExpired = integration && integration.expires_at * 1000 < Date.now();

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-in fade-in">
        <h1 className="text-2xl font-bold mb-2">Integração Mercado Livre</h1>
        <p className="text-muted-foreground mb-8">Gerencie a conexão e sincronia dos seus dados.</p>

        {loading || connecting ? (
          <div className="bg-card border rounded-xl p-8 text-center">
            <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">{connecting ? "Conectando..." : "Carregando..."}</p>
          </div>
        ) : integration ? (
          <div className="grid gap-6">
            <div className="bg-card border rounded-xl p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl ${isExpired ? "bg-red-100" : "bg-emerald-100"}`}>
                  {isExpired ? <AlertCircle className="w-6 h-6 text-red-600" /> : <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{isExpired ? "Sessão Expirada" : "Conta Conectada"}</h3>
                  <p className="text-sm text-muted-foreground">{isExpired ? "Reconecte para continuar." : "Sincronização ativa."}</p>
                </div>
              </div>
              
              <div className="flex gap-4 pt-4 border-t">
                {isExpired ? (
                  <Button onClick={handleConnect} className="flex-1"><RefreshCw className="w-4 h-4 mr-2" /> Reconectar</Button>
                ) : (
                  <Button variant="outline" onClick={handleDisconnect} className="flex-1 text-red-600 hover:bg-red-50">Desconectar</Button>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <ShieldCheck className="w-5 h-5 text-slate-700" />
                <h3 className="font-semibold text-slate-900">Manutenção de Catálogo</h3>
              </div>
              <p className="text-sm text-slate-600 mb-6">Limpe produtos excluídos que ainda aparecem aqui.</p>
              
              <div className="flex items-center gap-4">
                <Button onClick={handleCleanup} disabled={cleaning} variant={cleaning ? "ghost" : "outline"} className="bg-white">
                  {cleaning ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Verificando...</> : <><Trash2 className="w-4 h-4 mr-2" /> Verificar & Limpar</>}
                </Button>
                {cleaning && <span className="text-xs font-mono text-slate-500 animate-pulse">{progress}</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-card border rounded-xl p-12 text-center">
            <Link2 className="w-10 h-10 text-primary mx-auto mb-6" />
            <h3 className="text-xl font-bold mb-3">Conecte sua conta</h3>
            <Button onClick={handleConnect} size="lg"><ExternalLink className="w-5 h-5 mr-2" /> Conectar Mercado Livre</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}