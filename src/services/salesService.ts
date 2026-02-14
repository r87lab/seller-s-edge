import { supabase } from "@/integrations/supabase/client";

export interface SaleOrder {
  id: string;
  date_created: string;
  status: string;
  total_amount: number;
  items: {
    id: string;
    title: string;
    quantity: number;
    unit_price: number;
    seller_sku?: string;
  }[];
  shipping: {
    id: number;
    status: string;
    cost: number;
  };
  payments: {
    total_paid_amount: number;
    marketplace_fee: number;
  }[];
  unit_cost?: number;
  net_profit?: number;
  margin_percent?: number;
}

/**
 * FUNÇÃO 1: LER DADOS (Ultra Rápido)
 * Lê os pedidos já calculados e salvos no seu banco de dados Supabase.
 * Não chama o Mercado Livre.
 */
export const getStoredSales = async (days: number = 30): Promise<SaleOrder[]> => {
  try {
    // Define a data de corte (ex: 30 dias atrás)
    const date = new Date();
    date.setDate(date.getDate() - days);
    
    // CORREÇÃO DO ERRO AQUI: usamos 'as any' para o TS aceitar a tabela nova
    const { data, error } = await supabase
      .from('orders' as any) 
      .select('*')
      .gte('date_created', date.toISOString())
      .order('date_created', { ascending: false });

    if (error) {
      console.error("Erro ao ler tabela orders:", error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Mapeia os dados do banco para o formato do Dashboard
    return data.map((s: any) => ({
      id: s.ml_order_id, // Exibe o ID do ML (ex: 20000...)
      date_created: s.date_created,
      status: s.status,
      total_amount: Number(s.total_amount || 0),
      
      // Mapeia o JSON de itens salvo no banco
      items: Array.isArray(s.items) 
        ? s.items.map((i: any) => ({
            id: i.item?.id || "N/A",
            title: i.item?.title || "Produto Desconhecido",
            quantity: Number(i.quantity || 1),
            unit_price: Number(i.unit_price || 0),
            seller_sku: i.item?.seller_sku
          }))
        : [],

      // Recupera o custo de envio salvo
      shipping: {
        id: 0, 
        status: 'known', 
        cost: Number(s.shipping_cost || 0) 
      },

      // Recupera as taxas reais salvas
      payments: [{
        total_paid_amount: Number(s.total_amount || 0),
        marketplace_fee: Number(s.marketplace_fee || 0)
      }],

      unit_cost: Number(s.product_cost || 0),
      net_profit: Number(s.net_profit || 0),
      margin_percent: Number(s.margin_percent || 0)
    }));

  } catch (error) {
    console.error("Erro getStoredSales:", error);
    return [];
  }
};

/**
 * FUNÇÃO 2: ATUALIZAR (O Robô)
 * Aciona a Edge Function para buscar novos dados no ML e salvar no banco.
 * Use isso no botão "Atualizar ML".
 */
export const syncSales = async (accessToken: string, sellerId: string, fullSync: boolean = false) => {
  try {
    console.log("Disparando sincronização de pedidos...");
    
    const { data, error } = await supabase.functions.invoke('ml-sync', {
      body: { 
        action: 'sync_orders', // Importante: chama a ação de pedidos
        accessToken, 
        sellerId, 
        fullSync 
      }
    });

    if (error) throw error;
    
    return data; // Retorna { success: true, count: X }
  } catch (error) {
    console.error("Erro ao sincronizar:", error);
    throw error;
  }
};