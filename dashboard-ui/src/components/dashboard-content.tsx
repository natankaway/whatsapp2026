"use client";

import { useEffect, useState } from "react";
import {
  Wifi,
  WifiOff,
  Clock,
  Users,
  Calendar,
  TrendingUp,
  Pause,
  Play,
  RefreshCw,
  Smartphone,
  Server,
  MemoryStick,
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
  BotStatus,
  Booking,
  Student,
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
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statusData, bookingsData, studentsData] = await Promise.allSettled([
        getStatus(),
        getBookingsToday(),
        getStudentsWithStatus(),
      ]);

      if (statusData.status === 'fulfilled') setStatus(statusData.value);
      if (bookingsData.status === 'fulfilled') setBookingsToday(Array.isArray(bookingsData.value) ? bookingsData.value : []);
      if (studentsData.status === 'fulfilled') setStudents(Array.isArray(studentsData.value) ? studentsData.value : []);
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
            {status?.whatsapp.connected ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {status?.whatsapp.connected ? "Conectado" : "Desconectado"}
            </div>
            <p className="text-xs text-muted-foreground">
              {status?.whatsapp.user?.name || status?.whatsapp.state}
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
              {status?.whatsapp.uptimeFormatted || "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              Sistema: {status?.system.uptimeFormatted}
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
                    status?.whatsapp.connected
                      ? "bg-green-500 animate-pulse"
                      : "bg-red-500"
                  }`}
                />
                <div>
                  <p className="font-medium">
                    {status?.whatsapp.connected ? "Online" : "Offline"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {status?.whatsapp.state}
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

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Sistema
            </CardTitle>
            <CardDescription>
              Informações do servidor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Memória</span>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {status?.system.memory.percentUsed.toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((status?.system.memory.heapUsed || 0) / 1024 / 1024)}MB /{" "}
                    {Math.round((status?.system.memory.heapTotal || 0) / 1024 / 1024)}MB
                  </p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${status?.system.memory.percentUsed || 0}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-sm text-muted-foreground">Plataforma</p>
                <p className="font-medium">{status?.system.platform}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Node.js</p>
                <p className="font-medium">{status?.system.nodeVersion}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Bookings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
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
