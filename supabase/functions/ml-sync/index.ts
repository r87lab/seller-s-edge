import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- CONFIGURAÇÕES ---
const ML_APP_ID = Deno.env.get("ML_APP_ID");
const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- HELPER 1: RENOVAR TOKEN ---
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
  if (!response.ok) throw new Error("Erro ao renovar token ML");
  const data = await response.json();
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  await supabase.from("integrations").update({ 
      access_token: data.access_token, 
      refresh_token: data.refresh_token, 
      expires_at: expiresAt 
  }).eq("id", integration.id);
  return data.access_token;
}

// --- HELPER 2: BUSCAR DETALHES FINANCEIROS ---
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

        // Taxas para IGNORAR sempre (pois já estão no item)
        const blockedFees = ['ml_sale_fee', 'mp_processing_fee', 'mercadolibre_fee'];

        // 1. CHARGES DETAILS (Mais preciso)
        if (data.charges_details && data.charges_details.length > 0) {
            data.charges_details.forEach((cd: any) => {
                // SÓ conta se saiu do SEU bolso (Collector)
                if (cd.accounts.from === 'collector') {
                    
                    if (cd.type === 'shipping') {
                        hiddenShipping += Number(cd.amounts.original);
                    }
                    else if (cd.type === 'tax') {
                        taxes += Number(cd.amounts.original);
                    }
                    else if (cd.type === 'fee') {
                        if (!blockedFees.includes(cd.name)) {
                            // Soma taxas financeiras (financing_fee, financing_transfer, etc)
                            financeFee += Number(cd.amounts.original);
                        }
                    }
                }
                
                // CRÉDITOS: Se o cliente pagou o juro, abatemos do custo
                if (cd.accounts.to === 'collector' && cd.name === 'financing_transfer') {
                    financeFee -= Number(cd.amounts.original);
                }
            });
        } 
        // 2. FEE DETAILS (Fallback)
        else if (data.fee_details) {
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

// --- HELPER 3: BUSCAR CUSTO ENVIO ---
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

// --- LÓGICA PRINCIPAL ---
async function syncOrders(supabase: any, accessToken: string, userId: string, sellerId: string, fullSync: boolean) {
    const LIMIT = 50;
    const MAX_PAGES = fullSync ? 50 : 3; 
    let totalSynced = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
        const offset = page * LIMIT;
        const searchRes = await fetch(`https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&limit=${LIMIT}&offset=${offset}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
        const searchData = await searchRes.json();
        const orders = searchData.results || [];
        if (orders.length === 0) break;

        const recordsToSave = await Promise.all(orders.map(async (order: any) => {
            try {
                const detailRes = await fetch(`https://api.mercadolibre.com/orders/${order.id}`, { headers: { "Authorization": `Bearer ${accessToken}` } });
                const detail = await detailRes.json();

                // 1. Receita Bruta & Comissão do Item
                let grossRevenue = 0;
                let itemSaleFee = 0;
                // DETECÇÃO DE PREMIUM: Se for Gold Pro, a taxa de venda já inclui o financiamento
                const isPremium = detail.order_items.some((i: any) => i.listing_type_id === 'gold_pro');

                detail.order_items.forEach((item: any) => {
                    grossRevenue += (Number(item.unit_price) * Number(item.quantity));
                    if (item.sale_fee) itemSaleFee += Number(item.sale_fee);
                });

                // 2. Custos Financeiros EXTRAS
                let financeFee = 0;
                let hiddenShipping = 0;
                let retainedTaxes = 0;

                if (detail.payments && Array.isArray(detail.payments)) {
                    for (const p of detail.payments) {
                        if (p.id && (p.status === 'approved' || p.status === 'confirmed')) {
                            const extras = await fetchPaymentDetails(p.id, accessToken);
                            
                            hiddenShipping += extras.hiddenShipping;
                            retainedTaxes += extras.taxes;

                            // REGRA DE OURO: Se for Premium (isPremium), ignoramos taxa financeira extra
                            // para não duplicar com a comissão do item.
                            // Se for Clássico, somamos (pois pode ser juro absorvido).
                            if (!isPremium) {
                                financeFee += extras.financeFee;
                            }
                        }
                    }
                }

                // 3. Custo Logístico
                let shippingCost = 0;
                if (detail.shipping && detail.shipping.id) {
                    shippingCost = await fetchShipmentCost(detail.shipping.id, accessToken);
                }
                if (shippingCost === 0 && hiddenShipping > 0) {
                    shippingCost = hiddenShipping;
                }

                // 4. Custo do Produto
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

                // --- TOTAIS ---
                const totalMarketplaceFee = itemSaleFee + financeFee + retainedTaxes;
                const taxes = grossRevenue * (taxRate / 100);
                const netProfit = grossRevenue - totalMarketplaceFee - shippingCost - productCost - taxes;
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
                    taxes_amount: taxes,
                    net_profit: netProfit,
                    margin_percent: margin,
                    buyer_nickname: detail.buyer?.nickname,
                    items: detail.order_items,
                    updated_at: new Date()
                };

            } catch (err) { return null; }
        }));

        const validRecords = recordsToSave.filter(r => r !== null);
        if (validRecords.length > 0) {
            await supabase.from("orders").upsert(validRecords, { onConflict: 'ml_order_id' });
            totalSynced += validRecords.length;
        }
    }
    return totalSynced;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Token ausente");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    const { data: integration } = await supabase.from("integrations").select("*").eq("user_id", user?.id).maybeSingle();
    if (!integration) throw new Error("Integração não encontrada");
    let accessToken = integration.access_token;
    if ((integration.expires_at * 1000) - 300000 < Date.now()) { try { accessToken = await refreshToken(supabase, integration); } catch (e) {} }

    const body = await req.json();
    const fullSync = body.fullSync || false;
    
    let resultCount = await syncOrders(supabase, accessToken, user.id, integration.seller_id, fullSync);

    return new Response(JSON.stringify({ success: true, count: resultCount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});