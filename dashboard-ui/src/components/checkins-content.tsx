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
  Users,
  AlertTriangle,
  Phone,
  Trash2,
  Edit,
  Calendar,
  CheckCircle,
  History,
  TrendingUp,
  TrendingDown,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import {
  getCheckinStudents,
  getCheckinSummary,
  createCheckinStudent,
  updateCheckinStudent,
  deleteCheckinStudent,
  getCheckinTransactions,
  createCheckinTransaction,
  deleteCheckinTransaction,
  getCheckinStudentById,
  CheckinStudent,
  CheckinTransaction,
  CheckinSummary,
} from "@/lib/api";

const PLATFORMS = [
  { value: "wellhub", label: "Wellhub (Gympass)" },
  { value: "totalpass", label: "TotalPass" },
  { value: "gurupass", label: "GuruPass" },
];

export default function CheckinsContent() {
  const [students, setStudents] = useState<CheckinStudent[]>([]);
  const [summary, setSummary] = useState<CheckinSummary | null>(null);
  const [transactions, setTransactions] = useState<CheckinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUnit, setFilterUnit] = useState<string>("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [showStudentDialog, setShowStudentDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [editingStudent, setEditingStudent] = useState<CheckinStudent | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<CheckinStudent | null>(null);
  const [studentHistory, setStudentHistory] = useState<CheckinTransaction[]>([]);

  const [studentForm, setStudentForm] = useState({
    name: "",
    phone: "",
    unit: "recreio" as "recreio" | "bangu",
    platform: "wellhub" as "wellhub" | "totalpass" | "gurupass",
    balance: 0,
    status: "active" as "active" | "inactive",
    notes: "",
  });

  const [transactionForm, setTransactionForm] = useState({
    type: "credit" as "credit" | "debit",
    amount: 1,
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const fetchData = async () => {
    try {
      const [studentsData, summaryData, transactionsData] = await Promise.all([
        getCheckinStudents(),
        getCheckinSummary(),
        getCheckinTransactions(),
      ]);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setSummary(summaryData);
      setTransactions(Array.isArray(transactionsData) ? transactionsData : []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredStudents = students.filter((student) => {
    if (filterUnit !== "all" && student.unit !== filterUnit) return false;
    if (filterPlatform !== "all" && student.platform !== filterPlatform) return false;
    return true;
  });

  const handleSaveStudent = async () => {
    try {
      if (editingStudent) {
        await updateCheckinStudent(editingStudent.id, studentForm);
      } else {
        await createCheckinStudent(studentForm);
      }
      setShowStudentDialog(false);
      setEditingStudent(null);
      resetStudentForm();
      fetchData();
    } catch (error) {
      console.error("Error saving student:", error);
      alert("Erro ao salvar aluno");
    }
  };

  const handleDeleteStudent = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este aluno?")) return;
    try {
      await deleteCheckinStudent(id);
      fetchData();
    } catch (error) {
      console.error("Error deleting student:", error);
      alert("Erro ao excluir aluno");
    }
  };

  const handleSaveTransaction = async () => {
    if (!selectedStudent) return;
    try {
      await createCheckinTransaction({
        studentId: selectedStudent.id,
        ...transactionForm,
      });
      setShowTransactionDialog(false);
      resetTransactionForm();
      fetchData();
    } catch (error) {
      console.error("Error saving transaction:", error);
      alert("Erro ao registrar transacao");
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!confirm("Tem certeza? O saldo sera revertido.")) return;
    try {
      await deleteCheckinTransaction(id);
      fetchData();
      if (selectedStudent) {
        const updated = await getCheckinStudentById(selectedStudent.id);
        setStudentHistory(updated.transactions || []);
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      alert("Erro ao excluir transacao");
    }
  };

  const handleShowHistory = async (student: CheckinStudent) => {
    try {
      const data = await getCheckinStudentById(student.id);
      setSelectedStudent(data);
      setStudentHistory(data.transactions || []);
      setShowHistoryDialog(true);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const resetStudentForm = () => {
    setStudentForm({
      name: "",
      phone: "",
      unit: "recreio",
      platform: "wellhub",
      balance: 0,
      status: "active",
      notes: "",
    });
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      type: "credit",
      amount: 1,
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
  };

  const openEditStudent = (student: CheckinStudent) => {
    setEditingStudent(student);
    setStudentForm({
      name: student.name,
      phone: student.phone,
      unit: student.unit,
      platform: student.platform,
      balance: student.balance,
      status: student.status,
      notes: student.notes || "",
    });
    setShowStudentDialog(true);
  };

  const openNewTransaction = (student: CheckinStudent) => {
    setSelectedStudent(student);
    resetTransactionForm();
    setShowTransactionDialog(true);
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return "text-green-600";
    if (balance < 0) return "text-red-600";
    return "text-gray-600";
  };

  const getBalanceBadge = (balance: number) => {
    if (balance > 0) return <Badge className="bg-green-100 text-green-800">+{balance} creditos</Badge>;
    if (balance < 0) return <Badge className="bg-red-100 text-red-800">{balance} devendo</Badge>;
    return <Badge variant="secondary">Zerado</Badge>;
  };

  const getPlatformLabel = (platform: string) => {
    return PLATFORMS.find(p => p.value === platform)?.label || platform;
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
            <h1 className="text-2xl sm:text-3xl font-bold">Controle de Check-ins</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Gerencie alunos de plataformas
            </p>
          </div>
          <Button size="sm" onClick={() => { resetStudentForm(); setEditingStudent(null); setShowStudentDialog(true); }}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Novo Aluno</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Total</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{summary?.totalStudents || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Devendo</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-red-600">{summary?.totalOwing || 0}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {summary?.totalBalanceOwed || 0} check-ins
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Creditos</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-green-600">{summary?.totalWithCredits || 0}</div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {summary?.totalCreditsAvailable || 0} disponiveis
              </p>
            </CardContent>
          </Card>
          <Card className="hidden sm:block">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Zerados</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                {(summary?.totalStudents || 0) - (summary?.totalOwing || 0) - (summary?.totalWithCredits || 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="hidden lg:block">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Hoje</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">
                {transactions.filter(t => t.date === new Date().toISOString().split("T")[0]).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Select value={filterUnit} onValueChange={setFilterUnit}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Unidades</SelectItem>
              <SelectItem value="recreio">Recreio</SelectItem>
              <SelectItem value="bangu">Bangu</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPlatform} onValueChange={setFilterPlatform}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Plataforma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Plataformas</SelectItem>
              {PLATFORMS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="w-full sm:w-auto overflow-x-auto flex">
            <TabsTrigger value="all" className="text-xs sm:text-sm flex-1 sm:flex-none">Todos ({filteredStudents.length})</TabsTrigger>
            <TabsTrigger value="owing" className="text-xs sm:text-sm flex-1 sm:flex-none">
              Devendo ({filteredStudents.filter(s => s.balance < 0).length})
            </TabsTrigger>
            <TabsTrigger value="credits" className="text-xs sm:text-sm flex-1 sm:flex-none">
              Creditos ({filteredStudents.filter(s => s.balance > 0).length})
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm flex-1 sm:flex-none">Historico</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <StudentsList
              students={filteredStudents}
              onEdit={openEditStudent}
              onDelete={handleDeleteStudent}
              onTransaction={openNewTransaction}
              onHistory={handleShowHistory}
              getBalanceBadge={getBalanceBadge}
              getPlatformLabel={getPlatformLabel}
            />
          </TabsContent>

          <TabsContent value="owing" className="space-y-4">
            <StudentsList
              students={filteredStudents.filter(s => s.balance < 0)}
              onEdit={openEditStudent}
              onDelete={handleDeleteStudent}
              onTransaction={openNewTransaction}
              onHistory={handleShowHistory}
              getBalanceBadge={getBalanceBadge}
              getPlatformLabel={getPlatformLabel}
            />
          </TabsContent>

          <TabsContent value="credits" className="space-y-4">
            <StudentsList
              students={filteredStudents.filter(s => s.balance > 0)}
              onEdit={openEditStudent}
              onDelete={handleDeleteStudent}
              onTransaction={openNewTransaction}
              onHistory={handleShowHistory}
              getBalanceBadge={getBalanceBadge}
              getPlatformLabel={getPlatformLabel}
            />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Historico de Transacoes</CardTitle>
                <CardDescription>Ultimas transacoes registradas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {transactions.slice(0, 50).map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {t.type === "credit" ? (
                          <ArrowUpCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <ArrowDownCircle className="h-5 w-5 text-red-500" />
                        )}
                        <div>
                          <p className="font-medium">{t.studentName}</p>
                          <p className="text-sm text-muted-foreground">
                            {t.type === "credit" ? "Check-in no app" : "Usou na aula"} - {t.amount}x
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                        {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                      </div>
                    </div>
                  ))}
                  {transactions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma transacao registrada
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Student Dialog */}
        <Dialog open={showStudentDialog} onOpenChange={setShowStudentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingStudent ? "Editar Aluno" : "Novo Aluno"}</DialogTitle>
              <DialogDescription>
                Preencha os dados do aluno de plataforma
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={studentForm.name}
                    onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                    placeholder="Nome do aluno"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={studentForm.phone}
                    onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })}
                    placeholder="(21) 99999-9999"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select
                    value={studentForm.unit}
                    onValueChange={(v) => setStudentForm({ ...studentForm, unit: v as "recreio" | "bangu" })}
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
                  <Label>Plataforma</Label>
                  <Select
                    value={studentForm.platform}
                    onValueChange={(v) => setStudentForm({ ...studentForm, platform: v as "wellhub" | "totalpass" | "gurupass" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Saldo Inicial</Label>
                  <Input
                    type="number"
                    value={studentForm.balance}
                    onChange={(e) => setStudentForm({ ...studentForm, balance: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Positivo = creditos, Negativo = devendo
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={studentForm.status}
                    onValueChange={(v) => setStudentForm({ ...studentForm, status: v as "active" | "inactive" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observacoes</Label>
                <Input
                  value={studentForm.notes}
                  onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })}
                  placeholder="Observacoes opcionais"
                />
              </div>
              <Button onClick={handleSaveStudent} className="w-full">
                {editingStudent ? "Salvar Alteracoes" : "Cadastrar Aluno"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Transaction Dialog */}
        <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar Transacao</DialogTitle>
              <DialogDescription>
                {selectedStudent?.name} - Saldo atual: {selectedStudent?.balance}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={transactionForm.type}
                    onValueChange={(v) => setTransactionForm({ ...transactionForm, type: v as "credit" | "debit" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className="h-4 w-4 text-green-500" />
                          Credito (fez check-in)
                        </div>
                      </SelectItem>
                      <SelectItem value="debit">
                        <div className="flex items-center gap-2">
                          <ArrowDownCircle className="h-4 w-4 text-red-500" />
                          Debito (usou na aula)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min="1"
                    value={transactionForm.amount}
                    onChange={(e) => setTransactionForm({ ...transactionForm, amount: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Observacao</Label>
                <Input
                  value={transactionForm.notes}
                  onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">
                  Novo saldo apos transacao:{" "}
                  <span className={getBalanceColor(
                    (selectedStudent?.balance || 0) +
                    (transactionForm.type === "credit" ? transactionForm.amount : -transactionForm.amount)
                  )}>
                    <strong>
                      {(selectedStudent?.balance || 0) +
                        (transactionForm.type === "credit" ? transactionForm.amount : -transactionForm.amount)}
                    </strong>
                  </span>
                </p>
              </div>
              <Button onClick={handleSaveTransaction} className="w-full">
                Registrar Transacao
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Historico - {selectedStudent?.name}</DialogTitle>
              <DialogDescription>
                Saldo atual: {selectedStudent?.balance} | Plataforma: {selectedStudent?.platform}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {studentHistory.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {t.type === "credit" ? (
                      <ArrowUpCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">
                        {t.type === "credit" ? "Check-in no app" : "Usou na aula"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(t.date).toLocaleDateString("pt-BR")} - {t.amount}x
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.notes && <span className="text-xs text-muted-foreground">{t.notes}</span>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTransaction(t.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
              {studentHistory.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma transacao registrada
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// Sub-component for students list
function StudentsList({
  students,
  onEdit,
  onDelete,
  onTransaction,
  onHistory,
  getBalanceBadge,
  getPlatformLabel,
}: {
  students: CheckinStudent[];
  onEdit: (s: CheckinStudent) => void;
  onDelete: (id: number) => void;
  onTransaction: (s: CheckinStudent) => void;
  onHistory: (s: CheckinStudent) => void;
  getBalanceBadge: (balance: number) => React.ReactNode;
  getPlatformLabel: (platform: string) => string;
}) {
  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Nenhum aluno encontrado
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {students.map((student) => (
        <Card key={student.id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{student.name}</CardTitle>
                <CardDescription className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {student.phone}
                </CardDescription>
              </div>
              {getBalanceBadge(student.balance)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Unidade:</span>
                <Badge variant="outline">{student.unit === "recreio" ? "Recreio" : "Bangu"}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Plataforma:</span>
                <span>{getPlatformLabel(student.platform)}</span>
              </div>
              {student.notes && (
                <p className="text-xs text-muted-foreground mt-2">{student.notes}</p>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onTransaction(student)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Transacao
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onHistory(student)}
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(student)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(student.id)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
