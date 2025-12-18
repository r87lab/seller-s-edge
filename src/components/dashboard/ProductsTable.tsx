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
import { 
  ExternalLink, 
  StickyNote, 
  AlertTriangle, 
  TrendingDown, 
  Skull, 
  Search, 
  Wallet, 
  Rocket, 
  Truck, 
  TrendingUp, 
  CheckCircle 
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { differenceInDays } from "date-fns";
import ProductDetailModal from "./ProductDetailModal";
import { calculateFinancials, getSmartDiagnosis, calculateConversion } from "@/lib/ad-calculations";

// Interface alinhada com o banco de dados atualizado
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
  // Novos campos (opcionais pois podem ser null no banco)
  cost_price?: number;
  average_shipping_cost?: number;
  custom_tax_rate?: number;
  listing_type_id?: string;
  health?: number;
  logistic_type?: string;
  sales_last_30_days_prev?: number;
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

export default function ProductsTable({ products, loading, onUpdate }: ProductsTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const getConversionClass = (conversion: number) => {
    if (conversion < 0.5) return "text-red-500 font-medium";
    if (conversion > 2.0) return "text-emerald-500 font-medium";
    return "text-muted-foreground";
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
    // Evita abrir o modal se clicar em botões, links ou selects
    if (target.closest('button') || target.closest('a') || target.closest('[role="combobox"]')) {
      return;
    }
    setSelectedProduct(product);
    setModalOpen(true);
  };

  // Helper para renderizar o ícone correto baseado na string retornada pela IA
  const getDiagnosisIcon = (iconName: string) => {
    switch (iconName) {
      case "alert": return <AlertTriangle className="w-3 h-3 mr-1" />;
      case "trend-down": return <TrendingDown className="w-3 h-3 mr-1" />;
      case "skull": return <Skull className="w-3 h-3 mr-1" />;
      case "search": return <Search className="w-3 h-3 mr-1" />;
      case "wallet": return <Wallet className="w-3 h-3 mr-1" />;
      case "rocket": return <Rocket className="w-3 h-3 mr-1" />;
      case "truck": return <Truck className="w-3 h-3 mr-1" />;
      case "trend-up": return <TrendingUp className="w-3 h-3 mr-1" />;
      default: return <CheckCircle className="w-3 h-3 mr-1" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />)}
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
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent bg-muted/30">
                <TableHead className="w-[80px]">Imagem</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Vendas (30d)</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-center">Diagnóstico IA</TableHead>
                <TableHead>Ação Manual</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedProducts).map(([sku, skuProducts]) =>
                skuProducts.map((product, idx) => {
                  // --- CÁLCULOS CENTRALIZADOS ---
                  const conversion = calculateConversion(product.sales_last_30_days, product.visits_last_30_days);
                  
                  const financials = calculateFinancials({
                    price: product.price,
                    sales_last_30_days: product.sales_last_30_days,
                    visits_last_30_days: product.visits_last_30_days,
                    cost_price: product.cost_price,
                    average_shipping_cost: product.average_shipping_cost,
                    custom_tax_rate: product.custom_tax_rate,
                    listing_type_id: product.listing_type_id
                  });
                  
                  const diagnosis = getSmartDiagnosis({
                    price: product.price,
                    visits: product.visits_last_30_days,
                    sales: product.sales_last_30_days,
                    sales_prev: product.sales_last_30_days_prev || 0,
                    marginPercent: financials.marginPercent,
                    date_created: product.date_created,
                    logistic_type: product.logistic_type || undefined,
                    health: product.health || 0
                  });
                  // ------------------------------

                  const isFirst = idx === 0;
                  const showSku = (isFirst || sku === "sem-sku") && product.seller_sku;

                  return (
                    <TableRow
                      key={product.id}
                      className="group cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={(e) => handleRowClick(product, e)}
                    >
                      <TableCell>
                        <div className="relative w-12 h-12">
                          <img
                            src={product.thumbnail || "/placeholder.svg"}
                            alt={product.title}
                            className="w-full h-full object-cover rounded-md border border-border"
                          />
                          {isNewProduct(product.date_created) && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-sky-500"></span>
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col max-w-[220px]">
                          <span className="font-medium truncate text-sm" title={product.title}>
                            {product.title}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <span className="font-mono">{product.item_id}</span>
                            {showSku && (
                              <span className="px-1.5 py-0.5 bg-secondary rounded font-mono text-[10px]">
                                {product.seller_sku}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        R$ {product.price?.toFixed(2) || "0.00"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold">{product.sales_last_30_days}</span>
                          <span className="text-[10px] text-muted-foreground">{product.visits_last_30_days} visits</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-xs", getConversionClass(conversion))}>
                        {conversion.toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-bold text-sm",
                        financials.marginPercent >= 20 ? "text-emerald-500" : 
                        financials.marginPercent > 0 ? "text-amber-500" : "text-red-500"
                      )}>
                        {financials.marginPercent.toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline"
                          className={cn("whitespace-nowrap font-normal border", diagnosis.color)}
                        >
                          {getDiagnosisIcon(diagnosis.icon)}
                          {diagnosis.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={product.strategic_action || ""}
                          onValueChange={(value) => handleActionChange(product.id, value)}
                          disabled={updatingId === product.id}
                        >
                          <SelectTrigger className="w-[140px] h-8 bg-background text-xs">
                            <SelectValue placeholder="Ação..." />
                          </SelectTrigger>
                          <SelectContent>
                            {strategicActions.map((action) => (
                              <SelectItem key={action.value} value={action.value}>
                                {action.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {product.my_notes && <StickyNote className="w-4 h-4 text-amber-400" />}
                          <a
                            href={product.permalink}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-primary"
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