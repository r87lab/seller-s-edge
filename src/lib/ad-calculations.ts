import { differenceInDays } from "date-fns";

// --- TIPAGEM ---
interface FinancialInput {
  price: number;
  sales_last_30_days: number;
  visits_last_30_days: number;
  cost_price?: number;
  listing_type_id?: string;
  custom_tax_rate?: number;
  average_shipping_cost?: number;
}

interface DiagnosisInput {
  price: number;
  visits: number;
  sales: number;
  sales_prev: number;
  marginPercent: number;
  date_created: string | null;
  logistic_type?: string;
  health?: number;
}

// --- CÁLCULOS BÁSICOS ---

export const calculateConversion = (sales: number, visits: number) => {
  if (visits === 0) return 0;
  return (sales / visits) * 100;
};

export const calculateFinancials = (product: FinancialInput) => {
  const price = Number(product.price) || 0;
  const sales = Number(product.sales_last_30_days) || 0;
  const visits = Number(product.visits_last_30_days) || 0;
  const cost = Number(product.cost_price) || 0;
  const shipping = Number(product.average_shipping_cost) || 0; 
  
  const revenue = price * sales;
  
  // --- 1. CÁLCULO DE COMISSÃO (ML FEE) ---
  // gold_pro = Premium (aprox 18%) | gold_special = Clássico (aprox 11-13%)
  let taxRate = 0.12; // Média Clássico padrão
  
  if (product.listing_type_id === 'gold_pro') {
    taxRate = 0.18; // Média Premium
  } else if (product.listing_type_id === 'gold_special') {
    taxRate = 0.12; 
  }
  
  const mlFee = price * taxRate;
  
  // --- 2. TAXA FIXA (Para produtos abaixo de R$ 79) ---
  // Nota: Isso pode variar por categoria/peso, mas R$ 6.00 é a regra geral
  let fixedFee = 0;
  if (price < 79) {
    fixedFee = 6.00;
  }
  
  // --- 3. IMPOSTOS (SIMPLES NACIONAL) ---
  // Prioriza o valor do banco. Se for 0 ou null, usa fallback de 6% (estimativa segura)
  let taxPercent = 0.06; 
  if (product.custom_tax_rate !== undefined && product.custom_tax_rate !== null) {
      // Se vier 4 (inteiro), divide por 100. Se vier 0.04 (decimal), mantém.
      // Se vier 0 exato, assumimos que o usuário quer 0% (ex: MEI) ou não configurou.
      // Para segurança, se for 0, mantemos o fallback OU aceitamos 0 se você for MEI.
      // AQUI: Vou assumir que se for > 0 usa o valor, se for 0 usa 6%.
      if (product.custom_tax_rate > 0) {
        taxPercent = product.custom_tax_rate > 1 ? product.custom_tax_rate / 100 : product.custom_tax_rate;
      }
  }
  const taxes = price * taxPercent;

  // --- 4. CUSTO TOTAL UNITÁRIO ---
  // Custo Produto + Comissão ML + Taxa Fixa ML + Imposto Gov + Frete Grátis (se houver)
  const totalCostPerUnit = cost + mlFee + fixedFee + taxes + shipping;
  
  // --- 5. RESULTADOS ---
  const marginPerUnit = price - totalCostPerUnit;
  const totalMargin = marginPerUnit * sales; // Lucro Bruto total no período
  
  // Margem Percentual Real
  const marginPercent = price > 0 ? (marginPerUnit / price) * 100 : 0;
  
  // ROAS (Estimado - Mantivemos separado para não sujar a margem)
  // Se não temos o AdSpend real, assumimos 0 para não inventar prejuízo
  // Se quiser simular, use: const estimatedAdSpend = visits * 0.10;
  const estimatedAdSpend = 0; 
  const roas = estimatedAdSpend > 0 ? revenue / estimatedAdSpend : 0;

  return {
    revenue,
    mlFee,
    taxes,
    totalCostPerUnit,
    marginPercent, // Usado nos cards
    totalMargin,
    taxRateUsed: (taxPercent * 100).toFixed(1)
  };
};

// --- INTELIGÊNCIA DE DIAGNÓSTICO ---

export const getSmartDiagnosis = (product: DiagnosisInput) => {
  const conversion = calculateConversion(product.sales, product.visits);
  const daysActive = product.date_created ? differenceInDays(new Date(), new Date(product.date_created)) : 0;
  const health = product.health || 0; // 0 a 1

  // Cálculo de Crescimento
  const growth = product.sales_prev > 0 
    ? ((product.sales - product.sales_prev) / product.sales_prev) * 100 
    : (product.sales > 0 ? 100 : 0);

  // --- REGRAS DE DIAGNÓSTICO (Prioridade do Topo para Baixo) ---

  // 1. Saúde Crítica (Ficha técnica incompleta ou ruim)
  if (health > 0 && health < 0.60) {
    return { 
      label: "Saúde Crítica", 
      action: "Arrumar Ficha", 
      color: "text-red-600 bg-red-50 border-red-100", 
      icon: "alert" 
    };
  }

  // 2. Em Queda (Queda brusca > 40%)
  if (product.sales_prev > 5 && growth < -40) {
    return { 
      label: "Em Queda", 
      action: "Rever Preço", 
      color: "text-red-700 bg-red-100 border-red-200", 
      icon: "trend-down" 
    };
  }

  // 3. Zumbi (Ativo há 2 meses, com tráfego mas sem vendas)
  if (daysActive > 60 && product.visits > 30 && product.sales === 0) {
    return { 
      label: "Zumbi", 
      action: "Pausar/Recriar", 
      color: "text-gray-600 bg-gray-100 border-gray-200", 
      icon: "skull" 
    };
  }

  // 4. Margem Baixa (Vendendo, mas lucro < 8%)
  // Cuidado: Só mostramos isso se houver vendas, para não alarmar produtos parados
  if (product.sales > 0 && product.marginPercent < 8) {
    return { 
      label: "Margem Baixa", 
      action: "Aumentar Preço", 
      color: "text-amber-700 bg-amber-100 border-amber-200", 
      icon: "wallet" 
    };
  }

  // 5. Baixa Conversão (Muita visita, pouca venda)
  // Ex: 300 visitas e converte menos de 0.5%
  if (product.visits > 300 && conversion < 0.5) {
    return { 
      label: "Baixa Conversão", 
      action: "Melhorar Fotos", 
      color: "text-orange-600 bg-orange-100 border-orange-200", 
      icon: "search" 
    };
  }

  // 6. Potencial (Converte bem > 2%, mas tem pouca visita)
  if (conversion > 2.0 && product.visits < 400 && product.sales > 0) {
    return { 
      label: "Potencial", 
      action: "Ativar Ads", 
      color: "text-purple-600 bg-purple-100 border-purple-200", 
      icon: "rocket" 
    };
  }

  // 7. Gargalo Logístico (Vende muito e não está no Full)
  if (product.sales > 15 && product.logistic_type !== 'fulfillment') {
    return { 
      label: "Gargalo Logístico", 
      action: "Enviar p/ Full", 
      color: "text-indigo-600 bg-indigo-100 border-indigo-200", 
      icon: "truck" 
    };
  }

  // 8. Crescendo (Vendas subindo > 20%)
  if (growth > 20 && product.sales > 5) {
    return { 
      label: "Crescendo", 
      action: "Repor Estoque", 
      color: "text-emerald-700 bg-emerald-100 border-emerald-200", 
      icon: "trend-up" 
    };
  }

  // Default
  return { 
    label: "Estável", 
    action: "Monitorar", 
    color: "text-slate-600 bg-slate-50 border-slate-100", 
    icon: "check" 
  };
};