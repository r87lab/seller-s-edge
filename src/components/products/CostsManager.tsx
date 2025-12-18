import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, Save, FileSpreadsheet, Check, AlertCircle, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function CostsManager({ onUpdate }: { onUpdate: () => void }) {
  const [inputText, setInputText] = useState("");
  const [parsedData, setParsedData] = useState<{sku: string, cost: number}[]>([]);
  const [processing, setProcessing] = useState(false);
  
  // Novos estados para o Alerta
  const [missingCosts, setMissingCosts] = useState<{sku: string, title: string}[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(true);

  // Busca produtos sem custo ao carregar
  useEffect(() => {
    fetchMissingCosts();
  }, []);

  const fetchMissingCosts = async () => {
    try {
      const { data, error } = await supabase
        .from('products_snapshot')
        .select('seller_sku, title')
        .eq('status', 'active') // Só nos importam os ativos
        .or('cost_price.is.null,cost_price.eq.0'); // Custo nulo ou zero

      if (error) throw error;
      
      // Filtra apenas os que tem SKU (sem SKU não dá pra importar via Excel)
      const validMissing = (data || []).map(p => ({
        sku: p.seller_sku || "SEM-SKU",
        title: p.title
      })).filter(p => p.sku !== "SEM-SKU");

      setMissingCosts(validMissing);
    } catch (error) {
      console.error("Erro ao buscar custos faltantes:", error);
    } finally {
      setLoadingMissing(false);
    }
  };

  const handleCopyMissing = () => {
    const textToCopy = missingCosts.map(p => p.sku).join("\n");
    navigator.clipboard.writeText(textToCopy);
    toast({ 
      title: "Copiado!", 
      description: `${missingCosts.length} SKUs copiados. Cole no seu Excel para buscar os preços.` 
    });
  };

  const handlePreview = () => {
    if (!inputText.trim()) return;
    const rows = inputText.split("\n");
    
    const data = rows.map(row => {
      let parts = row.split("\t");
      if (parts.length < 2) parts = row.split(";");
      
      if (parts.length >= 2) {
        const sku = parts[0].trim();
        // Limpa formatação de dinheiro
        let priceStr = parts[1].replace("R$", "").replace(/\s/g, "");
        if (priceStr.includes(",") && priceStr.includes(".")) priceStr = priceStr.replace(".", ""); 
        priceStr = priceStr.replace(",", ".");
        
        const cost = parseFloat(priceStr);
        if (sku && !isNaN(cost)) return { sku, cost };
      }
      return null;
    }).filter(item => item !== null) as {sku: string, cost: number}[];

    setParsedData(data);
    if (data.length > 0) toast({ title: "Sucesso", description: `${data.length} itens identificados.` });
    else toast({ title: "Erro", description: "Formato inválido. Copie as colunas SKU e PREÇO.", variant: "destructive" });
  };

  const handleSave = async () => {
    setProcessing(true);
    let successCount = 0;
    
    // Criamos um array de promessas para executar as atualizações em paralelo
    const updatePromises = parsedData.map(async (item) => {
      try {
        const { error } = await supabase
          .from("products_snapshot" as any)
          .update({ cost_price: item.cost })
          .eq("seller_sku", item.sku);

        if (!error) return true; // Retorna sucesso
        console.error(`Erro ao atualizar SKU ${item.sku}:`, error);
        return false; // Retorna falha
      } catch (e) {
        console.error(e);
        return false;
      }
    });

    // Aguarda todas as requisições terminarem
    const results = await Promise.all(updatePromises);
    
    // Conta quantos sucessos tivemos (resultados true)
    successCount = results.filter(result => result === true).length;

    setProcessing(false);
    
    if (successCount > 0) {
      toast({ 
        title: "Atualização Concluída", 
        description: `${successCount} de ${parsedData.length} custos salvos com sucesso.` 
      });
      
      // Limpa a tela apenas se houve sucesso
      setParsedData([]);
      setInputText("");
      fetchMissingCosts(); // Atualiza a lista de pendências (alerta amarelo)
      onUpdate(); // Atualiza a tela principal (tabela de produtos)
    } else {
      toast({ 
        title: "Erro na atualização", 
        description: "Não foi possível salvar os custos. Verifique o console para detalhes.",
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* ALERTA DE PENDÊNCIAS */}
      {!loadingMissing && missingCosts.length > 0 ? (
        <Alert variant="default" className="border-amber-500/50 bg-amber-500/10 text-amber-600">
          <AlertCircle className="h-4 w-4 stroke-amber-600" />
          <AlertTitle className="mb-2 font-bold flex items-center gap-2">
            Atenção: {missingCosts.length} produtos ativos sem custo definido!
          </AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-xs opacity-90 max-w-[600px]">
              O lucro desses produtos está sendo calculado incorretamente. 
              Copie a lista de SKUs, preencha o preço no Excel e cole abaixo.
            </p>
            <Button 
              size="sm" 
              variant="outline" 
              className="bg-white/50 hover:bg-white border-amber-200 text-amber-700 h-8 gap-2"
              onClick={handleCopyMissing}
            >
              <Copy className="w-3 h-3" /> Copiar Lista de SKUs
            </Button>
          </AlertDescription>
        </Alert>
      ) : !loadingMissing && (
        <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-4 w-4 stroke-emerald-600" />
          <AlertTitle className="font-bold">Tudo certo!</AlertTitle>
          <AlertDescription className="text-xs">
            Todos os seus produtos ativos possuem preço de custo cadastrado.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lado Esquerdo: Colar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> 1. Colar Dados do Excel
            </CardTitle>
            <CardDescription>Copie duas colunas: <strong>SKU</strong> e <strong>Preço de Custo</strong>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea 
              placeholder={`EXEMPLO:\nFONE-01\t45,90\nCABO-USB\t12,50`}
              className="min-h-[250px] font-mono text-xs"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <Button onClick={handlePreview} className="w-full" disabled={!inputText}>
              <Upload className="w-4 h-4 mr-2" /> Processar Texto
            </Button>
          </CardContent>
        </Card>

        {/* Lado Direito: Conferir */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="w-5 h-5 text-primary" /> 2. Conferir e Salvar
            </CardTitle>
            <CardDescription>Verifique se os valores foram lidos corretamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsedData.length === 0 ? (
              <div className="h-[250px] flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-md bg-muted/20">
                <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-xs">Aguardando dados...</p>
              </div>
            ) : (
              <>
                <div className="h-[250px] overflow-y-auto border rounded-md relative">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow><TableHead>SKU</TableHead><TableHead className="text-right">Custo Novo</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                          <TableCell className="text-right font-medium text-emerald-600">R$ {item.cost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button onClick={handleSave} disabled={processing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                  {processing ? "Salvando..." : `Confirmar (${parsedData.length} itens)`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}