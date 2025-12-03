import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History as HistoryIcon } from "lucide-react";

interface HistoryEntry {
  id: string;
  item_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export default function History() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase
          .from("product_history")
          .select("*")
          .order("changed_at", { ascending: false })
          .limit(100);

        if (error) throw error;
        setHistory((data as HistoryEntry[]) || []);
      } catch (error: any) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const formatFieldName = (field: string) => {
    const fieldMap: Record<string, string> = {
      price: "Preço",
      title: "Título",
      status: "Status",
      strategic_action: "Ação Estratégica",
      my_notes: "Notas",
    };
    return fieldMap[field] || field;
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Alterações</h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe todas as mudanças nos seus anúncios
          </p>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          </div>
        ) : history.length > 0 ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Data</TableHead>
                  <TableHead>Item ID</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Valor Anterior</TableHead>
                  <TableHead>Novo Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((entry) => (
                  <TableRow key={entry.id} className="table-row-hover">
                    <TableCell className="text-muted-foreground">
                      {format(new Date(entry.changed_at), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{entry.item_id}</TableCell>
                    <TableCell>{formatFieldName(entry.field_changed)}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {entry.old_value || "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {entry.new_value || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <HistoryIcon className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum histórico ainda</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              As alterações nos seus anúncios aparecerão aqui automaticamente.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}