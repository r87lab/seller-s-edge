import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Search, AlertTriangle } from "lucide-react";

export default function Debug() {
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const addLog = (title: string, data: any, isError = false) => {
    setLogs(prev => [...prev, { title, data, isError, time: new Date().toLocaleTimeString() }]);
  };

  const runInvestigation = async () => {
    if (!orderId) return;
    
    setLogs([]);
    setLoading(true);
    
    try {
      addLog("🚀 INICIANDO", "Conectando ao Backend Seguro...");

      // AQUI ESTÁ A MÁGICA:
      // Em vez de chamar o ML direto, chamamos nossa função do Supabase (ml-sync)
      // Ela vai lá no ML, pega tudo e traz pra gente sem bloqueio.
      const { data, error } = await supabase.functions.invoke('ml-sync', {
        body: { 
            action: 'debug_order', 
            orderId: orderId 
        }
      });

      if (error) {
        throw new Error(error.message || "Erro na comunicação com o servidor");
      }

      if (data.error) {
        throw new Error(data.error);
      }

      // EXIBINDO OS RESULTADOS QUE VIERAM DO BACKEND
      addLog("✅ SUCESSO", "Dados recebidos do Mercado Livre via Proxy");
      
      // 1. O Pedido
      addLog("📦 1. JSON DO PEDIDO (Order)", data.order);

      // 2. O Pagamento (Onde a taxa se esconde)
      if (data.payment_details) {
        addLog("💰 2. JSON DO PAGAMENTO (Payment)", data.payment_details);
        
        // Vamos dar um destaque se acharmos a taxa aqui
        const fees = data.payment_details.fee_details?.filter((f: any) => f.fee_payer === 'collector');
        addLog("🔎 TAXAS DETECTADAS NO PAGAMENTO", fees || "Nenhuma");
      } else {
        addLog("⚠️ 2. PAGAMENTO", "Não retornou detalhes estendidos de pagamento.");
      }

      // 3. Billing Info (Outro esconderijo de taxas)
      if (data.billing) {
        addLog("🧾 3. JSON DE FATURAMENTO (Billing)", data.billing);
      }

    } catch (error: any) {
      addLog("❌ ERRO FATAL", error.message || error, true);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card className="border-slate-800 bg-slate-950 text-slate-100 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-400">
            <AlertTriangle className="w-6 h-6" />
            Investigação Forense (Modo Backend)
          </CardTitle>
          <p className="text-sm text-slate-400">
            Isso conecta via Servidor para pular o bloqueio CORS e ver a verdade.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              className="bg-slate-900 border-slate-700 text-white"
              placeholder="Cole o ID do Pedido (Ex: 2000014435924718)" 
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
            <Button onClick={runInvestigation} disabled={loading || !orderId} variant="default" className="bg-green-600 hover:bg-green-700">
              {loading ? <Loader2 className="animate-spin w-4 h-4 mr-2"/> : <Search className="w-4 h-4 mr-2"/>}
              Investigar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {logs.map((log, i) => (
          <div key={i} className={`p-4 rounded-lg border text-sm font-mono overflow-auto ${log.isError ? "bg-red-900/20 border-red-800 text-red-200" : "bg-slate-900 border-slate-800 text-slate-300"}`}>
            <div className="flex justify-between mb-2 font-bold opacity-70 border-b border-slate-700 pb-2">
              <span className={log.isError ? "text-red-400" : "text-blue-400"}>{log.title}</span>
              <span className="text-xs">{log.time}</span>
            </div>
            <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(log.data, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}