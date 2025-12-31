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
  Calendar,
  Plus,
  ChevronLeft,
  ChevronRight,
  Phone,
  MapPin,
  Clock,
  X,
  Check,
  Trash2,
  Search,
  Download,
  CalendarDays,
} from "lucide-react";
import {
  getBookings,
  getBookingsWeek,
  getUnits,
  createBooking,
  updateBooking,
  deleteBooking,
  searchBookings,
  exportBookingsCSV,
  Booking,
  Unit,
  WeekDay,
} from "@/lib/api";

export default function AgendamentosContent() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [weekData, setWeekData] = useState<{ days: WeekDay[]; totalSemana: number } | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Booking[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("daily");
  const [newBooking, setNewBooking] = useState({
    name: "",
    phone: "",
    date: selectedDate,
    time: "08:00",
    unitId: 1,
    status: "confirmed" as const,
    source: "dashboard",
  });

  const fetchData = async () => {
    try {
      const [bookingsData, unitsData, weekResponse] = await Promise.all([
        getBookings({ date: selectedDate }),
        getUnits(),
        getBookingsWeek(),
      ]);
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      if (weekResponse && weekResponse.days) {
        setWeekData(weekResponse);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const filteredBookings = selectedUnit === "all"
    ? bookings
    : bookings.filter((b) => b.unitId === parseInt(selectedUnit));

  const changeDate = (days: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split("T")[0]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const handleCreateBooking = async () => {
    try {
      await createBooking(newBooking);
      setShowNewDialog(false);
      setNewBooking({
        name: "",
        phone: "",
        date: selectedDate,
        time: "08:00",
        unitId: 1,
        status: "confirmed",
        source: "dashboard",
      });
      fetchData();
    } catch (error) {
      console.error("Error creating booking:", error);
    }
  };

  const handleUpdateStatus = async (id: number, status: Booking["status"]) => {
    try {
      await updateBooking(id, { status });
      fetchData();
      if (searchResults) {
        handleSearch();
      }
    } catch (error) {
      console.error("Error updating booking:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;
    try {
      await deleteBooking(id);
      fetchData();
      if (searchResults) {
        handleSearch();
      }
    } catch (error) {
      console.error("Error deleting booking:", error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const result = await searchBookings(searchQuery, selectedUnit !== "all" ? selectedUnit : undefined);
      setSearchResults(result.bookings);
    } catch (error) {
      console.error("Error searching:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleExportCSV = () => {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split("T")[0];
    const url = exportBookingsCSV(startDate, endDate, selectedUnit !== "all" ? selectedUnit : undefined);
    window.open(url, "_blank");
  };

  const timeSlots = [
    "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
    "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
    "18:00", "19:00", "20:00", "21:00",
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge variant="default">Confirmado</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  const renderBookingCard = (booking: Booking) => (
    <Card key={booking.id} className={booking.status === "cancelled" ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{booking.name}</CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />
              {booking.time} - {booking.date}
            </CardDescription>
          </div>
          {getStatusBadge(booking.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone className="h-4 w-4" />
          {booking.phone}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {booking.unitName || `Unidade ${booking.unitId}`}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          {booking.status !== "confirmed" && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => handleUpdateStatus(booking.id, "confirmed")}
            >
              <Check className="h-4 w-4 mr-1" />
              Confirmar
            </Button>
          )}
          {booking.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => handleUpdateStatus(booking.id, "cancelled")}
            >
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => handleDelete(booking.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout title="Agendamentos">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <TabsList>
            <TabsTrigger value="daily">Por Data</TabsTrigger>
            <TabsTrigger value="weekly">Visão Semanal</TabsTrigger>
            <TabsTrigger value="search">Buscar</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            <Button onClick={() => {
              setNewBooking((prev) => ({ ...prev, date: selectedDate }));
              setShowNewDialog(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo
            </Button>
          </div>
        </div>

        {/* Daily View */}
        <TabsContent value="daily" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
              />
              <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
              >
                Hoje
              </Button>
            </div>

            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as unidades</SelectItem>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={String(unit.id)}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {formatDate(selectedDate)}
              </CardTitle>
              <CardDescription>
                {filteredBookings.length} agendamento(s) para esta data
              </CardDescription>
            </CardHeader>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredBookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhum agendamento para esta data
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredBookings
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(renderBookingCard)}
            </div>
          )}
        </TabsContent>

        {/* Weekly View */}
        <TabsContent value="weekly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Próximos 7 Dias
              </CardTitle>
              <CardDescription>
                Total de {weekData?.totalSemana || 0} agendamentos na semana
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : weekData?.days ? (
                <div className="grid gap-3 md:grid-cols-7">
                  {weekData.days.map((day) => (
                    <Card
                      key={day.date}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        day.date === selectedDate ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => {
                        setSelectedDate(day.date);
                        setActiveTab("daily");
                      }}
                    >
                      <CardHeader className="p-3 pb-2">
                        <CardTitle className="text-sm font-medium">{day.dayName}</CardTitle>
                        <CardDescription className="text-xs">
                          {new Date(day.date + "T12:00:00").toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-2xl font-bold text-primary">{day.total}</div>
                        <div className="text-xs text-muted-foreground space-y-1 mt-2">
                          <div className="flex justify-between">
                            <span>Recreio:</span>
                            <span>{day.recreio}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Bangu:</span>
                            <span>{day.bangu}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground">Nenhum dado disponível</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Buscar Agendamentos
              </CardTitle>
              <CardDescription>
                Busque por nome ou telefone nos últimos 30 dias e próximos 30 dias
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nome ou telefone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                />
                <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Unidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={String(unit.id)}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleSearch} disabled={searching || searchQuery.length < 2}>
                  {searching ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {searchResults && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {searchResults.length} resultado(s) encontrado(s)
              </p>
              {searchResults.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum agendamento encontrado
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {searchResults.map(renderBookingCard)}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Booking Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo agendamento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Nome do cliente"
                value={newBooking.name}
                onChange={(e) => setNewBooking((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                placeholder="(21) 99999-9999"
                value={newBooking.phone}
                onChange={(e) => setNewBooking((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={newBooking.date}
                  onChange={(e) => setNewBooking((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Horário</Label>
                <Select
                  value={newBooking.time}
                  onValueChange={(value) => setNewBooking((prev) => ({ ...prev, time: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unidade</Label>
              <Select
                value={String(newBooking.unitId)}
                onValueChange={(value) => setNewBooking((prev) => ({ ...prev, unitId: parseInt(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={String(unit.id)}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowNewDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateBooking} disabled={!newBooking.name || !newBooking.phone}>
                Criar Agendamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
