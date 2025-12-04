import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

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
}

export default function ProductDetailModal({
  product,
  open,
  onOpenChange,
}: ProductDetailModalProps) {
  if (!product) return null;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            Raio-X do Anúncio
            {getStatusBadge(product.status)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Product Image */}
          <div className="flex justify-center">
            <img
              src={product.thumbnail || "/placeholder.svg"}
              alt={product.title}
              className="w-48 h-48 object-contain rounded-xl border border-border bg-background"
            />
          </div>

          {/* Product Info */}
          <div className="space-y-4">
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

            <div className="grid grid-cols-3 gap-4 pt-2">
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
