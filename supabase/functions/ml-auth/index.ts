import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action, code, redirectUri, accessToken, sellerId, limit, offset } = body;
    const rawIds = body.ids || body.orderIds;

    // 1. LOGIN (SIMPLES - AS PERMISSÕES VÊM DO PAINEL DO ML)
    if (action === "login") {
      const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${Deno.env.get("ML_APP_ID")}&redirect_uri=${encodeURIComponent(redirectUri)}`;
      return new Response(JSON.stringify({ authUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. CALLBACK
    if (action === "callback") {
      const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: Deno.env.get("ML_APP_ID")!,
          client_secret: Deno.env.get("ML_CLIENT_SECRET")!,
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.message || "Token error");

      const authHeader = req.headers.get("Authorization");
      const userReq = await supabase.auth.getUser(authHeader?.replace("Bearer ", "") || "");
      if (userReq.data.user) {
         await supabase.from("integrations").upsert({
            user_id: userReq.data.user.id,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + tokenData.expires_in,
            seller_id: tokenData.user_id?.toString(),
         }, { onConflict: "user_id" });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. GET SALES (Lista Rápida)
    if (action === "get_sales") {
        const searchLimit = limit ? Math.min(Number(limit), 500) : 50;
        const searchOffset = offset ? Number(offset) : 0;
        const mlResponse = await fetch(
            `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&limit=${searchLimit}&offset=${searchOffset}`, 
            { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        const data = await mlResponse.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. GET ORDERS DETAILED (A SOLUÇÃO DO PROBLEMA)
    // Busca cada pedido individualmente para garantir que venha shipping.base_cost e marketplace_fee
    if (action === "get_orders_detailed") {
        if (!rawIds) throw new Error("IDs ausentes");

        // Transforma string "123,456" em array ["123", "456"]
        const idsArray = String(rawIds).split(',').map(id => id.trim()).filter(id => id);
        
        console.log(`[ML-AUTH] Buscando detalhes individuais para ${idsArray.length} pedidos...`);

        // Dispara todas as requisições em paralelo (Metralhadora de fetch)
        // Isso é muito rápido no servidor Edge
        const promises = idsArray.map(async (id) => {
            const res = await fetch(`https://api.mercadolibre.com/orders/${id}`, {
                headers: { "Authorization": `Bearer ${accessToken}` }
            });
            return res.json();
        });

        const results = await Promise.all(promises);
        
        // Retorna o array de pedidos completos
        return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Invalid action");

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});