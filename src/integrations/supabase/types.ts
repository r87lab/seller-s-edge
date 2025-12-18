export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      integrations: {
        Row: {
          access_token: string
          created_at: string
          expires_at: number
          id: string
          refresh_token: string
          seller_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: number
          id?: string
          refresh_token: string
          seller_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: number
          id?: string
          refresh_token?: string
          seller_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      product_history: {
        Row: {
          changed_at: string
          field_changed: string
          id: string
          item_id: string
          new_value: string | null
          old_value: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          field_changed: string
          id?: string
          item_id: string
          new_value?: string | null
          old_value?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          field_changed?: string
          id?: string
          item_id?: string
          new_value?: string | null
          old_value?: string | null
          user_id?: string
        }
        Relationships: []
      }
      products_snapshot: {
        Row: {
          id: string
          item_id: string
          user_id: string
          title: string
          created_at: string
          updated_at: string
          // Campos Originais
          price: number | null
          permalink: string | null
          thumbnail: string | null
          seller_sku: string | null
          status: string | null
          date_created: string | null
          sales_last_30_days: number | null
          visits_last_30_days: number | null
          my_notes: string | null
          strategic_action:
            | Database["public"]["Enums"]["strategic_action"]
            | null
            
          // --- NOVOS CAMPOS ADICIONADOS ---
          sales_last_30_days_prev: number | null
          cost_price: number | null
          average_shipping_cost: number | null
          custom_tax_rate: number | null
          listing_type_id: string | null
          health: number | null
          logistic_type: string | null
        }
        Insert: {
          id?: string
          item_id: string
          user_id: string
          title: string
          created_at?: string
          updated_at?: string
          
          price?: number | null
          permalink?: string | null
          thumbnail?: string | null
          seller_sku?: string | null
          status?: string | null
          date_created?: string | null
          sales_last_30_days?: number | null
          visits_last_30_days?: number | null
          my_notes?: string | null
          strategic_action?:
            | Database["public"]["Enums"]["strategic_action"]
            | null

          // Novos campos no Insert
          sales_last_30_days_prev?: number | null
          cost_price?: number | null
          average_shipping_cost?: number | null
          custom_tax_rate?: number | null
          listing_type_id?: string | null
          health?: number | null
          logistic_type?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          user_id?: string
          title?: string
          created_at?: string
          updated_at?: string
          
          price?: number | null
          permalink?: string | null
          thumbnail?: string | null
          seller_sku?: string | null
          status?: string | null
          date_created?: string | null
          sales_last_30_days?: number | null
          visits_last_30_days?: number | null
          my_notes?: string | null
          strategic_action?:
            | Database["public"]["Enums"]["strategic_action"]
            | null

          // Novos campos no Update
          sales_last_30_days_prev?: number | null
          cost_price?: number | null
          average_shipping_cost?: number | null
          custom_tax_rate?: number | null
          listing_type_id?: string | null
          health?: number | null
          logistic_type?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      strategic_action:
        | "Analisar"
        | "Melhorar Foto"
        | "Ajustar Preço"
        | "Ativar Ads"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

// Helper para facilitar o uso dos Enums no Front-end
export const Constants = {
  public: {
    Enums: {
      strategic_action: [
        "Analisar",
        "Melhorar Foto",
        "Ajustar Preço",
        "Ativar Ads",
      ],
    },
  },
} as const