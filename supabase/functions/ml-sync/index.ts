import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configurações de Ambiente
const ML_APP_ID = Deno.env.get("ML_APP_ID");
const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Limite de segurança para chamadas simultâneas dentro desta execução
const CONCURRENCY_LIMIT = 5; 

// --- HELPERS (Token, Pagamento, Envio) ---

async function refreshToken(supabase: any, integration: any) {
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ML_APP_ID!,
      client_secret: ML_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
    }),
  });

  if (!response.ok) {
    console.error("Erro token:", await response.text());
    throw new Error("Falha na renovação do token ML");
  }

  const data = await response.json();
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  
  await supabase.from("integrations").update({ 
      access_token: data.access_token, 
      refresh_token: data.refresh_token, 
      expires_at: expiresAt 
  }).eq("id", integration.id);
  
  return data.access_token;
}

async function fetchPaymentDetails(paymentId: string | number, accessToken: string) {
    if (!paymentId) return { financeFee: 0, hiddenShipping: 0, taxes: 0 };
    try {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return { financeFee: 0, hiddenShipping: 0, taxes: 0 };
        const data = await res.json();
        
        let financeFee = 0;
        let hiddenShipping = 0;
        let taxes = 0; 
        const blockedFees = ['ml_sale_fee', 'mp_processing_fee', 'mercadolibre_fee'];

        if (data.charges_details && data.charges_details.length > 0) {
            data.charges_details.forEach((cd: any) => {
                if (cd.accounts.from === 'collector') {
                    if (cd.type === 'shipping') hiddenShipping += Number(cd.amounts.original);
                    else if (cd.type === 'tax') taxes += Number(cd.amounts.original);
                    else if (cd.type === 'fee' && !blockedFees.includes(cd.name)) {
                        financeFee += Number(cd.amounts.original);
                    }
                }
                // Se o marketplace devolveu o custo financeiro (ex: subsídio), abatemos
                if (cd.accounts.to === 'collector' && cd.name === 'financing_transfer') {
                    financeFee -= Number(cd.amounts.original);
                }
            });
        } else if (data.fee_details) {
            data.fee_details.forEach((fd: any) => {
                if (fd.fee_payer === 'collector') {
                    if (fd.type === 'financing_fee') financeFee += Number(fd.amount);
                    else if (fd.type === 'shipping_fee') hiddenShipping += Number(fd.amount);
                }
            });
        }
        return { financeFee, hiddenShipping, taxes };
    } catch (e) { return { financeFee: 0, hiddenShipping: 0, taxes: 0 }; }
}

async function fetchShipmentCost(shippingId: number, accessToken: string): Promise<number> {
    if (!shippingId) return 0;
    try {
        const res = await fetch(`https://api.mercadolibre.com/shipments/${shippingId}/costs`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return 0;
        const data = await res.json();
        const senderCost = data.senders?.find((s: any) => s.cost > 0);
        return senderCost ? Number(senderCost.cost) : 0;
    } catch (e) { return 0; }
}

// --- PROCESSADOR DE PEDIDO ÚNICO ---
async function processOrder(orderSummary: any, accessToken: string, userId: string, supabase: any) {
    try {
        // 1. Detalhes do Pedido
        const detailRes = await fetch(`https://api.mercadolibre.com/orders/${orderSummary.id}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
        if (!detailRes.ok) return null;
        const detail = await detailRes.json();

        // 2. Receita e Taxa de Venda
        let grossRevenue = 0;
        let itemSaleFee = 0;
        const isPremium = detail.order_items.some((i: any) => i.listing_type_id === 'gold_pro');

        detail.order_items.forEach((item: any) => {
            grossRevenue += (Number(item.unit_price) * Number(item.quantity));
            if (item.sale_fee) itemSaleFee += Number(item.sale_fee);
        });

        // 3. Custos Extras (Financeiro e Envio Oculto)
        let financeFee = 0;
        let hiddenShipping = 0;
        let retainedTaxes = 0;

        if (detail.payments) {
            for (const p of detail.payments) {
                if (p.id && (p.status === 'approved' || p.status === 'confirmed')) {
                    const extras = await fetchPaymentDetails(p.id, accessToken);
                    hiddenShipping += extras.hiddenShipping;
                    retainedTaxes += extras.taxes;
                    if (!isPremium) financeFee += extras.financeFee;
                }
            }
        }

        // 4. Custo Logístico Oficial
        let shippingCost = 0;
        if (detail.shipping?.id) {
            shippingCost = await fetchShipmentCost(detail.shipping.id, accessToken);
        }
        // Fallback: se api de envio retornar 0, mas houver envio no pagamento, usa o do pagamento
        if (shippingCost === 0 && hiddenShipping > 0) {
            shippingCost = hiddenShipping;
        }

        // 5. Custo do Produto (vindo do Snapshot)
        let itemId = detail.order_items[0]?.item.id;
        let productCost = 0;
        let taxRate = 6; 
        
        if (itemId) {
            const { data: productData } = await supabase.from("products_snapshot")
                .select("cost_price, custom_tax_rate")
                .eq("item_id", itemId)
                .maybeSingle();
            if (productData) {
                productCost = Number(productData.cost_price || 0);
                taxRate = Number(productData.custom_tax_rate || 6);
            }
        }

        // 6. Cálculo Final
        const totalMarketplaceFee = itemSaleFee + financeFee + retainedTaxes;
        const calculatedTaxes = grossRevenue * (taxRate / 100);
        const netProfit = grossRevenue - totalMarketplaceFee - shippingCost - productCost - calculatedTaxes;
        const margin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

        return {
            ml_order_id: String(detail.id),
            user_id: userId,
            date_created: detail.date_created,
            status: detail.status,
            total_amount: grossRevenue,
            shipping_cost: shippingCost,
            marketplace_fee: totalMarketplaceFee,
            product_cost: productCost,
            taxes_amount: calculatedTaxes,
            net_profit: netProfit,
            margin_percent: margin,
            buyer_nickname: detail.buyer?.nickname,
            items: detail.order_items,
            updated_at: new Date()
        };

    } catch (e) {
        console.error(`Erro processando pedido ${orderSummary.id}:`, e);
        return null;
    }
}

// --- HANDLER PRINCIPAL ---
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // 1. Autenticação e Token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");
    const token = authHeader.replace("Bearer ", "");
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Usuário inválido");

    const { data: integration } = await supabase.from("integrations").select("*").eq("user_id", user.id).maybeSingle();
    if (!integration) throw new Error("Integração não encontrada");

    let accessToken = integration.access_token;
    // Renova se faltar menos de 10 min para expirar
    if ((integration.expires_at * 1000) - 600000 < Date.now()) { 
        try { accessToken = await refreshToken(supabase, integration); } catch (e) { console.error("Erro renovando token", e); } 
    }

    // 2. Leitura dos Parâmetros de Paginação
    const body = await req.json();
    const offset = body.offset || 0;
    const limit = 50; // Sempre 50 por segurança

    console.log(`[ML-SYNC] Iniciando lote. Offset: ${offset}, Limit: ${limit}`);

    // 3. Busca a Lista de Pedidos (Apenas IDs e básico)
    const searchRes = await fetch(`https://api.mercadolibre.com/orders/search?seller=${integration.seller_id}&sort=date_desc&limit=${limit}&offset=${offset}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
    
    if (!searchRes.ok) {
        const errTxt = await searchRes.text();
        throw new Error(`Erro ML Search: ${errTxt}`);
    }

    const searchData = await searchRes.json();
    const orders = searchData.results || [];
    const totalOrders = searchData.paging?.total || 0;

    // 4. Processamento Paralelo Limitado (Chunking)
    // Isso evita estourar rate limits e timeout
    const chunks = [];
    for (let i = 0; i < orders.length; i += CONCURRENCY_LIMIT) {
        chunks.push(orders.slice(i, i + CONCURRENCY_LIMIT));
    }

    let processedCount = 0;
    const pageRecords = [];

    for (const chunk of chunks) {
        // Processa 5 pedidos simultaneamente
        const chunkResults = await Promise.all(chunk.map((order: any) => processOrder(order, accessToken, user.id, supabase)));
        
        // Filtra falhas
        const valid = chunkResults.filter(r => r !== null);
        pageRecords.push(...valid);
        processedCount += valid.length;
    }

    // 5. Upsert no Banco (Todos da página de uma vez)
    if (pageRecords.length > 0) {
        const { error } = await supabase.from("orders").upsert(pageRecords, { onConflict: 'ml_order_id' });
        if (error) throw error;
    }

    // 6. Retorno com Metadados para o Frontend saber se continua
    return new Response(JSON.stringify({ 
        success: true, 
        processed: processedCount, 
        offset: offset,
        total_remote: totalOrders,
        has_more: (offset + limit) < totalOrders // Flag crucial para o loop do frontend
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Erro Fatal:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});