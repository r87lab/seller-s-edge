import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateFinancials, getSmartDiagnosis } from "@/lib/ad-calculations";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { 
  ExternalLink, DollarSign, Edit3, TrendingUp, TrendingDown, 
  Target, Wallet, Save, AlertCircle, Eye, ShoppingCart, BarChart3, Calendar, History,
  Truck, Zap, Heart, BookOpen, Package 
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  real_sales_30d?: number; 
  sold_quantity_total?: number;
  sales_previous_30_days?: number;
  strategic_action: string | null;
  my_notes: string | null;
  date_created: string | null;
  cost_price?: number;
  listing_type_id?: string;
  custom_tax_rate?: number;
  average_shipping_cost?: number; // NOVO CAMPO
  logistic_type?: string;
  health?: number;
  free_shipping?: boolean;
  catalog_listing?: boolean;
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
  const [editingTax, setEditingTax] = useState(false);
  const [newTax, setNewTax] = useState("");
  const [editingShipping, setEditingShipping] = useState(false);
  const [newShipping, setNewShipping] = useState("");

  if (!product) return null;

  const salesMonth = product.real_sales_30d !== undefined ? product.real_sales_30d : (product.sales_last_30_days || 0);
  const salesTotal = product.sold_quantity_total !== undefined ? product.sold_quantity_total : (product.sales_last_30_days || 0);
  const salesPrev = product.sales_previous_30_days || 0;

  const productForCalc = { ...product, sales_last_30_days: salesMonth };
  const financials = calculateFinancials(productForCalc);
  
  const diagnosis = getSmartDiagnosis({
      price: product.price,
      visits: product.visits_last_30_days,
      sales: salesMonth,
      sales_prev: salesPrev,
      marginPercent: financials.marginPercent,
      date_created: product.date_created,
      logistic_type: product.logistic_type,
      health: product.health
  });

  const mlFee = product.price * (Number(financials.taxRateUsed)/100);
  const taxes = product.price * 0.06; 
  const cost = Number(product.cost_price) || 0;
  const shipping = Number(product.average_shipping_cost) || 0; // Custo de Frete
  const fixedFee = product.price < 79 ? 6.00 : 0;
  const unitProfit = product.price - mlFee - taxes - fixedFee - cost - shipping;
  const totalRevenueLifeTime = product.price * salesTotal;
  const conversionReal = product.visits_last_30_days > 0 ? (salesMonth / product.visits_last_30_days) * 100 : 0;

  const handleSaveTax = async () => {
    setLoading("tax");
    try {
      const val = parseFloat(newTax.replace(",", "."));
      if (isNaN(val) || val < 0 || val > 100) throw new Error("Valor inválido");
      await supabase.from("products_snapshot" as any).update({ custom_tax_rate: val }).eq("id", product.id);
      toast({ title: "Taxa salva!" });
      setEditingTax(false);
      onUpdate?.();
    } catch (error: any) { toast({ title: "Erro", description: error.message, variant: "destructive" }); } 
    finally { setLoading(null); }
  };

  const handleSaveShipping = async () => {
    setLoading("shipping");
    try {
      const val = parseFloat(newShipping.replace(",", "."));
      if (isNaN(val) || val < 0) throw new Error("Valor inválido");
      await supabase.from("products_snapshot" as any).update({ average_shipping_cost: val }).eq("id", product.id);
      toast({ title: "Frete salvo!" });
      setEditingShipping(false);
      onUpdate?.();
    } catch (error: any) { toast({ title: "Erro", description: error.message, variant: "destructive" }); } 
    finally { setLoading(null); }
  };

  const openML = (mode: 'view' | 'edit') => {
    window.open(mode === 'edit' ? `https://www.mercadolivre.com.br/anuncios/lista?search=${product.item_id}` : product.permalink, '_blank');
  };

  const getLogisticLabel = (type?: string) => {
    switch(type) {
        case 'fulfillment': return { label: 'Full', icon: Zap, color: 'bg-green-100 text-green-700 border-green-200' };
        case 'cross_docking': return { label: 'Agência', icon: Truck, color: 'bg-blue-100 text-blue-700 border-blue-200' };
        case 'drop_off': return { label: 'Correios', icon: Package, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
        default: return { label: 'Envio', icon: Package, color: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
  };

  const logistic = getLogisticLabel(product.logistic_type);
  const health = product.health ? Math.round(product.health * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] bg-card border-border max-h-[95vh] overflow-y-auto p-0 gap-0">
        {/* CABEÇALHO (IGUAL) */}
        <div className="p-6 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 bg-white rounded-md border p-1 flex-shrink-0"><img src={product.thumbnail} alt="" className="w-full h-full object-contain" /></div>
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Badge variant={product.status === "active" ? "default" : "secondary"} className={product.status === "active" ? "bg-emerald-500 hover:bg-emerald-600" : ""}>{product.status === "active" ? "Ativo" : "Pausado"}</Badge>
                    <span className="text-xs font-mono text-muted-foreground">{product.item_id}</span>
                </div>
                <DialogTitle className="text-base font-semibold line-clamp-1 max-w-[400px]">{product.title}</DialogTitle>
                <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className={cn("gap-1 font-normal", logistic.color)}><logistic.icon className="w-3 h-3" /> {logistic.label}</Badge>
                    {health > 0 && <Badge variant="outline" className={cn("gap-1 font-normal", health < 70 ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-600 border-slate-200")}><Heart className="w-3 h-3" /> Saúde {health}%</Badge>}
                    {product.free_shipping && <Badge variant="outline" className="gap-1 font-normal bg-green-50 text-green-600 border-green-200"><Truck className="w-3 h-3" /> Frete Grátis</Badge>}
                    {product.catalog_listing && <Badge variant="outline" className="gap-1 font-normal bg-purple-50 text-purple-600 border-purple-200"><BookOpen className="w-3 h-3" /> Catálogo</Badge>}
                </div>
            </div>
          </div>
          <div className="text-right"><p className="text-xs text-muted-foreground uppercase font-bold">Preço de Venda</p><p className="text-2xl font-bold text-primary">R$ {product.price.toFixed(2)}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2">
            {/* ESQUERDA (IGUAL) */}
            <div className="p-6 space-y-6 border-b md:border-b-0 md:border-r border-border">
                <div>
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-4"><BarChart3 className="w-4 h-4 text-primary" /> Performance</h4>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-secondary/30 p-3 rounded-xl border text-center"><p className="text-xl font-bold">{product.visits_last_30_days}</p><p className="text-[10px] text-muted-foreground uppercase">Visitas (30d)</p></div>
                        <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-center"><p className="text-xl font-bold text-emerald-600">{salesMonth}</p><p className="text-[10px] text-emerald-600/80 uppercase font-semibold">Vendas (30d)</p></div>
                        <div className="bg-secondary/30 p-3 rounded-xl border text-center"><p className="text-xl font-bold">{salesTotal}</p><p className="text-[10px] text-muted-foreground uppercase">Total Vida</p></div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20"><span className="text-xs font-medium text-blue-400 block mb-1">Conversão (30d)</span><p className="text-2xl font-bold text-blue-500">{conversionReal.toFixed(2)}%</p></div>
                        <div className="bg-secondary/30 p-4 rounded-xl border"><span className="text-xs font-medium text-muted-foreground block mb-1">Receita Total</span><p className="text-xl font-bold text-foreground">R$ {totalRevenueLifeTime.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p></div>
                    </div>
                </div>
                <div className={cn("p-4 rounded-xl border flex items-center justify-between", diagnosis.color)}>
                    <div><span className="font-bold text-lg">{diagnosis.label}</span><p className="text-[10px] opacity-80 mt-1">Recomendação: {diagnosis.action}</p></div>
                    <Target className="w-8 h-8 opacity-50" />
                </div>
            </div>

            {/* DIREITA (COM FRETE) */}
            <div className="p-6 bg-secondary/10">
                <h4 className="text-sm font-semibold flex items-center gap-2 mb-4"><Wallet className="w-4 h-4 text-primary" /> Custos Unitários</h4>
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Preço</span><span className="font-mono font-medium">R$ {product.price.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm text-amber-600"><span className="flex items-center gap-1"><span className="text-[10px] bg-amber-100 px-1 rounded">-</span> Custo Produto</span><span className="font-mono font-medium">R$ {cost.toFixed(2)}</span></div>
                    
                    {/* TAXA EDITÁVEL */}
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2"><span>Taxa ML ({financials.taxRateUsed}%)</span><button onClick={() => setEditingTax(!editingTax)}><Edit3 className="w-3 h-3 text-primary" /></button></div>
                        {editingTax ? (<div className="flex items-center gap-1"><Input className="h-6 w-14 text-right text-xs p-1" value={newTax} onChange={e => setNewTax(e.target.value)} autoFocus /><Button size="icon" className="h-6 w-6" onClick={handleSaveTax}><Save className="w-3 h-3" /></Button></div>) : (<span className="font-mono">R$ {mlFee.toFixed(2)}</span>)}
                    </div>

                    {/* FRETE EDITÁVEL (NOVO) */}
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <span>Frete Pago</span>
                            <button onClick={() => setEditingShipping(!editingShipping)} title="Definir Custo de Frete"><Edit3 className="w-3 h-3 text-primary" /></button>
                        </div>
                        {editingShipping ? (
                            <div className="flex items-center gap-1">
                                <Input className="h-6 w-14 text-right text-xs p-1" placeholder="R$" value={newShipping} onChange={e => setNewShipping(e.target.value)} autoFocus />
                                <Button size="icon" className="h-6 w-6" onClick={handleSaveShipping}><Save className="w-3 h-3" /></Button>
                            </div>
                        ) : (
                            <span className="font-mono">R$ {shipping.toFixed(2)}</span>
                        )}
                    </div>

                    <div className="flex justify-between text-sm text-muted-foreground"><span>Impostos (6%)</span><span className="font-mono">R$ {taxes.toFixed(2)}</span></div>
                    {fixedFee > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Taxa Fixa</span><span className="font-mono">R$ {fixedFee.toFixed(2)}</span></div>}
                    <Separator className="my-2" />
                    <div className="flex justify-between items-end"><span className="font-bold text-sm">Lucro Líq.</span><span className={cn("text-2xl font-bold font-mono", unitProfit > 0 ? "text-emerald-500" : "text-red-500")}>R$ {unitProfit.toFixed(2)}</span></div>
                </div>
                
                {(cost === 0 && <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-3"><AlertCircle className="w-5 h-5 text-amber-500" /><p className="text-xs text-amber-500">Defina o custo para ver o lucro real.</p></div>)}
                {(product.free_shipping && shipping === 0 && <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex gap-3"><Truck className="w-5 h-5 text-blue-500" /><p className="text-xs text-blue-500">Este produto tem frete grátis. Defina o custo acima.</p></div>)}

                <div className="mt-6 grid grid-cols-2 gap-3">
                    <Button variant="outline" className="w-full gap-2" onClick={() => openML('view')}><ExternalLink className="w-4 h-4" /> Ver</Button>
                    <Button className="w-full gap-2" onClick={() => openML('edit')}><Edit3 className="w-4 h-4" /> Editar</Button>
                </div>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}