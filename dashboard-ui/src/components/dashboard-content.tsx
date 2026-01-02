"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wifi,
  WifiOff,
  Clock,
  Users,
  Calendar,
  Pause,
  Play,
  RefreshCw,
  Smartphone,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  CreditCard,
  ChevronRight,
  Wallet,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getStatus,
  getBookingsToday,
  getStudentsWithStatus,
  pauseBot,
  resumeBot,
  reconnectBot,
  getQRCode,
  getCashTransactions,
  BotStatus,
  Booking,
  Student,
  CashTransaction,
  CASH_UNITS,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DashboardContent() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [bookingsToday, setBookingsToday] = useState<Booking[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<CashTransaction[]>([]);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      // Get current month date range
      const now = new Date();
      const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const [statusData, bookingsData, studentsData, transactionsData] = await Promise.allSettled([
        getStatus(),
        getBookingsToday(),
        getStudentsWithStatus(),
        getCashTransactions({ startDate, endDate }),
      ]);

      if (statusData.status === 'fulfilled') setStatus(statusData.value);
      if (bookingsData.status === 'fulfilled') setBookingsToday(Array.isArray(bookingsData.value) ? bookingsData.value : []);
      if (studentsData.status === 'fulfilled') setStudents(Array.isArray(studentsData.value) ? studentsData.value : []);
      if (transactionsData.status === 'fulfilled') {
        const txs = transactionsData.value.transactions || [];
        // Get last 5 transactions
        setRecentTransactions(txs.slice(0, 5));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handlePause = async () => {
    try {
      await pauseBot(pauseReason || "Pausado pelo dashboard");
      setShowPauseDialog(false);
      setPauseReason("");
      fetchData();
    } catch (error) {
      console.error("Error pausing bot:", error);
    }
  };

  const handleResume = async () => {
    try {
      await resumeBot();
      fetchData();
    } catch (error) {
      console.error("Error resuming bot:", error);
    }
  };

  const handleReconnect = async () => {
    try {
      await reconnectBot();
      // Check for QR code
      const qr = await getQRCode();
      if (qr.qr) {
        setQrCode(qr.qr);
        setShowQR(true);
      }
      fetchData();
    } catch (error) {
      console.error("Error reconnecting:", error);
    }
  };

  const overdueStudents = students.filter((s) => s.isOverdue);
  const activeStudents = students.filter((s) => s.status === "active");

  // Students with upcoming due dates (next 7 days)
  const upcomingDueStudents = students.filter((s) => {
    if (s.status !== "active" || s.isOverdue) return false;
    const today = new Date();
    const dueDate = new Date(today.getFullYear(), today.getMonth(), s.dueDay);
    if (dueDate < today) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 7 && daysUntilDue >= 0;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const getUnitLabel = (unit: string) => {
    return CASH_UNITS.find((u) => u.value === unit)?.label || unit;
  };

  if (loading) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Dashboard">
      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* WhatsApp Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">WhatsApp</CardTitle>
            {status?.whatsapp?.connected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.whatsapp?.connected ? "Conectado" : "Desconectado"}
            </div>
            <p className="text-xs text-muted-foreground">
              {status?.whatsapp?.user?.name || status?.whatsapp?.state || "-"}
            </p>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tempo Online</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.whatsapp?.uptimeFormatted || "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              Sistema: {status?.system?.uptimeFormatted || "-"}
            </p>
          </CardContent>
        </Card>

        {/* Bookings Today */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aulas Hoje</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookingsToday.length}</div>
            <p className="text-xs text-muted-foreground">
              {bookingsToday.filter((b) => b.status === "confirmed").length} confirmadas
            </p>
          </CardContent>
        </Card>

        {/* Active Students */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alunos Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeStudents.length}</div>
            <p className="text-xs text-muted-foreground">
              {overdueStudents.length > 0 && (
                <span className="text-red-400">{overdueStudents.length} inadimplentes</span>
              )}
              {overdueStudents.length === 0 && "Todos em dia"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bot Control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Controle do Bot
            </CardTitle>
            <CardDescription>
              Gerencie o estado do bot WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full ${
                    status?.whatsapp?.connected
                      ? "bg-green-500 animate-pulse"
                      : "bg-red-500"
                  }`}
                />
                <div>
                  <p className="font-medium">
                    {status?.whatsapp?.connected ? "Online" : "Offline"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {status?.whatsapp?.state || "-"}
                  </p>
                </div>
              </div>
              <Badge variant={status?.bot?.isPaused ? "destructive" : "default"}>
                {status?.bot?.isPaused ? "Pausado" : "Ativo"}
              </Badge>
            </div>

            {status?.bot?.isPaused && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm text-yellow-400">
                  <strong>Motivo:</strong> {status?.bot?.pauseReason || "Não informado"}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {status?.bot?.isPaused ? (
                <Button onClick={handleResume} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  Retomar
                </Button>
              ) : (
                <Button
                  onClick={() => setShowPauseDialog(true)}
                  variant="outline"
                  className="flex-1"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pausar
                </Button>
              )}
              <Button onClick={handleReconnect} variant="outline" className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                Reconectar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Today's Bookings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Aulas de Hoje
            </CardTitle>
            <CardDescription>
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsToday.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma aula agendada para hoje
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {bookingsToday.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{booking.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.time} - {booking.unitName}
                      </p>
                    </div>
                    <Badge
                      variant={
                        booking.status === "confirmed"
                          ? "default"
                          : booking.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {booking.status === "confirmed"
                        ? "Confirmado"
                        : booking.status === "cancelled"
                        ? "Cancelado"
                        : "Pendente"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Ultimas Transacoes
              </CardTitle>
              <CardDescription>Movimentacoes recentes</CardDescription>
            </div>
            <Link href="/financeiro">
              <Button variant="ghost" size="sm">
                Ver todas
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma transacao este mes
              </div>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      {t.type === "income" ? (
                        <ArrowUpCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{t.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {getUnitLabel(t.unit)} - {new Date(t.date).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <span className={`font-medium ${t.type === "income" ? "text-green-600" : "text-red-600"}`}>
                      {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Due Payments & Overdue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Vencimentos
              </CardTitle>
              <CardDescription>Proximos 7 dias e inadimplentes</CardDescription>
            </div>
            <Link href="/mensalidades">
              <Button variant="ghost" size="sm">
                Ver todos
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {overdueStudents.length === 0 && upcomingDueStudents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum vencimento proximo
              </div>
            ) : (
              <div className="space-y-3">
                {/* Overdue first */}
                {overdueStudents.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.unit === "recreio" ? "Recreio" : "Bangu"} - {s.daysOverdue} dias em atraso
                        </p>
                      </div>
                    </div>
                    <span className="font-medium text-red-600">
                      {formatCurrency(s.planValue)}
                    </span>
                  </div>
                ))}
                {/* Upcoming */}
                {upcomingDueStudents.slice(0, 3).map((s) => {
                  const today = new Date();
                  const dueDate = new Date(today.getFullYear(), today.getMonth(), s.dueDay);
                  if (dueDate < today) dueDate.setMonth(dueDate.getMonth() + 1);
                  const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.unit === "recreio" ? "Recreio" : "Bangu"} - vence em {daysUntil} dias
                          </p>
                        </div>
                      </div>
                      <span className="font-medium">
                        {formatCurrency(s.planValue)}
                      </span>
                    </div>
                  );
                })}
                {(overdueStudents.length > 3 || upcomingDueStudents.length > 3) && (
                  <p className="text-xs text-center text-muted-foreground pt-2">
                    + {Math.max(0, overdueStudents.length - 3) + Math.max(0, upcomingDueStudents.length - 3)} outros
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pause Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar Bot</DialogTitle>
            <DialogDescription>
              O bot não responderá a mensagens enquanto estiver pausado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="pauseReason">Motivo (opcional)</Label>
              <Input
                id="pauseReason"
                placeholder="Ex: Manutenção programada"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPauseDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handlePause}>Confirmar Pausa</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Escanear QR Code</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no seu celular e escaneie o código
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center p-4">
            {qrCode && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCode}
                alt="QR Code"
                className="max-w-full rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
