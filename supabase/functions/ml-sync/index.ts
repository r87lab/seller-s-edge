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
  console.log("Refreshing access token...");

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
    throw new Error("Failed to refresh token: " + data.message);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Invalid user token");
    }

    // Get integration
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (integrationError || !integration) {
      throw new Error("Integration not found. Please connect your Mercado Livre account.");
    }

    // Check if token is expired and refresh if needed
    let accessToken = integration.access_token;
    if (integration.expires_at * 1000 < Date.now()) {
      accessToken = await refreshToken(supabase, integration);
    }

    console.log("Fetching items from ML...");

    // Fetch user items from ML
    const itemsResponse = await fetch(
      `https://api.mercadolibre.com/users/${integration.seller_id}/items/search?status=active&limit=50`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const itemsData = await itemsResponse.json();

    if (!itemsResponse.ok) {
      console.error("Items fetch error:", itemsData);
      throw new Error("Failed to fetch items from Mercado Livre");
    }

    console.log(`Found ${itemsData.results?.length || 0} items`);

    if (!itemsData.results || itemsData.results.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: "No active items found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch details for each item
    const itemIds = itemsData.results.join(",");
    const detailsResponse = await fetch(
      `https://api.mercadolibre.com/items?ids=${itemIds}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const detailsData = await detailsResponse.json();

    // Process and upsert items
    const products = [];
    for (const item of detailsData) {
      if (item.code !== 200) continue;

      const body = item.body;

      // Fetch visits for this item
      let visits = 0;
      try {
        const visitsResponse = await fetch(
          `https://api.mercadolibre.com/items/${body.id}/visits/time_window?last=30&unit=day`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const visitsData = await visitsResponse.json();
        visits = visitsData.total_visits || 0;
      } catch (e) {
        console.log(`Failed to fetch visits for ${body.id}:`, e);
      }

      products.push({
        item_id: body.id,
        user_id: user.id,
        title: body.title,
        price: body.price,
        permalink: body.permalink,
        thumbnail: body.thumbnail,
        seller_sku: body.seller_custom_field || null,
        status: body.status,
        visits_last_30_days: visits,
        sales_last_30_days: body.sold_quantity || 0,
        date_created: body.date_created,
      });
    }

    // Upsert products
    const { error: upsertError } = await supabase.from("products_snapshot").upsert(products, {
      onConflict: "item_id,user_id",
    });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw new Error("Failed to save products");
    }

    console.log(`Successfully synced ${products.length} products`);

    return new Response(JSON.stringify({ synced: products.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("ML Sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});