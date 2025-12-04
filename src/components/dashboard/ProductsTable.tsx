import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, StickyNote } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import ProductDetailModal from "./ProductDetailModal";

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

interface ProductsTableProps {
  products: Product[];
  loading?: boolean;
  onUpdate: () => void;
}

const strategicActions = [
  { value: "Analisar", label: "Analisar" },
  { value: "Melhorar Foto", label: "Melhorar Foto" },
  { value: "Ajustar Preço", label: "Ajustar Preço" },
  { value: "Ativar Ads", label: "Ativar Ads" },
];

// Financial calculations (estimates based on available data)
export const calculateFinancials = (product: Product) => {
  const price = product.price || 0;
  const sales = product.sales_last_30_days || 0;
  const visits = product.visits_last_30_days || 0;
  
  // Revenue
  const revenue = price * sales;
  
  // Estimated ad spend (assume R$0.50 per visit as average CPC)
  const estimatedAdSpend = visits * 0.5;
  
  // ROAS = Revenue / Ad Spend
  const roas = estimatedAdSpend > 0 ? revenue / estimatedAdSpend : 0;
  
  // Estimated margin (assume 30% product cost + 15% ML fees)
  const productCost = price * 0.30;
  const mlFees = price * 0.15;
  const marginPerUnit = price - productCost - mlFees;
  const totalMargin = marginPerUnit * sales - estimatedAdSpend;
  const marginPercent = revenue > 0 ? (totalMargin / revenue) * 100 : 0;
  
  return {
    revenue,
    estimatedAdSpend,
    roas,
    totalMargin,
    marginPercent,
  };
};

// Get diagnosis based on financials
export const getDiagnosis = (roas: number, marginPercent: number) => {
  if (roas >= 3 && marginPercent >= 20) {
    return { label: "Escalar", variant: "success" as const };
  } else if (roas >= 1.5 && marginPercent >= 5) {
    return { label: "Otimizar", variant: "warning" as const };
  } else {
    return { label: "Pausar", variant: "destructive" as const };
  }
};

export default function ProductsTable({ products, loading, onUpdate }: ProductsTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const calculateConversion = (sales: number, visits: number) => {
    if (visits === 0) return 0;
    return (sales / visits) * 100;
  };

  const getConversionClass = (conversion: number) => {
    if (conversion < 0.5) return "conversion-low";
    if (conversion > 2.0) return "conversion-high";
    return "conversion-medium";
  };

  const isNewProduct = (dateCreated: string | null) => {
    if (!dateCreated) return false;
    return differenceInDays(new Date(), new Date(dateCreated)) <= 30;
  };

  const handleActionChange = async (productId: string, action: string) => {
    setUpdatingId(productId);
    try {
      const { error } = await supabase
        .from("products_snapshot")
        .update({ strategic_action: action as any })
        .eq("id", productId);

      if (error) throw error;
      toast({ title: "Ação atualizada com sucesso!" });
      onUpdate();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRowClick = (product: Product, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="combobox"]')) {
      return;
    }
    setSelectedProduct(product);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">
          <div className="h-6 w-48 bg-muted rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const groupedProducts = products.reduce((acc, product) => {
    const sku = product.seller_sku || "sem-sku";
    if (!acc[sku]) acc[sku] = [];
    acc[sku].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold">Análise de Anúncios</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {products.length} produtos encontrados • Clique em uma linha para ver detalhes
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[80px]">Imagem</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Conversão</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-center">Diagnóstico</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedProducts).map(([sku, skuProducts]) =>
                skuProducts.map((product, idx) => {
                  const conversion = calculateConversion(
                    product.sales_last_30_days,
                    product.visits_last_30_days
                  );
                  const financials = calculateFinancials(product);
                  const diagnosis = getDiagnosis(financials.roas, financials.marginPercent);
                  const isFirst = idx === 0;
                  const showSku = isFirst || sku === "sem-sku";

                  return (
                    <TableRow
                      key={product.id}
                      className="table-row-hover cursor-pointer"
                      onClick={(e) => handleRowClick(product, e)}
                    >
                      <TableCell>
                        <div className="relative">
                          <img
                            src={product.thumbnail || "/placeholder.svg"}
                            alt={product.title}
                            className="w-12 h-12 object-cover rounded-lg border border-border"
                          />
                          {isNewProduct(product.date_created) && (
                            <span className="badge-new absolute -top-1 -right-1">Novo</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="font-medium truncate" title={product.title}>
                            {product.title}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {product.item_id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {showSku && product.seller_sku && (
                          <span className="px-2 py-1 bg-secondary rounded text-xs font-mono">
                            {product.seller_sku}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {product.price?.toFixed(2) || "0.00"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {product.sales_last_30_days || 0}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono", getConversionClass(conversion))}>
                        {conversion.toFixed(2)}%
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-bold",
                        financials.roas >= 3 ? "text-emerald-400" : 
                        financials.roas >= 1.5 ? "text-amber-400" : "text-red-400"
                      )}>
                        {financials.roas.toFixed(1)}x
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-bold",
                        financials.marginPercent >= 20 ? "text-emerald-400" : 
                        financials.marginPercent >= 5 ? "text-amber-400" : "text-red-400"
                      )}>
                        {financials.marginPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline"
                          className={cn(
                            "text-xs font-semibold",
                            diagnosis.variant === "success" && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                            diagnosis.variant === "warning" && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                            diagnosis.variant === "destructive" && "bg-red-500/20 text-red-400 border-red-500/30"
                          )}
                        >
                          {diagnosis.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={product.strategic_action || ""}
                          onValueChange={(value) => handleActionChange(product.id, value)}
                          disabled={updatingId === product.id}
                        >
                          <SelectTrigger className="w-[130px] bg-background">
                            <SelectValue placeholder="Selecionar..." />
                          </SelectTrigger>
                          <SelectContent className="bg-popover border-border">
                            {strategicActions.map((action) => (
                              <SelectItem key={action.value} value={action.value}>
                                {action.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {product.my_notes && (
                            <span title={product.my_notes}>
                              <StickyNote className="w-4 h-4 text-primary" />
                            </span>
                          )}
                          <a
                            href={product.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver no ML"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProductDetailModal
        product={selectedProduct}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onUpdate={onUpdate}
      />
    </>
  );
}
