"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  CreditCard,
  Plus,
  Users,
  DollarSign,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  Trash2,
  Edit,
  Send,
  Calendar,
  CheckCircle,
} from "lucide-react";
import {
  getStudentsWithStatus,
  createStudent,
  updateStudent,
  deleteStudent,
  createPayment,
  sendBillingReminder,
  sendBulkReminders,
  getBillingConfig,
  updateBillingConfig,
  Student,
  BillingConfig,
} from "@/lib/api";

const PLANS = [
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

export default function MensalidadesContent() {
  const [students, setStudents] = useState<Student[]>([]);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showStudentDialog, setShowStudentDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [sendingReminder, setSendingReminder] = useState<number | null>(null);

  const [studentForm, setStudentForm] = useState({
    name: "",
    phone: "",
    email: "",
    unit: "recreio" as const,
    plan: "mensal",
    planValue: 200,
    dueDay: 10,
    startDate: new Date().toISOString().split("T")[0],
    status: "active" as const,
    notes: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    referenceMonth: new Date().toISOString().slice(0, 7),
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "pix" as const,
    notes: "",
  });

  const fetchData = async () => {
    try {
      const [studentsData, configData] = await Promise.all([
        getStudentsWithStatus(),
        getBillingConfig(),
      ]);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setBillingConfig(configData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredStudents = students.filter((s) => {
    if (filterUnit !== "all" && s.unit !== filterUnit) return false;
    if (filterStatus === "overdue" && !s.isOverdue) return false;
    if (filterStatus === "active" && s.status !== "active") return false;
    if (filterStatus === "inactive" && s.status === "active") return false;
    return true;
  });

  const overdueCount = students.filter((s) => s.isOverdue).length;
  const activeCount = students.filter((s) => s.status === "active").length;

  const openNewStudent = () => {
    setEditingStudent(null);
    setStudentForm({
      name: "",
      phone: "",
      email: "",
      unit: "recreio",
      plan: "mensal",
      planValue: 200,
      dueDay: 10,
      startDate: new Date().toISOString().split("T")[0],
      status: "active",
      notes: "",
    });
    setShowStudentDialog(true);
  };

  const openEditStudent = (student: Student) => {
    setEditingStudent(student);
    setStudentForm({
      name: student.name,
      phone: student.phone,
      email: student.email || "",
      unit: student.unit,
      plan: student.plan,
      planValue: student.planValue,
      dueDay: student.dueDay,
      startDate: student.startDate,
      status: student.status,
      notes: student.notes || "",
    });
    setShowStudentDialog(true);
  };

  const openPaymentDialog = (student: Student) => {
    setSelectedStudent(student);
    setPaymentForm({
      amount: student.planValue,
      referenceMonth: new Date().toISOString().slice(0, 7),
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "pix",
      notes: "",
    });
    setShowPaymentDialog(true);
  };

  const handleSaveStudent = async () => {
    try {
      if (editingStudent) {
        await updateStudent(editingStudent.id, studentForm);
      } else {
        await createStudent(studentForm);
      }
      setShowStudentDialog(false);
      fetchData();
    } catch (error) {
      console.error("Error saving student:", error);
    }
  };

  const handleDeleteStudent = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este aluno?")) return;
    try {
      await deleteStudent(id);
      fetchData();
    } catch (error) {
      console.error("Error deleting student:", error);
    }
  };

  const handleSavePayment = async () => {
    if (!selectedStudent) return;
    try {
      await createPayment({
        studentId: selectedStudent.id,
        ...paymentForm,
      });
      setShowPaymentDialog(false);
      fetchData();
    } catch (error) {
      console.error("Error saving payment:", error);
    }
  };

  const handleSendReminder = async (studentId: number) => {
    setSendingReminder(studentId);
    try {
      await sendBillingReminder(studentId);
      alert("Cobrança enviada com sucesso!");
    } catch (error) {
      console.error("Error sending reminder:", error);
      alert("Erro ao enviar cobrança");
    } finally {
      setSendingReminder(null);
    }
  };

  const handleSendBulkReminders = async () => {
    if (!confirm("Enviar cobrança para todos os alunos em atraso?")) return;
    try {
      const result = await sendBulkReminders();
      alert(`Cobranças enviadas: ${result.sent}/${result.total}`);
    } catch (error) {
      console.error("Error sending bulk reminders:", error);
    }
  };

  const handleUpdateBillingConfig = async (updates: Partial<BillingConfig>) => {
    try {
      await updateBillingConfig(updates);
      fetchData();
    } catch (error) {
      console.error("Error updating billing config:", error);
    }
  };

  return (
    <DashboardLayout title="Mensalidades">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Alunos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{students.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alunos Ativos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Atraso</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {students.filter((s) => s.status === "active").reduce((sum, s) => sum + s.planValue, 0).toLocaleString("pt-BR")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="students" className="space-y-4">
        <TabsList>
          <TabsTrigger value="students">Alunos</TabsTrigger>
          <TabsTrigger value="billing">Cobranças Automáticas</TabsTrigger>
        </TabsList>

        {/* Students Tab */}
        <TabsContent value="students" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={filterUnit} onValueChange={setFilterUnit}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Unidades</SelectItem>
                <SelectItem value="recreio">Recreio</SelectItem>
                <SelectItem value="bangu">Bangu</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="overdue">Em Atraso</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2 sm:ml-auto">
              {overdueCount > 0 && (
                <Button variant="outline" onClick={handleSendBulkReminders}>
                  <Send className="h-4 w-4 mr-2" />
                  Cobrar Todos em Atraso
                </Button>
              )}
              <Button onClick={openNewStudent}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Aluno
              </Button>
            </div>
          </div>

          {/* Students List */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum aluno encontrado
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredStudents.map((student) => (
                <Card key={student.id} className={student.status !== "active" ? "opacity-60" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{student.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {student.unit === "recreio" ? "Recreio" : "Bangu"}
                        </CardDescription>
                      </div>
                      {student.isOverdue ? (
                        <Badge variant="destructive">
                          {student.daysOverdue} dias atraso
                        </Badge>
                      ) : student.status === "active" ? (
                        <Badge variant="default">Em dia</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {student.phone}
                    </div>
                    {student.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        {student.email}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span>{student.plan} - R$ {student.planValue}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Vencimento: dia {student.dueDay}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={() => openPaymentDialog(student)}
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Pagar
                      </Button>
                      {student.isOverdue && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendingReminder === student.id}
                          onClick={() => handleSendReminder(student.id)}
                        >
                          {sendingReminder === student.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditStudent(student)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleDeleteStudent(student.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Billing Config Tab */}
        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuração de Cobranças Automáticas</CardTitle>
              <CardDescription>
                Configure o envio automático de lembretes de pagamento via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Cobranças Automáticas</Label>
                  <p className="text-sm text-muted-foreground">
                    Enviar lembretes automaticamente para alunos em atraso
                  </p>
                </div>
                <Switch
                  checked={billingConfig?.enabled || false}
                  onCheckedChange={(checked) => handleUpdateBillingConfig({ enabled: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label>Horário de Envio</Label>
                <Input
                  type="time"
                  value={billingConfig?.time || "09:00"}
                  onChange={(e) => handleUpdateBillingConfig({ time: e.target.value })}
                  className="w-[180px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input
                  placeholder="Sua chave PIX"
                  value={billingConfig?.pixKey || ""}
                  onChange={(e) => handleUpdateBillingConfig({ pixKey: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Nome do Titular PIX</Label>
                <Input
                  placeholder="Nome que aparece no PIX"
                  value={billingConfig?.pixName || ""}
                  onChange={(e) => handleUpdateBillingConfig({ pixName: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Student Dialog */}
      <Dialog open={showStudentDialog} onOpenChange={setShowStudentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingStudent ? "Editar Aluno" : "Novo Aluno"}
            </DialogTitle>
            <DialogDescription>
              {editingStudent ? "Atualize os dados do aluno" : "Cadastre um novo aluno"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome completo"
                value={studentForm.name}
                onChange={(e) => setStudentForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  placeholder="(21) 99999-9999"
                  value={studentForm.phone}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={studentForm.email}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select
                  value={studentForm.unit}
                  onValueChange={(value: "recreio" | "bangu") => setStudentForm((prev) => ({ ...prev, unit: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recreio">Recreio</SelectItem>
                    <SelectItem value="bangu">Bangu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={studentForm.plan}
                  onValueChange={(value) => setStudentForm((prev) => ({ ...prev, plan: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANS.map((plan) => (
                      <SelectItem key={plan.value} value={plan.value}>
                        {plan.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  value={studentForm.planValue}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, planValue: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Dia Vencimento</Label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  value={studentForm.dueDay}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, dueDay: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input
                placeholder="Notas sobre o aluno"
                value={studentForm.notes}
                onChange={(e) => setStudentForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowStudentDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveStudent} disabled={!studentForm.name || !studentForm.phone}>
                {editingStudent ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>
              Registrar pagamento de {selectedStudent?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Mês Referência</Label>
                <Input
                  type="month"
                  value={paymentForm.referenceMonth}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, referenceMonth: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Pagamento</Label>
                <Input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(value: typeof paymentForm.paymentMethod) =>
                    setPaymentForm((prev) => ({ ...prev, paymentMethod: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSavePayment}>
                Registrar Pagamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
