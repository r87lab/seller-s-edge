import { supabase } from "@/integrations/supabase/client";

export interface SaleOrder {
  id: string;
  ml_order_id: string;
  user_id: string;
  date_created: string;
  status: string;
  total_amount: number;
  shipping_cost: number;
  marketplace_fee: number;
  product_cost: number;
  taxes_amount: number;
  net_profit: number;
  margin_percent: number;
  buyer_nickname: string | null;
  items: any[];
  updated_at: string;
  // Helper visual para facilitar o uso nos componentes
  breakdown?: {
    shipping_cost: number;
    marketplace_fee: number;
    product_cost: number;
    taxes_amount: number;
  };
}

/**
 * Busca vendas armazenadas no banco local (Supabase)
 * @param days - Quantos dias para trás buscar (padrão 30)
 */
export const getStoredSales = async (days: number = 30): Promise<SaleOrder[]> => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const dateStr = date.toISOString();

  // CORREÇÃO AQUI: Usamos "as any" para driblar a checagem estrita de tipos da tabela
  const { data, error } = await supabase
    .from("orders" as any) 
    .select("*")
    .gte("date_created", dateStr)
    .order("date_created", { ascending: false });

  if (error) {
    console.error("Erro ao buscar vendas locais:", error);
    throw error;
  }

  // CORREÇÃO AQUI: Garantimos que 'data' seja tratado como array genérico
  // para evitar erros de propriedade inexistente
  return (data as any[] || []).map((order: any) => ({
    ...order,
    breakdown: {
      shipping_cost: order.shipping_cost || 0,
      marketplace_fee: order.marketplace_fee || 0,
      product_cost: order.product_cost || 0,
      taxes_amount: order.taxes_amount || 0
    }
  }));
};

/**
 * INVOCAÇÃO DA EDGE FUNCTION (PAGINADA)
 * Chama o backend pedindo para processar UM lote específico.
 * @param offset - O índice de início (ex: 0 para recentes, 50 para anteriores...)
 * @returns Objeto com metadados: { success, processed, has_more, total_remote }
 */
export const syncSalesPage = async (offset: number = 0) => {
  // A Edge Function 'ml-sync' agora espera apenas o { offset } no body.
  // A autenticação é feita automaticamente pelo cabeçalho do Supabase Client.
  const { data, error } = await supabase.functions.invoke('ml-sync', {
    body: { offset }
  });

  if (error) {
    console.error("Erro de comunicação com ml-sync:", error);
    throw error;
  }

  return data;
};

/**
 * Wrapper de compatibilidade (Opcional)
 * Caso algum componente antigo ainda chame syncSales passando token,
 * redirecionamos para uma sync simples da página 0 (mais recentes).
 */
export const syncSales = async (accessToken?: string, sellerId?: string, fullSync?: boolean) => {
  // Ignoramos os parametros antigos pois o backend novo se auto-gerencia.
  // Apenas chamamos a página 0 para atualizar os pedidos mais recentes.
  return syncSalesPage(0);
};