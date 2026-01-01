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
} from "@/lib/api";

export default function FinanceiroContent() {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [showInstallmentDialog, setShowInstallmentDialog] = useState(false);
  const [showPayInstallmentDialog, setShowPayInstallmentDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<CashTransaction | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);

  const [transactionForm, setTransactionForm] = useState({
    type: "income" as "income" | "expense",
    category: "",
    description: "",
    amount: 0,
    paymentMethod: "pix" as "pix" | "dinheiro" | "cartao" | "transferencia" | "outro",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [installmentForm, setInstallmentForm] = useState({
    description: "",
    totalAmount: 0,
    installmentCount: 2,
    category: "mensalidade",
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

      const [transactionsData, summaryData, installmentsData] = await Promise.all([
        getCashTransactions({ startDate, endDate }),
        getCashSummary({ startDate, endDate }),
        getInstallments(),
      ]);

      setTransactions(transactionsData.transactions || []);
      setSummary(summaryData);
      setInstallments(installmentsData.installments || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

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
      type: "income",
      category: "",
      description: "",
      amount: 0,
      paymentMethod: "pix",
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
  };

  const resetInstallmentForm = () => {
    setInstallmentForm({
      description: "",
      totalAmount: 0,
      installmentCount: 2,
      category: "mensalidade",
      startDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
  };

  const openEditTransaction = (t: CashTransaction) => {
    setEditingTransaction(t);
    setTransactionForm({
      type: t.type,
      category: t.category,
      description: t.description,
      amount: t.amount / 100,
      paymentMethod: t.paymentMethod,
      date: t.date,
      notes: t.notes || "",
    });
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Controle Financeiro</h1>
            <p className="text-muted-foreground">
              Gerencie entradas, saidas e parcelamentos
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                resetInstallmentForm();
                setShowInstallmentDialog(true);
              }}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Parcelamento
            </Button>
            <Button
              onClick={() => {
                resetTransactionForm();
                setEditingTransaction(null);
                setShowTransactionDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Transacao
            </Button>
          </div>
        </div>

        {/* Month Selector */}
        <div className="flex items-center gap-4">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-56">
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
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
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
            <div className="flex gap-4">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="income">Entradas</SelectItem>
                  <SelectItem value="expense">Saidas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="" disabled className="font-bold">
                    -- Entradas --
                  </SelectItem>
                  {CASH_CATEGORIES.income.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="" disabled className="font-bold">
                    -- Saidas --
                  </SelectItem>
                  {CASH_CATEGORIES.expense.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Transactions List */}
            <Card>
              <CardHeader>
                <CardTitle>Transacoes do Mes</CardTitle>
                <CardDescription>
                  {filteredTransactions.length} transacoes encontradas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredTransactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {t.type === "income" ? (
                          <ArrowUpCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <ArrowDownCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium">{t.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {getCategoryLabel(t.category)} - {getPaymentMethodLabel(t.paymentMethod)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p
                            className={`font-bold ${
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
                        <div className="flex gap-1">
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
                        <CardTitle className="text-lg">{inst.description}</CardTitle>
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
                    type="number"
                    step="0.01"
                    min="0"
                    value={transactionForm.amount || ""}
                    onChange={(e) =>
                      setTransactionForm({
                        ...transactionForm,
                        amount: parseFloat(e.target.value) || 0,
                      })
                    }
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
              <DialogTitle>Novo Parcelamento</DialogTitle>
              <DialogDescription>
                Crie um parcelamento para receber pagamentos em parcelas
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
                    type="number"
                    step="0.01"
                    min="0"
                    value={installmentForm.totalAmount || ""}
                    onChange={(e) =>
                      setInstallmentForm({
                        ...installmentForm,
                        totalAmount: parseFloat(e.target.value) || 0,
                      })
                    }
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
                      {CASH_CATEGORIES.income.map((c) => (
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
