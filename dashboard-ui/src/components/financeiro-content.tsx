"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Trash2,
  Edit,
  Calendar,
  CreditCard,
  Wallet,
  Receipt,
} from "lucide-react";
import {
  getCashTransactions,
  getCashSummary,
  getCashMonthlyReport,
  createCashTransaction,
  updateCashTransaction,
  deleteCashTransaction,
  getInstallments,
  createInstallment,
  payInstallment,
  deleteInstallment,
  CashTransaction,
  CashSummary,
  Installment,
  CASH_CATEGORIES,
  PAYMENT_METHODS,
  CASH_UNITS,
} from "@/lib/api";
import { Building2 } from "lucide-react";

// Format currency input - only allows numbers and formats as currency
const formatCurrencyInput = (value: string): string => {
  // Remove tudo que não é dígito
  const numbers = value.replace(/\D/g, "");
  // Converte para número (centavos)
  const cents = parseInt(numbers || "0", 10);
  // Formata como moeda
  const formatted = (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted;
};

// Parse formatted currency to number
const parseCurrencyInput = (value: string): number => {
  // Remove pontos de milhar e troca vírgula por ponto
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

export default function FinanceiroContent() {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [summaryByUnit, setSummaryByUnit] = useState<Record<string, CashSummary>>({});
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [showInstallmentDialog, setShowInstallmentDialog] = useState(false);
  const [showPayInstallmentDialog, setShowPayInstallmentDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<CashTransaction | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);

  // Estados para valores formatados
  const [transactionAmountDisplay, setTransactionAmountDisplay] = useState("0,00");
  const [installmentAmountDisplay, setInstallmentAmountDisplay] = useState("0,00");

  const [transactionForm, setTransactionForm] = useState({
    unit: "geral" as "recreio" | "bangu" | "geral",
    type: "income" as "income" | "expense",
    category: "",
    description: "",
    amount: 0,
    paymentMethod: "pix" as "pix" | "dinheiro" | "cartao" | "transferencia" | "outro",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [installmentForm, setInstallmentForm] = useState({
    unit: "geral" as "recreio" | "bangu" | "geral",
    description: "",
    totalAmount: 0,
    installmentCount: 2,
    category: "aluguel",
    startDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [payForm, setPayForm] = useState({
    paymentMethod: "pix" as "pix" | "dinheiro" | "cartao" | "transferencia" | "outro",
    notes: "",
  });

  const fetchData = async () => {
    try {
      const startDate = `${selectedMonth}-01`;
      const [year, month] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(year!, month!, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      const unitFilter = filterUnit !== "all" ? filterUnit : undefined;

      const [transactionsData, summaryData, installmentsData] = await Promise.all([
        getCashTransactions({ unit: unitFilter, startDate, endDate }),
        getCashSummary({ unit: unitFilter, startDate, endDate }),
        getInstallments({ unit: unitFilter }),
      ]);

      // Fetch summary for each unit to show separate balances
      const unitSummaries: Record<string, CashSummary> = {};
      await Promise.all(
        CASH_UNITS.map(async (u) => {
          const unitSum = await getCashSummary({ unit: u.value, startDate, endDate });
          unitSummaries[u.value] = unitSum;
        })
      );

      setTransactions(transactionsData.transactions || []);
      setSummary(summaryData);
      setSummaryByUnit(unitSummaries);
      setInstallments(installmentsData.installments || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth, filterUnit]);

  const filteredTransactions = transactions.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    return true;
  });

  const handleSaveTransaction = async () => {
    try {
      if (!transactionForm.category || !transactionForm.description || transactionForm.amount <= 0) {
        alert("Preencha todos os campos obrigatorios");
        return;
      }

      if (editingTransaction) {
        await updateCashTransaction(editingTransaction.id, {
          ...transactionForm,
          amount: Math.round(transactionForm.amount * 100),
        });
      } else {
        await createCashTransaction({
          ...transactionForm,
          amount: transactionForm.amount, // API expects in reais, converts to cents
        });
      }
      setShowTransactionDialog(false);
      setEditingTransaction(null);
      resetTransactionForm();
      fetchData();
    } catch (error) {
      console.error("Error saving transaction:", error);
      alert("Erro ao salvar transacao");
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta transacao?")) return;
    try {
      await deleteCashTransaction(id);
      fetchData();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      alert("Erro ao excluir transacao");
    }
  };

  const handleSaveInstallment = async () => {
    try {
      if (!installmentForm.description || installmentForm.totalAmount <= 0) {
        alert("Preencha todos os campos obrigatorios");
        return;
      }

      await createInstallment({
        ...installmentForm,
        totalAmount: installmentForm.totalAmount, // API expects in reais
        status: "active",
      });
      setShowInstallmentDialog(false);
      resetInstallmentForm();
      fetchData();
    } catch (error) {
      console.error("Error saving installment:", error);
      alert("Erro ao criar parcelamento");
    }
  };

  const handlePayInstallment = async () => {
    if (!selectedInstallment) return;
    try {
      await payInstallment(selectedInstallment.id, payForm.paymentMethod, payForm.notes);
      setShowPayInstallmentDialog(false);
      setSelectedInstallment(null);
      fetchData();
    } catch (error) {
      console.error("Error paying installment:", error);
      alert("Erro ao pagar parcela");
    }
  };

  const handleCancelInstallment = async (id: number) => {
    if (!confirm("Tem certeza que deseja cancelar este parcelamento?")) return;
    try {
      await deleteInstallment(id);
      fetchData();
    } catch (error) {
      console.error("Error canceling installment:", error);
      alert("Erro ao cancelar parcelamento");
    }
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      unit: filterUnit !== "all" ? (filterUnit as "recreio" | "bangu" | "geral") : "geral",
      type: "income",
      category: "",
      description: "",
      amount: 0,
      paymentMethod: "pix",
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setTransactionAmountDisplay("0,00");
  };

  const resetInstallmentForm = () => {
    setInstallmentForm({
      unit: filterUnit !== "all" ? (filterUnit as "recreio" | "bangu" | "geral") : "geral",
      description: "",
      totalAmount: 0,
      installmentCount: 2,
      category: "aluguel",
      startDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setInstallmentAmountDisplay("0,00");
  };

  const openEditTransaction = (t: CashTransaction) => {
    setEditingTransaction(t);
    const amountInReais = t.amount / 100;
    setTransactionForm({
      unit: t.unit,
      type: t.type,
      category: t.category,
      description: t.description,
      amount: amountInReais,
      paymentMethod: t.paymentMethod,
      date: t.date,
      notes: t.notes || "",
    });
    setTransactionAmountDisplay(amountInReais.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setShowTransactionDialog(true);
  };

  const openPayInstallment = (installment: Installment) => {
    setSelectedInstallment(installment);
    setPayForm({ paymentMethod: "pix", notes: "" });
    setShowPayInstallmentDialog(true);
  };

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const getCategoryLabel = (category: string) => {
    const allCategories = [...CASH_CATEGORIES.income, ...CASH_CATEGORIES.expense];
    return allCategories.find((c) => c.value === category)?.label || category;
  };

  const getPaymentMethodLabel = (method: string) => {
    return PAYMENT_METHODS.find((m) => m.value === method)?.label || method;
  };

  const getUnitLabel = (unit: string) => {
    return CASH_UNITS.find((u) => u.value === unit)?.label || unit;
  };

  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      options.push({ value, label });
    }
    return options;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Controle Financeiro</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Gerencie entradas, saidas e parcelamentos
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => {
                resetInstallmentForm();
                setShowInstallmentDialog(true);
              }}
            >
              <CreditCard className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Parcelamento</span>
            </Button>
            <Button
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => {
                resetTransactionForm();
                setEditingTransaction(null);
                setShowTransactionDialog(true);
              }}
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Nova Transacao</span>
              <span className="sm:hidden">Nova</span>
            </Button>
          </div>
        </div>

        {/* Month and Unit Selectors */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Selecione o mes" />
            </SelectTrigger>
            <SelectContent>
              {generateMonthOptions().map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger className="w-full sm:w-44">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Unidades</SelectItem>
              {CASH_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entradas</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(summary?.totalIncome || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saidas</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(summary?.totalExpense || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  (summary?.balance || 0) >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatCurrency(summary?.balance || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transacoes</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{transactions.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Unit Balances - Only show when viewing all units */}
        {filterUnit === "all" && (
          <div className="grid gap-4 md:grid-cols-3">
            {CASH_UNITS.map((unit) => {
              const unitSum = summaryByUnit[unit.value];
              const balance = unitSum?.balance || 0;
              return (
                <Card key={unit.value}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Caixa {unit.label}
                    </CardTitle>
                    <DollarSign className={`h-4 w-4 ${balance >= 0 ? "text-green-500" : "text-red-500"}`} />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(balance)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      +{formatCurrency(unitSum?.totalIncome || 0)} / -{formatCurrency(unitSum?.totalExpense || 0)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Tabs defaultValue="transactions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="transactions">Transacoes</TabsTrigger>
            <TabsTrigger value="installments">
              Parcelamentos ({installments.filter((i) => i.status === "active").length})
            </TabsTrigger>
            <TabsTrigger value="categories">Por Categoria</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="income">Entradas</SelectItem>
                  <SelectItem value="expense">Saidas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {CASH_CATEGORIES.income.map((c) => (
                    <SelectItem key={`income-${c.value}`} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                  {CASH_CATEGORIES.expense.map((c) => (
                    <SelectItem key={`expense-${c.value}`} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Transactions List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">Transacoes do Mes</CardTitle>
                <CardDescription>
                  {filteredTransactions.length} transacoes encontradas
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                <div className="space-y-3">
                  {filteredTransactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {t.type === "income" ? (
                          <ArrowUpCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <ArrowDownCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium truncate">{t.description}</p>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {getUnitLabel(t.unit)}
                            </Badge>
                          </div>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {getCategoryLabel(t.category)} - {getPaymentMethodLabel(t.paymentMethod)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 ml-8 sm:ml-0">
                        <div className="text-right">
                          <p
                            className={`font-bold text-sm sm:text-base ${
                              t.type === "income" ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {t.type === "income" ? "+" : "-"}
                            {formatCurrency(t.amount)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(t.date).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditTransaction(t)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTransaction(t.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma transacao encontrada
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="installments" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {installments.map((inst) => (
                <Card key={inst.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{inst.description}</CardTitle>
                          <Badge variant="outline" className="text-xs">
                            {getUnitLabel(inst.unit)}
                          </Badge>
                        </div>
                        <CardDescription>
                          {getCategoryLabel(inst.category)}
                        </CardDescription>
                      </div>
                      <Badge
                        className={
                          inst.status === "active"
                            ? "bg-blue-100 text-blue-800"
                            : inst.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }
                      >
                        {inst.status === "active"
                          ? "Ativo"
                          : inst.status === "completed"
                          ? "Completo"
                          : "Cancelado"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Valor Total:</span>
                        <span className="font-medium">{formatCurrency(inst.totalAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Parcelas:</span>
                        <span className="font-medium">
                          {inst.paidCount} / {inst.installmentCount}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Valor Parcela:</span>
                        <span className="font-medium">
                          {formatCurrency(Math.round(inst.totalAmount / inst.installmentCount))}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{
                            width: `${(inst.paidCount / inst.installmentCount) * 100}%`,
                          }}
                        />
                      </div>
                      {inst.status === "active" && (
                        <div className="flex gap-2 mt-4">
                          <Button
                            className="flex-1"
                            size="sm"
                            onClick={() => openPayInstallment(inst)}
                          >
                            <Wallet className="h-4 w-4 mr-1" />
                            Pagar Parcela
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelInstallment(inst.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {installments.length === 0 && (
                <Card className="col-span-full">
                  <CardContent className="py-8">
                    <p className="text-center text-muted-foreground">
                      Nenhum parcelamento encontrado
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Resumo por Categoria</CardTitle>
                <CardDescription>Entradas e saidas por categoria no mes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(summary?.byCategory || {}).map(([category, values]) => (
                    <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">{getCategoryLabel(category)}</span>
                      <div className="flex gap-4">
                        {values.income > 0 && (
                          <span className="text-green-600">+{formatCurrency(values.income)}</span>
                        )}
                        {values.expense > 0 && (
                          <span className="text-red-600">-{formatCurrency(values.expense)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {Object.keys(summary?.byCategory || {}).length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma categoria encontrada
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Transaction Dialog */}
        <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTransaction ? "Editar Transacao" : "Nova Transacao"}
              </DialogTitle>
              <DialogDescription>Registre uma entrada ou saida</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select
                  value={transactionForm.unit}
                  onValueChange={(v) =>
                    setTransactionForm({
                      ...transactionForm,
                      unit: v as "recreio" | "bangu" | "geral",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CASH_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={transactionForm.type}
                    onValueChange={(v) =>
                      setTransactionForm({
                        ...transactionForm,
                        type: v as "income" | "expense",
                        category: "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className="h-4 w-4 text-green-500" />
                          Entrada
                        </div>
                      </SelectItem>
                      <SelectItem value="expense">
                        <div className="flex items-center gap-2">
                          <ArrowDownCircle className="h-4 w-4 text-red-500" />
                          Saida
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={transactionForm.category}
                    onValueChange={(v) =>
                      setTransactionForm({ ...transactionForm, category: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CASH_CATEGORIES[transactionForm.type].map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descricao</Label>
                <Input
                  value={transactionForm.description}
                  onChange={(e) =>
                    setTransactionForm({ ...transactionForm, description: e.target.value })
                  }
                  placeholder="Descricao da transacao"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={transactionAmountDisplay}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setTransactionAmountDisplay(formatted);
                      setTransactionForm({
                        ...transactionForm,
                        amount: parseCurrencyInput(formatted),
                      });
                    }}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forma de Pagamento</Label>
                  <Select
                    value={transactionForm.paymentMethod}
                    onValueChange={(v) =>
                      setTransactionForm({
                        ...transactionForm,
                        paymentMethod: v as typeof transactionForm.paymentMethod,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) =>
                    setTransactionForm({ ...transactionForm, date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Observacoes</Label>
                <Input
                  value={transactionForm.notes}
                  onChange={(e) =>
                    setTransactionForm({ ...transactionForm, notes: e.target.value })
                  }
                  placeholder="Opcional"
                />
              </div>
              <Button onClick={handleSaveTransaction} className="w-full">
                {editingTransaction ? "Salvar Alteracoes" : "Registrar Transacao"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Installment Dialog */}
        <Dialog open={showInstallmentDialog} onOpenChange={setShowInstallmentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Parcelamento de Despesa</DialogTitle>
              <DialogDescription>
                Crie um parcelamento para pagar despesas em parcelas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select
                  value={installmentForm.unit}
                  onValueChange={(v) =>
                    setInstallmentForm({
                      ...installmentForm,
                      unit: v as "recreio" | "bangu" | "geral",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CASH_UNITS.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descricao</Label>
                <Input
                  value={installmentForm.description}
                  onChange={(e) =>
                    setInstallmentForm({ ...installmentForm, description: e.target.value })
                  }
                  placeholder="Ex: Equipamento novo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Total (R$)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={installmentAmountDisplay}
                    onChange={(e) => {
                      const formatted = formatCurrencyInput(e.target.value);
                      setInstallmentAmountDisplay(formatted);
                      setInstallmentForm({
                        ...installmentForm,
                        totalAmount: parseCurrencyInput(formatted),
                      });
                    }}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Numero de Parcelas</Label>
                  <Input
                    type="number"
                    min="2"
                    max="48"
                    value={installmentForm.installmentCount}
                    onChange={(e) =>
                      setInstallmentForm({
                        ...installmentForm,
                        installmentCount: parseInt(e.target.value) || 2,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={installmentForm.category}
                    onValueChange={(v) =>
                      setInstallmentForm({ ...installmentForm, category: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CASH_CATEGORIES.expense.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data Inicio</Label>
                  <Input
                    type="date"
                    value={installmentForm.startDate}
                    onChange={(e) =>
                      setInstallmentForm({ ...installmentForm, startDate: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observacoes</Label>
                <Input
                  value={installmentForm.notes}
                  onChange={(e) =>
                    setInstallmentForm({ ...installmentForm, notes: e.target.value })
                  }
                  placeholder="Opcional"
                />
              </div>
              {installmentForm.totalAmount > 0 && installmentForm.installmentCount >= 2 && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm">
                    Valor de cada parcela:{" "}
                    <strong>
                      {(installmentForm.totalAmount / installmentForm.installmentCount).toLocaleString(
                        "pt-BR",
                        { style: "currency", currency: "BRL" }
                      )}
                    </strong>
                  </p>
                </div>
              )}
              <Button onClick={handleSaveInstallment} className="w-full">
                Criar Parcelamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Pay Installment Dialog */}
        <Dialog open={showPayInstallmentDialog} onOpenChange={setShowPayInstallmentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pagar Parcela</DialogTitle>
              <DialogDescription>
                {selectedInstallment?.description} - Parcela{" "}
                {(selectedInstallment?.paidCount || 0) + 1} de{" "}
                {selectedInstallment?.installmentCount}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Valor da Parcela</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    Math.round(
                      (selectedInstallment?.totalAmount || 0) /
                        (selectedInstallment?.installmentCount || 1)
                    )
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select
                  value={payForm.paymentMethod}
                  onValueChange={(v) =>
                    setPayForm({ ...payForm, paymentMethod: v as typeof payForm.paymentMethod })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observacoes</Label>
                <Input
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <Button onClick={handlePayInstallment} className="w-full">
                Confirmar Pagamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
