import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink, TrendingUp, TrendingDown, ArrowUpDown, BookOpen, Eye, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { differenceInDays, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import ProductDetailModal from "./ProductDetailModal";
import { calculateFinancials, getSmartDiagnosis, calculateConversion } from "@/lib/ad-calculations";

export interface Product {
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
  cost_price?: number;
  average_shipping_cost?: number;
  custom_tax_rate?: number;
  listing_type_id?: string;
  health?: number;
  logistic_type?: string;
  sales_last_30_days_prev?: number;
  real_profit_30d?: number;
  problems_count?: number;
  catalog_listing?: boolean;
  last_sale_date?: string | null;
}

interface ProductsTableProps {
  products: Product[];
  loading: boolean;
  onUpdate: () => void;
}

interface ProductRowProps {
  product: Product;
  onActionChange: (id: string, action: string) => void;
  onClick: () => void;
  updatingId: string | null;
}

const ProductRow = ({ product, onActionChange, onClick, updatingId }: ProductRowProps) => {
  
  const conversion = calculateConversion(product.sales_last_30_days, product.visits_last_30_days);
  const prevSales = product.sales_last_30_days_prev || 0;
  
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
    sales_prev: prevSales,
    marginPercent: financials.marginPercent,
    date_created: product.date_created,
    logistic_type: product.logistic_type,
    health: product.health || 0
  });

  const isNew = product.date_created && differenceInDays(new Date(), new Date(product.date_created || "")) <= 30;
  const hasProblems = (product.problems_count || 0) > 0;
  const realProfit = product.real_profit_30d || 0;

  // --- RENDERIZADORES ---

  const renderTrend = (curr: number, prev: number) => {
    if (!prev) return <span className="text-[9px] text-muted-foreground ml-1 opacity-50">-</span>;
    const diff = curr - prev;
    if (Math.abs(diff) < 0.1) return <span className="text-[9px] text-muted-foreground ml-1">=</span>;
    
    const color = diff > 0 ? "text-emerald-500" : "text-red-500";
    const icon = diff > 0 ? "▲" : "▼";
    return <span className={cn("text-[9px] ml-1 font-medium", color)}>{icon}{Math.abs(diff)}</span>;
  };

  const renderHealth = (health: number, isCatalog: boolean) => {
    if (isCatalog && (!health || health === 0)) {
       return <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-purple-200 text-purple-700 bg-purple-50">CATÁLOGO</Badge>;
    }
    const pct = (health || 0) * 100;
    if (pct === 0) return <span className="text-[10px] text-muted-foreground opacity-50">-</span>;
    const color = pct > 85 ? "bg-emerald-500" : pct > 60 ? "bg-amber-400" : "bg-red-500";
    return (
      <div className="flex items-center gap-2 justify-center" title={`Saúde: ${pct.toFixed(0)}%`}>
        <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden border border-muted-foreground/10">
            <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground w-5 text-right">{pct.toFixed(0)}%</span>
      </div>
    );
  };

  const renderTypeDot = (typeId?: string, isCatalog?: boolean) => {
    const isPremium = typeId === 'gold_pro';
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger>
             <div className="flex items-center gap-1">
                <div className={cn("w-2 h-2 rounded-full ring-1 ring-offset-1 ring-offset-background", isPremium ? "bg-sky-500 ring-sky-200" : "bg-amber-400 ring-amber-200")} />
                {isCatalog && <BookOpen className="w-3 h-3 text-purple-600 ml-0.5" />}
             </div>
          </TooltipTrigger>
          <TooltipContent side="right">
             <p className="text-xs font-medium">{isPremium ? "Premium" : "Clássico"}{isCatalog && " • Catálogo"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderLastSale = (dateStr?: string | null) => {
      if (!dateStr) return <span className="text-[10px] text-muted-foreground opacity-50">-</span>;
      const date = new Date(dateStr);
      const daysAgo = differenceInDays(new Date(), date);
      const text = formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
      
      let colorClass = "text-emerald-600";
      if (daysAgo > 60) colorClass = "text-red-500";
      else if (daysAgo > 30) colorClass = "text-amber-600";

      return <span className={cn("text-[10px] font-medium whitespace-nowrap block", colorClass)} title={date.toLocaleDateString()}>{text.replace("cerca de ", "")}</span>;
  };

  return (
    <TableRow className="group hover:bg-muted/50 cursor-pointer border-b border-muted/30 transition-colors" onClick={onClick}>
      <TableCell className="py-2 pl-4 w-[50px]">
        <div className="relative w-9 h-9">
          <img src={product.thumbnail || "/placeholder.svg"} className="w-full h-full object-cover rounded border bg-background" />
          {isNew && <span className="absolute -top-1 -right-1 w-2 h-2 bg-sky-500 rounded-full ring-1 ring-white" />}
          {hasProblems && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full ring-1 ring-white flex items-center justify-center text-[8px] text-white font-bold">!</span>}
        </div>
      </TableCell>

      <TableCell className="py-2">
        <div className="flex flex-col max-w-[260px]">
          <div className="flex items-center gap-2 mb-0.5">
             {renderTypeDot(product.listing_type_id, product.catalog_listing)}
             <span className="text-xs font-medium truncate text-foreground/90" title={product.title}>{product.title}</span>
          </div>
          <div className="text-[10px] text-muted-foreground flex gap-2 pl-4 items-center">
            <span className="font-mono opacity-80">{product.seller_sku || "S/ SKU"}</span>
            <span className="opacity-30">•</span>
            <span>R$ {product.price.toFixed(2)}</span>
          </div>
        </div>
      </TableCell>

      <TableCell className="text-center py-2">{renderHealth(product.health || 0, product.catalog_listing || false)}</TableCell>

      {/* VENDAS */}
      <TableCell className="text-right py-2">
        <div className="flex flex-col items-end">
          <span className="text-xs font-bold text-foreground">{product.sales_last_30_days}</span>
          <div className="flex items-center">{renderTrend(product.sales_last_30_days, prevSales)}</div>
        </div>
      </TableCell>

      {/* VISITAS / CONVERSÃO */}
      <TableCell className="text-right py-2">
        <div className="flex flex-col items-end gap-0.5">
           <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Visitas (30d)">
              <Eye className="w-3 h-3 opacity-50" /> {product.visits_last_30_days}
           </div>
           <span className={cn("text-[10px] font-medium", conversion > 2 ? "text-emerald-600" : conversion < 0.5 ? "text-red-500" : "text-foreground")}>
             {conversion.toFixed(1)}%
           </span>
        </div>
      </TableCell>

      {/* ÚLTIMA VENDA */}
      <TableCell className="text-right py-2">{renderLastSale(product.last_sale_date)}</TableCell>

      {/* FINANCEIRO */}
      <TableCell className="text-right py-2">
        <div className="flex flex-col items-end leading-tight">
          {product.sales_last_30_days > 0 ? (
             <>
               {realProfit === 0 ? (
                   <TooltipProvider>
                     <Tooltip>
                       <TooltipTrigger>
                         <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium cursor-help">
                            Sincronizando... <HelpCircle className="w-3 h-3 opacity-50"/>
                         </div>
                       </TooltipTrigger>
                       <TooltipContent>
                         <p className="w-[200px] text-xs">Venda detectada no ML, mas o pedido financeiro ainda não foi processado ou está pendente.</p>
                       </TooltipContent>
                     </Tooltip>
                   </TooltipProvider>
               ) : (
                   <span className={cn("text-xs font-bold", realProfit > 0 ? "text-emerald-600" : "text-red-600")}>
                       R$ {realProfit.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                   </span>
               )}
               <span className={cn("text-[9px]", financials.marginPercent > 15 ? "text-emerald-600" : "text-amber-600")}>Mg. {financials.marginPercent.toFixed(0)}%</span>
             </>
          ) : <span className="text-xs text-muted-foreground opacity-30">-</span>}
        </div>
      </TableCell>

      {/* DIAGNÓSTICO */}
      <TableCell className="text-center py-2">
        <Badge variant="outline" className={cn("h-5 px-1.5 text-[9px] font-medium shadow-none border-none", 
            diagnosis.label === 'Potencial' ? "bg-purple-100 text-purple-700" :
            diagnosis.label === 'Saúde Crítica' ? "bg-red-100 text-red-700" :
            "bg-gray-100 text-gray-700"
        )}>{diagnosis.label}</Badge>
      </TableCell>

      {/* AÇÃO */}
      <TableCell className="py-2 text-right">
        <div className="flex items-center justify-end gap-2">
            <Select value={product.strategic_action || ""} onValueChange={(v) => onActionChange(product.id, v)} disabled={updatingId === product.id}>
              <SelectTrigger className="h-6 text-[9px] w-[85px] bg-transparent border-muted hover:bg-background focus:ring-0"><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>{[{v:"Analisar"}, {v:"Melhorar Foto"}, {v:"Ajustar Preço"}, {v:"Ativar Ads"}].map(o => <SelectItem key={o.v} value={o.v} className="text-xs">{o.v}</SelectItem>)}</SelectContent>
            </Select>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary cursor-pointer opacity-60 hover:opacity-100" onClick={(e) => {e.stopPropagation(); window.open(product.permalink, '_blank')}} />
        </div>
      </TableCell>
    </TableRow>
  );
};

export default function ProductsTable({ products, loading, onUpdate }: ProductsTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const sortedProducts = useMemo(() => {
    if (!sortConfig) return products;
    return [...products].sort((a: any, b: any) => {
      let valA: any, valB: any; 

      if (sortConfig.key === 'profit') {
        valA = a.real_profit_30d || 0;
        valB = b.real_profit_30d || 0;
      } else if (sortConfig.key === 'last_sale') {
        valA = a.last_sale_date ? new Date(a.last_sale_date).getTime() : 0;
        valB = b.last_sale_date ? new Date(b.last_sale_date).getTime() : 0;
      } else if (sortConfig.key === 'conversion') {
        valA = a.visits_last_30_days > 0 ? (a.sales_last_30_days / a.visits_last_30_days) : 0;
        valB = b.visits_last_30_days > 0 ? (b.sales_last_30_days / b.visits_last_30_days) : 0;
      } else {
        valA = a[sortConfig.key as keyof Product];
        valB = b[sortConfig.key as keyof Product];
        if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * (sortConfig.direction === 'asc' ? 1 : -1);
      }
      return (valA < valB ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });
  }, [products, sortConfig]);

  const requestSort = (key: string) => setSortConfig(c => ({ key, direction: c?.key === key && c.direction === 'desc' ? 'asc' : 'desc' }));
  const handleActionChange = async (id: string, action: string) => { setUpdatingId(id); await supabase.from("products_snapshot").update({ strategic_action: action as any }).eq("id", id); onUpdate(); setUpdatingId(null); toast.success("Salvo"); };

  if (loading) return <div className="p-12 text-center text-muted-foreground text-sm"><span className="animate-pulse">Carregando catálogo...</span></div>;

  return (
    <>
      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 text-[10px] uppercase tracking-wider h-8">
              <TableHead className="w-[50px] pl-4">Img</TableHead>
              <TableHead className="cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('title')}>Produto <ArrowUpDown className="w-3 h-3 inline opacity-30"/></TableHead>
              <TableHead className="text-center cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('health')}>Saúde <ArrowUpDown className="w-3 h-3 inline opacity-30"/></TableHead>
              <TableHead className="text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('sales_last_30_days')}>Vendas (30d) <ArrowUpDown className="w-3 h-3 inline opacity-30"/></TableHead>
              
              {/* VISITAS / CONVERSÃO */}
              <TableHead className="text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('conversion')}>Vis./Conv. (30d) <ArrowUpDown className="w-3 h-3 inline opacity-30"/></TableHead>
              
              <TableHead className="text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('last_sale')}>Última Venda <ArrowUpDown className="w-3 h-3 inline opacity-30"/></TableHead>
              <TableHead className="text-right cursor-pointer hover:text-foreground transition-colors" onClick={() => requestSort('profit')}>Lucro Real <ArrowUpDown className="w-3 h-3 inline opacity-30"/></TableHead>
              <TableHead className="text-center">Diagnóstico</TableHead>
              <TableHead className="text-right pr-6">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{sortedProducts.map((p) => <ProductRow key={p.id} product={p} updatingId={updatingId} onActionChange={handleActionChange} onClick={() => { setSelectedProduct(p); setModalOpen(true); }} />)}</TableBody>
        </Table>
      </div>
      <ProductDetailModal product={selectedProduct} open={modalOpen} onOpenChange={setModalOpen} onUpdate={onUpdate} />
    </>
  );
}