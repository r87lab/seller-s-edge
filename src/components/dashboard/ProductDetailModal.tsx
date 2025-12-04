import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  ExternalLink, 
  Pause, 
  DollarSign, 
  Edit3, 
  TrendingUp, 
  TrendingDown,
  Target
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { calculateFinancials, getDiagnosis } from "./ProductsTable";

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

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

export default function ProductDetailModal({
  product,
  open,
  onOpenChange,
  onUpdate,
}: ProductDetailModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!product) return null;

  const financials = calculateFinancials(product);
  const diagnosis = getDiagnosis(financials.roas, financials.marginPercent);

  const getStatusBadge = (status: string) => {
    const isActive = status === "active";
    return (
      <Badge
        variant={isActive ? "default" : "secondary"}
        className={isActive ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}
      >
        {isActive ? "Ativo" : "Pausado"}
      </Badge>
    );
  };

  const handleQuickAction = async (action: string) => {
    setLoading(action);
    try {
      // Simulate action - in real implementation, these would call ML API via edge functions
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (action === "pause") {
        toast({ 
          title: "Ação registrada", 
          description: "Solicitação para pausar anúncio enviada. Implemente a integração com a API do ML." 
        });
      } else if (action === "price") {
        toast({ 
          title: "Ação registrada", 
          description: "Abra o ML para ajustar o preço manualmente ou implemente a API." 
        });
        window.open(product.permalink, '_blank');
      } else if (action === "title") {
        toast({ 
          title: "Ação registrada", 
          description: "Abra o ML para editar o título manualmente ou implemente a API." 
        });
        window.open(product.permalink, '_blank');
      }
      
      onUpdate?.();
    } catch (error: any) {
      toast({ 
        title: "Erro", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            Raio-X do Anúncio
            {getStatusBadge(product.status)}
            <Badge 
              variant="outline"
              className={cn(
                "text-xs font-semibold ml-auto",
                diagnosis.variant === "success" && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                diagnosis.variant === "warning" && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                diagnosis.variant === "destructive" && "bg-red-500/20 text-red-400 border-red-500/30"
              )}
            >
              {diagnosis.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Product Image */}
          <div className="flex justify-center">
            <img
              src={product.thumbnail || "/placeholder.svg"}
              alt={product.title}
              className="w-40 h-40 object-contain rounded-xl border border-border bg-background"
            />
          </div>

          {/* Product Info */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">
                Título
              </label>
              <p className="text-foreground font-medium mt-1">{product.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">
                  SKU
                </label>
                <p className="font-mono text-foreground mt-1">
                  {product.seller_sku || "—"}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">
                  ID do Item
                </label>
                <p className="font-mono text-foreground mt-1 text-sm">
                  {product.item_id}
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">
                Preço Atual
              </label>
              <p className="text-2xl font-bold text-primary mt-1">
                R$ {product.price?.toFixed(2) || "0.00"}
              </p>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <p className="text-lg font-bold text-foreground">
                {product.visits_last_30_days?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-muted-foreground">Visitas</p>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <p className="text-lg font-bold text-foreground">
                {product.sales_last_30_days || 0}
              </p>
              <p className="text-xs text-muted-foreground">Vendas</p>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <p className="text-lg font-bold text-foreground">
                {product.visits_last_30_days > 0
                  ? ((product.sales_last_30_days / product.visits_last_30_days) * 100).toFixed(2)
                  : "0.00"}%
              </p>
              <p className="text-xs text-muted-foreground">Conversão</p>
            </div>
          </div>

          {/* Financial Intelligence */}
          <div className="p-4 bg-secondary/30 rounded-xl border border-border">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Inteligência Financeira
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">
                  ROAS Estimado
                </label>
                <p className={cn(
                  "text-xl font-bold mt-1 flex items-center gap-1",
                  financials.roas >= 3 ? "text-emerald-400" : 
                  financials.roas >= 1.5 ? "text-amber-400" : "text-red-400"
                )}>
                  {financials.roas >= 1.5 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {financials.roas.toFixed(2)}x
                </p>
                <p className="text-xs text-muted-foreground">
                  {financials.roas >= 3 ? "Excelente" : financials.roas >= 1.5 ? "Razoável" : "Baixo"}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Margem Estimada
                </label>
                <p className={cn(
                  "text-xl font-bold mt-1 flex items-center gap-1",
                  financials.marginPercent >= 20 ? "text-emerald-400" : 
                  financials.marginPercent >= 5 ? "text-amber-400" : "text-red-400"
                )}>
                  {financials.marginPercent >= 5 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {financials.marginPercent.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  R$ {financials.totalMargin.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Receita (30d)</span>
                <span className="font-mono text-foreground">R$ {financials.revenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gasto Est. Ads</span>
                <span className="font-mono text-foreground">R$ {financials.estimatedAdSpend.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Quick Actions */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">
              Ações Rápidas
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction("pause")}
                disabled={loading !== null}
                className="flex flex-col items-center gap-1 h-auto py-3 bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400"
              >
                <Pause className="w-4 h-4" />
                <span className="text-xs">Pausar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction("price")}
                disabled={loading !== null}
                className="flex flex-col items-center gap-1 h-auto py-3 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-400"
              >
                <DollarSign className="w-4 h-4" />
                <span className="text-xs">Ajustar Preço</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction("title")}
                disabled={loading !== null}
                className="flex flex-col items-center gap-1 h-auto py-3 bg-primary/10 border-primary/30 hover:bg-primary/20 text-primary"
              >
                <Edit3 className="w-4 h-4" />
                <span className="text-xs">Editar Título</span>
              </Button>
            </div>
          </div>

          {/* Link to ML */}
          <a
            href={product.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Ver no Mercado Livre
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
