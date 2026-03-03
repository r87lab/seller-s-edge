import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getStoredSales, syncSales, SaleOrder } from "@/services/salesService"; 
import SalesChart from "@/components/dashboard/SalesChart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DollarSign, ShoppingBag, Filter, Calendar as CalendarIcon, RefreshCw, Wallet, Package, ArrowUpDown, Loader2, Settings2, CheckSquare, X, History } from "lucide-react";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { toast } from "sonner"; 
import { cn } from "@/lib/utils";

// --- CONFIGURAÇÕES ---
const COLUMNS_CONFIG = [
  { id: 'fees', label: 'Taxas ML', color: 'text-red-500', getValue: (o: SaleOrder) => -(o.breakdown?.marketplace_fee || 0) },
  { id: 'shipping', label: 'Envio', color: 'text-red-500', getValue: (o: SaleOrder) => -(o.breakdown?.shipping_cost || 0) },
  { id: 'cost', label: 'Custo', color: 'text-amber-600', getValue: (o: SaleOrder) => -(o.breakdown?.product_cost || 0) },
  { id: 'margin', label: 'Margem %', color: 'text-foreground', getValue: (o: SaleOrder) => `${o.margin_percent?.toFixed(1)}%` },
];

const PERIOD_OPTIONS = { "7d": 7, "15d": 15, "30d": 30, "60d": 60, "90d": 90 };
const STATUS_OPTIONS = { "paid": "Pagos", "all": "Todos", "cancelled": "Cancelados" };

export default function Sales() {
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  // Dicionário para guardar foto e titulo: { "MLB123": { title: "X", img: "url" } }
  const [productDetails, setProductDetails] = useState<Record<string, { title: string, thumbnail: string }>>({});
  
  const [loading, setLoading] = useState(true); 
  const [isSyncing, setIsSyncing] = useState(false);    
  
  // Filtros & Visualização
  const [statusFilter, setStatusFilter] = useState("paid");
  const [periodFilter, setPeriodFilter] = useState("30d");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [visibleCols, setVisibleCols] = useState<string[]>(['profit', 'margin']); 
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date_created', direction: 'desc' });

  const loadData = async () => {
    setLoading(true);
    try {
      const days = dateRange?.from ? 180 : (PERIOD_OPTIONS[periodFilter as keyof typeof PERIOD_OPTIONS] || 30);
      const salesData = await getStoredSales(days);
      setOrders(salesData);

      // --- CORREÇÃO DO PROBLEMA DE IMAGENS ---
      // 1. Extrair todos os IDs de itens dos pedidos
      const itemIds = new Set<string>();
      salesData.forEach(o => {
          if (o.items && Array.isArray(o.items) && o.items.length > 0) {
              // O item.id pode estar direto ou aninhado dependendo da versão da API do ML
              const item = o.items[0];
              const id = item.item?.id || item.id; 
              if (id) itemIds.add(id);
          }
      });

      // 2. Buscar detalhes no snapshot
      if (itemIds.size > 0) {
          const { data } = await supabase
            .from("products_snapshot")
            .select("item_id, title, thumbnail")
            .in("item_id", Array.from(itemIds));
          
          const detailsMap: Record<string, { title: string, thumbnail: string }> = {};
          data?.forEach(p => {
              detailsMap[p.item_id] = { title: p.title, thumbnail: p.thumbnail };
          });
          setProductDetails(detailsMap);
      }
    } catch (e) { 
        console.error(e);
        toast.error("Erro ao carregar vendas."); 
    } finally { 
        setLoading(false); 
    }
  };

  const handleSync = async (fullSync: boolean = false) => {
    setIsSyncing(true);
    try {
      const { data } = await supabase.from("integrations").select("access_token, seller_id").maybeSingle();
      if (!data?.access_token) return toast.error("Integração inválida.");
      
      const msg = fullSync ? "Resgatando histórico completo (pode demorar)..." : "Sincronizando vendas recentes...";
      toast.info(msg);
      
      // Chamamos a função de sync (ela usará a paginação interna ou padrão)
      await syncSales(data.access_token, data.seller_id, fullSync);
      
      toast.success(fullSync ? "Histórico resgatado com sucesso!" : "Atualizado!");
      await loadData();
    } catch (e) { toast.error("Erro na sincronização."); } finally { setIsSyncing(false); }
  };

  useEffect(() => { loadData(); }, [periodFilter, dateRange]);

  const { processedOrders, metrics, chartData } = useMemo(() => {
    let result = orders.filter(o => statusFilter === "all" || o.status === statusFilter);
    
    if (dateRange?.from) {
      const from = startOfDay(dateRange.from);
      const to = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      result = result.filter(o => isWithinInterval(parseISO(o.date_created), { start: from, end: to }));
    }

    // Ordenação
    result.sort((a: any, b: any) => {
      let valA: any, valB: any;
      if (sortConfig.key === 'margin') valA = a.margin_percent;
      else if (sortConfig.key === 'profit') valA = a.net_profit;
      else valA = a[sortConfig.key] || 0;

      if (sortConfig.key === 'margin') valB = b.margin_percent;
      else if (sortConfig.key === 'profit') valB = b.net_profit;
      else valB = b[sortConfig.key] || 0;

      if (sortConfig.key === 'date_created') { valA = new Date(valA).getTime(); valB = new Date(valB).getTime(); }
      return (valA < valB ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
    });

    const grouped: Record<string, any> = {};
    const rev = result.reduce((acc, c) => acc + c.total_amount, 0);
    const prof = result.reduce((acc, c) => acc + (c.net_profit || 0), 0);
    
    [...result].sort((a,b) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime()).forEach(o => {
       const d = format(parseISO(o.date_created), "dd/MM");
       if (!grouped[d]) grouped[d] = { sales: 0, count: 0 };
       grouped[d].sales += o.total_amount;
       grouped[d].count++;
    });

    return { 
      processedOrders: result, 
      metrics: { revenue: rev, profit: prof, count: result.length, ticket: result.length ? rev/result.length : 0 },
      chartData: Object.keys(grouped).map(d => ({ date: d, ...grouped[d] }))
    };
  }, [orders, statusFilter, sortConfig, dateRange]);

  const toggleCol = (id: string) => setVisibleCols(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const requestSort = (key: string) => setSortConfig(curr => ({ key, direction: curr.key === key && curr.direction === 'desc' ? 'asc' : 'desc' }));

  // Helper para pegar dados do produto de forma segura
  const getProductInfo = (order: SaleOrder) => {
      if (!order.items || order.items.length === 0) return { title: "Produto desconhecido", img: null, id: null };
      const item = order.items[0];
      const id = item.item?.id || item.id;
      const title = productDetails[id]?.title || item.item?.title || item.title || "Produto sem título";
      const img = productDetails[id]?.thumbnail || null;
      return { title, img, id };
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
        
        {/* HEADER & ACTIONS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Vendas</h1>
            <p className="text-muted-foreground text-sm">Acompanhe a saúde financeira e resgate o histórico.</p>
          </div>
          <div className="flex gap-2">
             <Button 
                onClick={() => handleSync(true)} 
                disabled={isSyncing} 
                variant="outline" 
                size="sm"
                className="hidden sm:flex"
             >
                <History className="w-4 h-4 mr-2 text-muted-foreground"/> 
                Resgatar Histórico
             </Button>
             <Button onClick={() => handleSync(false)} disabled={isSyncing} size="sm">
                {isSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <RefreshCw className="w-4 h-4 mr-2"/>}
                {isSyncing ? "Buscando..." : "Atualizar ML"}
             </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard title="Faturamento" value={metrics.revenue} icon={DollarSign} color="text-foreground" />
          <MetricCard title="Lucro Líquido" value={metrics.profit} icon={Wallet} color={metrics.profit >= 0 ? "text-emerald-600" : "text-red-600"} />
          <MetricCard title="Ticket Médio" value={metrics.ticket} icon={ShoppingBag} color="text-blue-600" />
        </div>

        <Card className="p-4 shadow-sm border"><div className="h-[350px] w-full"><SalesChart data={chartData} loading={loading} /></div></Card>

        <Card className="border shadow-sm overflow-hidden mt-6">
          <div className="bg-muted/30 p-4 border-b flex flex-col xl:flex-row gap-4 items-center justify-between">
             <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto items-center">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-full sm:w-[140px] bg-background text-xs"><Filter className="w-3 h-3 mr-2"/> <SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_OPTIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={periodFilter} onValueChange={setPeriodFilter} disabled={!!dateRange}>
                  <SelectTrigger className="h-9 w-full sm:w-[140px] bg-background text-xs"><CalendarIcon className="w-3 h-3 mr-2"/> <SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PERIOD_OPTIONS).map(([k]) => <SelectItem key={k} value={k}>{k.replace('d', ' dias')}</SelectItem>)}</SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full sm:w-[240px] justify-start text-left font-normal h-9 text-xs bg-background", !dateRange && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "dd/MM/y")} - ${format(dateRange.to, "dd/MM/y")}` : format(dateRange.from, "dd/MM/y")) : "Período Personalizado"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} locale={ptBR} /></PopoverContent>
                </Popover>
                {dateRange && <Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)} className="h-9 w-9"><X className="w-4 h-4" /></Button>}
             </div>
             
             <div className="flex items-center gap-2 ml-auto">
               <span className="text-xs text-muted-foreground hidden sm:inline-block">{metrics.count} vendas • Margem {(metrics.revenue ? (metrics.profit/metrics.revenue)*100 : 0).toFixed(1)}%</span>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 bg-background text-xs"><Settings2 className="w-3 h-3 mr-2" /> Colunas</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Visualização</DropdownMenuLabel><DropdownMenuSeparator />
                    <div onClick={() => setVisibleCols(visibleCols.length === COLUMNS_CONFIG.length ? [] : COLUMNS_CONFIG.map(c => c.id))} className="relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-sm hover:bg-accent"><CheckSquare className="w-4 h-4 mr-2" /> Selecionar Todas</div>
                    <DropdownMenuSeparator />
                    {COLUMNS_CONFIG.map(col => <DropdownMenuCheckboxItem key={col.id} checked={visibleCols.includes(col.id)} onCheckedChange={() => toggleCol(col.id)}>{col.label}</DropdownMenuCheckboxItem>)}
                  </DropdownMenuContent>
               </DropdownMenu>
             </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[100px] cursor-pointer hover:bg-muted/60" onClick={() => requestSort('date_created')}><div className="flex items-center gap-1">Data <ArrowUpDown className="w-3 h-3"/></div></TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => requestSort('total_amount')}>Venda <ArrowUpDown className="inline w-3 h-3"/></TableHead>
                  {COLUMNS_CONFIG.map(col => visibleCols.includes(col.id) && <TableHead key={col.id} className={`text-right ${col.color}`}>{col.label}</TableHead>)}
                  <TableHead className="text-right cursor-pointer" onClick={() => requestSort('profit')}>Lucro <ArrowUpDown className="inline w-3 h-3"/></TableHead>
                  <TableHead className="text-center w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={8} className="h-24 text-center"><Loader2 className="animate-spin w-5 h-5 mx-auto" /></TableCell></TableRow> : 
                processedOrders.length === 0 ? <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Nenhuma venda encontrada.</TableCell></TableRow> : 
                processedOrders.map((order) => {
                    const productInfo = getProductInfo(order);
                    return (
                      <TableRow key={order.id} className="group hover:bg-muted/40 transition-colors">
                        <TableCell><div className="flex flex-col text-xs"><span className="font-medium">{format(parseISO(order.date_created), "dd/MM")}</span><span className="text-muted-foreground">{format(parseISO(order.date_created), "HH:mm")}</span></div></TableCell>
                        <TableCell>
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-md bg-white border shrink-0 overflow-hidden flex items-center justify-center p-0.5">
                                  {productInfo.img ? <img src={productInfo.img} className="w-full h-full object-contain" /> : <Package className="w-4 h-4 text-muted-foreground/30" />}
                              </div>
                              <div className="flex flex-col max-w-[280px]">
                                  <span className="text-sm font-medium truncate" title={productInfo.title}>{productInfo.title}</span>
                                  <span className="text-[10px] text-muted-foreground">#{order.ml_order_id}</span>
                              </div>
                           </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">R$ {order.total_amount.toFixed(2)}</TableCell>
                        {COLUMNS_CONFIG.map(col => visibleCols.includes(col.id) && <TableCell key={col.id} className={`text-right text-xs ${col.color}`}>{typeof col.getValue(order) === 'number' ? `R$ ${Number(col.getValue(order)).toFixed(2)}` : col.getValue(order)}</TableCell>)}
                        <TableCell className="text-right"><div className={`font-bold text-sm ${order.net_profit > 0 ? "text-emerald-600" : "text-red-600"}`}>R$ {order.net_profit?.toFixed(2)}</div></TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className={`text-[10px] font-normal ${order.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100'}`}>{order.status === 'paid' ? 'Pago' : order.status}</Badge></TableCell>
                      </TableRow>
                    );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ title, value, icon: Icon, color }: any) {
  return (
    <Card className="shadow-none border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4"><CardTitle className="text-xs font-medium text-muted-foreground uppercase">{title}</CardTitle><Icon className={`h-4 w-4 ${color} opacity-70`} /></CardHeader>
      <CardContent className="p-4 pt-0"><div className={`text-2xl font-bold ${color}`}>{typeof value === 'number' ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : value}</div></CardContent>
    </Card>
  )
}