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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the user from the auth header
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

    // ATUALIZAÇÃO: Adicionamos ids e accessToken na desestruturação
    const { action, code, redirectUri, ids, accessToken } = await req.json();
    console.log(`ML Auth action: ${action}`);

    // --- AÇÃO 1: LOGIN ---
    if (action === "login") {
      const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}`;

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- AÇÃO 2: CALLBACK (Troca de token) ---
    if (action === "callback") {
      console.log("Exchanging code for tokens...");

      const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: ML_APP_ID!,
          client_secret: ML_CLIENT_SECRET!,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();
      console.log("Token response status:", tokenResponse.status);

      if (!tokenResponse.ok) {
        console.error("Token error:", tokenData);
        throw new Error(tokenData.message || "Failed to get access token");
      }

      const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

      // Save integration to database
      const { error: upsertError } = await supabase.from("integrations").upsert(
        {
          user_id: user.id,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: expiresAt,
          seller_id: tokenData.user_id?.toString(),
        },
        { onConflict: "user_id" }
      );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        throw new Error("Failed to save integration");
      }

      console.log("Integration saved successfully");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- AÇÃO 3: CHECK ITEMS (A NOVA FUNCIONALIDADE PARA CORRIGIR O CORS) ---
    if (action === "check_items") {
        if (!ids || !accessToken) {
            throw new Error("Missing required params: ids or accessToken");
        }

        // Fazemos a chamada aqui no servidor (Deno), onde não existe CORS
        const mlResponse = await fetch(`https://api.mercadolibre.com/items?ids=${ids}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        });

        const mlData = await mlResponse.json();

        // Devolvemos a resposta do ML para o seu Frontend
        return new Response(JSON.stringify(mlData), {
            status: mlResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    throw new Error("Invalid action");

  } catch (error: unknown) {
    console.error("ML Auth error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});