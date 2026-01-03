"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  CreditCard,
  Smartphone,
  Calendar,
  Phone,
  Mail,
  Building2,
  Cake,
} from "lucide-react";
import {
  getUnifiedStudents,
  getUnifiedStudentsSummary,
  createUnifiedStudent,
  updateUnifiedStudent,
  deleteUnifiedStudent,
  UnifiedStudent,
  UnifiedStudentSummary,
  PLATFORMS,
  PLANS,
  PAYMENT_TYPES,
  getUnits,
  Unit,
} from "@/lib/api";

// Format phone number
const formatPhone = (value: string): string => {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  if (numbers.length <= 11) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
};

// Format currency
const formatCurrency = (cents: number): string => {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

// Format currency input
const formatCurrencyInput = (value: string): string => {
  const numbers = value.replace(/\D/g, "");
  const cents = parseInt(numbers || "0", 10);
  const formatted = (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted;
};

const parseCurrencyInput = (value: string): number => {
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
};

const DEFAULT_STUDENT: Omit<UnifiedStudent, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  phone: "",
  email: "",
  birthDate: "",
  unit: "recreio",
  paymentType: "mensalidade",
  plan: "2x",
  planValue: 0,
  dueDay: 10,
  startDate: new Date().toISOString().split("T")[0],
  platform: undefined,
  balance: 0,
  status: "active",
  notes: "",
};

export default function AlunosContent() {
  const [students, setStudents] = useState<UnifiedStudent[]>([]);
  const [summary, setSummary] = useState<UnifiedStudentSummary | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterPaymentType, setFilterPaymentType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingStudent, setEditingStudent] = useState<UnifiedStudent | null>(null);
  const [formData, setFormData] = useState(DEFAULT_STUDENT);
  const [planValueDisplay, setPlanValueDisplay] = useState("0,00");

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<UnifiedStudent | null>(null);

  const fetchData = async () => {
    try {
      const [studentsData, summaryData, unitsData] = await Promise.all([
        getUnifiedStudents({
          unit: filterUnit !== "all" ? filterUnit : undefined,
          paymentType: filterPaymentType !== "all" ? filterPaymentType : undefined,
          status: filterStatus !== "all" ? filterStatus : undefined,
          search: searchQuery || undefined,
        }),
        getUnifiedStudentsSummary(),
        getUnits(),
      ]);
      setStudents(studentsData);
      setSummary(summaryData);
      setUnits(unitsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterUnit, filterPaymentType, filterStatus, searchQuery]);

  const openNewDialog = () => {
    setEditingStudent(null);
    setFormData(DEFAULT_STUDENT);
    setPlanValueDisplay("0,00");
    setShowDialog(true);
  };

  const openEditDialog = (student: UnifiedStudent) => {
    setEditingStudent(student);
    const planValueInReais = (student.planValue || 0) / 100;
    setFormData({
      name: student.name,
      phone: student.phone,
      email: student.email || "",
      birthDate: student.birthDate || "",
      unit: student.unit,
      paymentType: student.paymentType,
      plan: student.plan || "2x",
      planValue: student.planValue || 0,
      dueDay: student.dueDay || 10,
      startDate: student.startDate || "",
      platform: student.platform,
      balance: student.balance || 0,
      status: student.status,
      notes: student.notes || "",
    });
    setPlanValueDisplay(planValueInReais.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setShowDialog(true);
  };

  const handleSave = async () => {
    try {
      const dataToSend = {
        ...formData,
        planValue: formData.paymentType === "mensalidade" ? parseCurrencyInput(planValueDisplay) : undefined,
        platform: formData.paymentType === "plataforma" ? formData.platform : undefined,
        plan: formData.paymentType === "mensalidade" ? formData.plan : undefined,
        dueDay: formData.paymentType === "mensalidade" ? formData.dueDay : undefined,
      };

      if (editingStudent) {
        await updateUnifiedStudent(editingStudent.id, dataToSend);
      } else {
        await createUnifiedStudent(dataToSend);
      }
      setShowDialog(false);
      fetchData();
    } catch (error) {
      console.error("Error saving student:", error);
      alert("Erro ao salvar aluno");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteUnifiedStudent(deleteConfirm.id);
      setDeleteConfirm(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting student:", error);
      alert("Erro ao remover aluno");
    }
  };

  const handleToggleStatus = async (student: UnifiedStudent) => {
    try {
      const newStatus = student.status === "active" ? "inactive" : "active";
      await updateUnifiedStudent(student.id, { status: newStatus });
      fetchData();
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Ativo</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inativo</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspenso</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPaymentTypeBadge = (paymentType: string) => {
    if (paymentType === "mensalidade") {
      return <Badge variant="outline" className="border-blue-500 text-blue-500"><CreditCard className="h-3 w-3 mr-1" />Mensalidade</Badge>;
    }
    return <Badge variant="outline" className="border-purple-500 text-purple-500"><Smartphone className="h-3 w-3 mr-1" />Plataforma</Badge>;
  };

  const getPlatformLabel = (platform?: string) => {
    const found = PLATFORMS.find(p => p.value === platform);
    return found?.label || platform || "-";
  };

  const getPlanLabel = (plan?: string) => {
    const found = PLANS.find(p => p.value === plan);
    return found?.label || plan || "-";
  };

  if (loading) {
    return (
      <DashboardLayout title="Alunos">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Alunos">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">Gestao de Alunos</h2>
            <p className="text-sm text-muted-foreground">
              Gerencie todos os alunos em um unico lugar
            </p>
          </div>
          <Button onClick={openNewDialog} size="sm">
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo Aluno</span>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Total</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{summary?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {summary?.active || 0} ativos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Mensalidade</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-blue-500">{summary?.mensalidade || 0}</div>
              <p className="text-xs text-muted-foreground">
                alunos mensalistas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Plataforma</CardTitle>
              <Smartphone className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-purple-500">{summary?.plataforma || 0}</div>
              <p className="text-xs text-muted-foreground">
                Wellhub, TotalPass, etc
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Por Unidade</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                {Object.entries(summary?.byUnit || {}).map(([unitSlug, count]) => (
                  <div key={unitSlug}>
                    <div className="text-sm font-bold">{count}</div>
                    <p className="text-xs text-muted-foreground capitalize">{unitSlug}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou telefone..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Unidades</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.slug}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPaymentType} onValueChange={setFilterPaymentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="mensalidade">Mensalidade</SelectItem>
                  <SelectItem value="plataforma">Plataforma</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                  <SelectItem value="suspended">Suspensos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Students List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Lista de Alunos ({students.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum aluno encontrado
              </div>
            ) : (
              <div className="space-y-3">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border rounded-lg gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium truncate">{student.name}</span>
                        {getStatusBadge(student.status)}
                        {getPaymentTypeBadge(student.paymentType)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {student.phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {student.unit.charAt(0).toUpperCase() + student.unit.slice(1)}
                        </span>
                        {student.paymentType === "mensalidade" && (
                          <>
                            <span>{getPlanLabel(student.plan)}</span>
                            <span>{formatCurrency(student.planValue || 0)}</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Dia {student.dueDay}
                            </span>
                          </>
                        )}
                        {student.paymentType === "plataforma" && (
                          <span>{getPlatformLabel(student.platform)}</span>
                        )}
                        {student.birthDate && (
                          <span className="flex items-center gap-1">
                            <Cake className="h-3 w-3" />
                            {new Date(student.birthDate).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(student)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleStatus(student)}>
                          {student.status === "active" ? (
                            <>
                              <UserX className="h-4 w-4 mr-2" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteConfirm(student)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStudent ? "Editar Aluno" : "Novo Aluno"}</DialogTitle>
            <DialogDescription>
              {editingStudent ? "Atualize os dados do aluno" : "Preencha os dados do novo aluno"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {/* Basic Info */}
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                  placeholder="(21) 99999-9999"
                  maxLength={16}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="birthDate">Data de Nascimento</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unidade *</Label>
                <Select
                  value={formData.unit}
                  onValueChange={(v) => {
                    setFormData({ ...formData, unit: v as "recreio" | "bangu" });
                    // Atualizar valor quando trocar de unidade
                    const selectedUnit = units.find(u => u.slug === v);
                    if (selectedUnit && formData.plan) {
                      const priceInfo = selectedUnit.prices?.mensalidade?.find(
                        p => p.frequencia.toLowerCase().includes(formData.plan || "")
                      );
                      if (priceInfo) {
                        const value = parseFloat(priceInfo.valor.replace("R$", "").replace(".", "").replace(",", ".").trim()) || 0;
                        setPlanValueDisplay(value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.slug}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Payment Type */}
            <div className="space-y-2">
              <Label htmlFor="paymentType">Tipo de Pagamento *</Label>
              <Select
                value={formData.paymentType}
                onValueChange={(v) => setFormData({ ...formData, paymentType: v as "mensalidade" | "plataforma" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mensalidade Fields */}
            {formData.paymentType === "mensalidade" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="plan">Plano *</Label>
                    <Select
                      value={formData.plan}
                      onValueChange={(v) => {
                        setFormData({ ...formData, plan: v });
                        // Auto-preencher valor baseado na unidade selecionada
                        const selectedUnit = units.find(u => u.slug === formData.unit);
                        if (selectedUnit) {
                          const priceInfo = selectedUnit.prices?.mensalidade?.find(
                            p => p.frequencia.toLowerCase().includes(v)
                          );
                          if (priceInfo) {
                            const value = parseFloat(priceInfo.valor.replace("R$", "").replace(".", "").replace(",", ".").trim()) || 0;
                            setPlanValueDisplay(value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                          }
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const selectedUnit = units.find(u => u.slug === formData.unit);
                          const unitPrices = selectedUnit?.prices?.mensalidade || [];

                          return PLANS.map((plan) => {
                            const priceInfo = unitPrices.find(p =>
                              p.frequencia.toLowerCase().includes(plan.value)
                            );
                            const priceLabel = priceInfo ? ` - ${priceInfo.valor}` : "";
                            return (
                              <SelectItem key={plan.value} value={plan.value}>
                                {plan.label}{priceLabel}
                              </SelectItem>
                            );
                          });
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="planValue">Valor Mensal (R$) *</Label>
                    <Input
                      id="planValue"
                      type="text"
                      inputMode="numeric"
                      value={planValueDisplay}
                      onChange={(e) => {
                        const formatted = formatCurrencyInput(e.target.value);
                        setPlanValueDisplay(formatted);
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dueDay">Dia do Vencimento *</Label>
                    <Input
                      id="dueDay"
                      type="number"
                      min="1"
                      max="31"
                      value={formData.dueDay}
                      onChange={(e) => setFormData({ ...formData, dueDay: parseInt(e.target.value) || 10 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Data de Inicio</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Platform Fields */}
            {formData.paymentType === "plataforma" && (
              <div className="space-y-2">
                <Label htmlFor="platform">Plataforma *</Label>
                <Select
                  value={formData.platform}
                  onValueChange={(v) => setFormData({ ...formData, platform: v as "wellhub" | "totalpass" | "gurupass" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((platform) => (
                      <SelectItem key={platform.value} value={platform.value}>
                        {platform.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v as "active" | "inactive" | "suspended" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observacoes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Observacoes sobre o aluno..."
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingStudent ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover aluno?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover {deleteConfirm?.name}? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
