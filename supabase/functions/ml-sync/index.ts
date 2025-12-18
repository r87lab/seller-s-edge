import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ML_APP_ID = Deno.env.get("ML_APP_ID");
const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const data = await response.json();
  if (!response.ok) throw new Error("Erro token");
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  await supabase.from("integrations").update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt }).eq("id", integration.id);
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Invalid user");

    const { data: integration, error: intError } = await supabase.from("integrations").select("*").eq("user_id", user.id).maybeSingle();
    if (intError || !integration) throw new Error("Integration not found");

    let accessToken = integration.access_token;
    if ((integration.expires_at * 1000) - 300000 < Date.now()) { try { accessToken = await refreshToken(supabase, integration); } catch (e) {} }

    let allIds: string[] = [];
    let offset = 0;
    const limit = 50;
    let keepFetching = true;

    while (keepFetching) {
      const res = await fetch(`https://api.mercadolibre.com/users/${integration.seller_id}/items/search?limit=${limit}&offset=${offset}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!data.results || data.results.length === 0) keepFetching = false;
      else { allIds = [...allIds, ...data.results]; offset += limit; if (data.results.length < limit) keepFetching = false; }
      if (allIds.length >= 2000) keepFetching = false;
    }

    if (allIds.length === 0) return new Response(JSON.stringify({ synced: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    console.log(`Atualizando ${allIds.length} produtos...`);
    const productsToUpsert = [];
    const BATCH_SIZE = 20;

    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
      const chunk = allIds.slice(i, i + BATCH_SIZE);
      const idsString = chunk.join(",");
      
      // CORREÇÃO AQUI: Adicionei 'attributes' na lista de campos pedidos
      const dRes = await fetch(`https://api.mercadolibre.com/items?ids=${idsString}&attributes=id,title,price,permalink,thumbnail,seller_custom_field,status,sold_quantity,date_created,shipping,health,catalog_listing,listing_type_id,attributes`, { headers: { Authorization: `Bearer ${accessToken}` } });
      const dData = await dRes.json();

      if (Array.isArray(dData)) {
        const items = await Promise.all(dData.map(async (w: any) => {
          if (w.code !== 200) return null;
          const item = w.body;
          
          let visits = 0;
          try {
             const vRes = await fetch(`https://api.mercadolibre.com/items/${item.id}/visits/time_window?last=30&unit=day`, { headers: { Authorization: `Bearer ${accessToken}` } });
             if (vRes.ok) { const vData = await vRes.json(); visits = vData.total_visits || 0; }
          } catch (err) {}

          // Lógica SKU Reforçada
          let finalSku = item.seller_custom_field;
          if (!finalSku && item.attributes) {
              const skuAttr = item.attributes.find((a: any) => a.id === "SELLER_SKU");
              if (skuAttr) finalSku = skuAttr.value_name;
          }

          return {
            item_id: item.id,
            user_id: user.id,
            title: item.title,
            price: item.price,
            permalink: item.permalink,
            thumbnail: item.thumbnail,
            seller_sku: finalSku, // Agora vai preencher corretamente
            status: item.status,
            listing_type_id: item.listing_type_id,
            sold_quantity_total: item.sold_quantity || 0, // Salva o total histórico
            // sales_last_30_days: NÃO MEXER (Deixa o SQL calcular o real)
            visits_last_30_days: visits,
            
            logistic_type: item.shipping?.logistic_type || null,
            free_shipping: item.shipping?.free_shipping || false,
            health: item.health || null,
            catalog_listing: item.catalog_listing || false,
            
            date_created: item.date_created,
            updated_at: new Date().toISOString(),
          };
        }));
        productsToUpsert.push(...items.filter(i => i !== null));
      }
    }

    if (productsToUpsert.length > 0) {
      const { error } = await supabase.from("products_snapshot").upsert(productsToUpsert, { onConflict: "item_id,user_id" });
      if (error) throw error;
    }
    
    // Recalcula o real do mês
    await supabase.rpc('update_real_sales_30d');

    return new Response(JSON.stringify({ success: true, synced: productsToUpsert.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});