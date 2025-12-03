import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { User as UserIcon, Lock, Save } from "lucide-react";

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Senha atualizada com sucesso!" });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error: any) {
      toast({ title: "Erro ao atualizar senha", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground mt-1">Gerencie sua conta e preferências</p>
        </div>

        {/* Account Info */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <UserIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Informações da Conta</h2>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <p className="mt-1 font-medium">{user?.email}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Conta criada em</Label>
              <p className="mt-1 font-medium">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString("pt-BR")
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <form onSubmit={handlePasswordChange} className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Alterar Senha</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-background"
                minLength={6}
              />
            </div>
            <Button type="submit" disabled={loading || !newPassword} className="btn-sync">
              <Save className="w-4 h-4" />
              {loading ? "Salvando..." : "Salvar Nova Senha"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}