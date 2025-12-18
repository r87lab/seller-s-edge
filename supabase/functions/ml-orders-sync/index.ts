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

const getIsoDate = (date: Date) => date.toISOString().split('.')[0] + 'Z';

// --- FUNÇÃO DE RENOVAÇÃO DE TOKEN (Adicionada) ---
async function refreshToken(supabase: any, integration: any) {
  console.log("Renovando token de acesso...");
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
  if (!response.ok) {
    throw new Error("Falha ao renovar token: " + (data.message || "Erro desconhecido"));
  }

  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  
  // Salva o novo token no banco
  await supabase
    .from("integrations")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
    })
    .eq("id", integration.id);

  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Identificar Usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Token de usuário inválido");

    // 2. Pegar Integração
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (intError || !integration) {
      throw new Error("Integração não encontrada. Conecte sua conta novamente.");
    }

    // --- VERIFICAÇÃO E RENOVAÇÃO DO TOKEN ---
    let accessToken = integration.access_token;
    // Se faltar menos de 5 minutos para vencer, renova
    if ((integration.expires_at * 1000) - 300000 < Date.now()) {
      try {
        accessToken = await refreshToken(supabase, integration);
      } catch (e) {
        console.error("Erro ao renovar token:", e);
        // Tenta continuar mesmo assim, ou poderia parar aqui
      }
    }

    // 3. Configurar Loop de Busca (Últimos 60 dias)
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);
    const dateTo = new Date();

    console.log(`Buscando pedidos de ${getIsoDate(dateFrom)} até hoje...`);

    let allOrders: any[] = [];
    let offset = 0;
    const limit = 50;
    let keepFetching = true;

    while (keepFetching) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${integration.seller_id}&order.date_created.from=${getIsoDate(dateFrom)}&order.date_created.to=${getIsoDate(dateTo)}&sort=date_desc&limit=${limit}&offset=${offset}`;
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }, // Usa o token renovado
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Erro API ML:", data);
        // Se der erro de token inválido mesmo após renovar, paramos
        break;
      }

      const results = data.results || [];
      if (results.length > 0) {
        allOrders = [...allOrders, ...results];
        offset += limit;
        console.log(`Página processada. Total acumulado: ${allOrders.length}`);
      } else {
        keepFetching = false;
      }

      // Trava de segurança para não rodar infinito (max 3000 pedidos)
      if (allOrders.length >= 3000) keepFetching = false;
    }

    if (allOrders.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhum pedido recente encontrado", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Salvar no Banco
    const ordersToUpsert = allOrders.map((order: any) => ({
      user_id: user.id,
      ml_order_id: order.id.toString(),
      date_created: order.date_created,
      total_amount: order.total_amount,
      status: order.status,
      items: order.order_items,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("orders")
      .upsert(ordersToUpsert, { onConflict: "ml_order_id" });

    if (upsertError) {
      console.error("Erro Banco:", upsertError);
      throw new Error("Falha ao salvar pedidos no banco: " + upsertError.message);
    }

    return new Response(JSON.stringify({ success: true, count: ordersToUpsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Erro Fatal:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});