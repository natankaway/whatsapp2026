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
  BarChart3,
  Plus,
  Clock,
  Calendar,
  Users,
  Trash2,
  Edit,
  X,
  Play,
  Pin,
  PinOff,
  History,
  Send,
} from "lucide-react";
import {
  getPollSchedules,
  createPollSchedule,
  updatePollSchedule,
  deletePollSchedule,
  executePollSchedule,
  PollSchedule,
  getSentPolls,
  pinSentPoll,
  unpinSentPoll,
  deleteSentPoll,
  SentPoll,
  PinDuration,
} from "@/lib/api";

const DAYS_OF_WEEK = [
  { key: "monday", label: "Seg" },
  { key: "tuesday", label: "Ter" },
  { key: "wednesday", label: "Qua" },
  { key: "thursday", label: "Qui" },
  { key: "friday", label: "Sex" },
  { key: "saturday", label: "Sáb" },
  { key: "sunday", label: "Dom" },
];

const DEFAULT_POLL: Omit<PollSchedule, "id"> = {
  name: "",
  targetGroup: "recreio",
  time: "08:00",
  dayOfWeek: "",
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
  pollOptions: ["Vou", "Não vou", "Talvez"],
  enabled: true,
};

const PIN_DURATIONS: { value: PinDuration; label: string }[] = [
  { value: 86400, label: "24 horas" },
  { value: 604800, label: "7 dias" },
  { value: 2592000, label: "30 dias" },
];

export default function EnquetesContent() {
  const [schedules, setSchedules] = useState<PollSchedule[]>([]);
  const [sentPolls, setSentPolls] = useState<SentPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSentPolls, setLoadingSentPolls] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<PollSchedule | null>(null);
  const [selectedPollToPin, setSelectedPollToPin] = useState<SentPoll | null>(null);
  const [selectedPinDuration, setSelectedPinDuration] = useState<PinDuration>(604800);
  const [formData, setFormData] = useState<Omit<PollSchedule, "id">>(DEFAULT_POLL);
  const [newOption, setNewOption] = useState("");
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [pinningId, setPinningId] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const data = await getPollSchedules();
      setSchedules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching schedules:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSentPolls = async () => {
    try {
      const data = await getSentPolls({ limit: 50 });
      setSentPolls(data);
    } catch (error) {
      console.error("Error fetching sent polls:", error);
    } finally {
      setLoadingSentPolls(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchSentPolls();
  }, []);

  // Pin/Unpin handlers
  const openPinDialog = (poll: SentPoll) => {
    setSelectedPollToPin(poll);
    setSelectedPinDuration(604800); // Default to 7 days
    setShowPinDialog(true);
  };

  const handlePin = async () => {
    if (!selectedPollToPin) return;

    setPinningId(selectedPollToPin.id);
    try {
      await pinSentPoll(selectedPollToPin.id, selectedPinDuration);
      setShowPinDialog(false);
      fetchSentPolls();
    } catch (error) {
      console.error("Error pinning poll:", error);
      alert("Erro ao fixar enquete. O bot precisa ser admin do grupo.");
    } finally {
      setPinningId(null);
    }
  };

  const handleUnpin = async (poll: SentPoll) => {
    if (!confirm("Tem certeza que deseja desfixar esta enquete?")) return;

    setPinningId(poll.id);
    try {
      await unpinSentPoll(poll.id);
      fetchSentPolls();
    } catch (error) {
      console.error("Error unpinning poll:", error);
      alert("Erro ao desfixar enquete.");
    } finally {
      setPinningId(null);
    }
  };

  const handleDeleteSentPoll = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta enquete do histórico?")) return;
    try {
      await deleteSentPoll(id);
      fetchSentPolls();
    } catch (error) {
      console.error("Error deleting sent poll:", error);
    }
  };

  const getGroupName = (groupId: string) => {
    if (groupId.includes("recreio") || groupId === "120363046667178908@g.us") return "Recreio";
    if (groupId.includes("bangu") || groupId === "120363340519323647@g.us") return "Bangu";
    return "Grupo";
  };

  const isPinned = (poll: SentPoll) => {
    if (!poll.pinnedUntil) return false;
    return new Date(poll.pinnedUntil) > new Date();
  };

  const openNewDialog = () => {
    setEditingSchedule(null);
    setFormData(DEFAULT_POLL);
    setShowDialog(true);
  };

  const openEditDialog = (schedule: PollSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.name,
      targetGroup: schedule.targetGroup,
      customGroupId: schedule.customGroupId,
      time: schedule.time,
      dayOfWeek: schedule.dayOfWeek,
      monday: schedule.monday,
      tuesday: schedule.tuesday,
      wednesday: schedule.wednesday,
      thursday: schedule.thursday,
      friday: schedule.friday,
      saturday: schedule.saturday,
      sunday: schedule.sunday,
      pollOptions: schedule.pollOptions,
      enabled: schedule.enabled,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    try {
      if (editingSchedule) {
        await updatePollSchedule(editingSchedule.id, formData);
      } else {
        await createPollSchedule(formData);
      }
      setShowDialog(false);
      fetchData();
    } catch (error) {
      console.error("Error saving schedule:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta enquete?")) return;
    try {
      await deletePollSchedule(id);
      fetchData();
    } catch (error) {
      console.error("Error deleting schedule:", error);
    }
  };

  const handleToggleEnabled = async (schedule: PollSchedule) => {
    try {
      await updatePollSchedule(schedule.id, { enabled: !schedule.enabled });
      fetchData();
    } catch (error) {
      console.error("Error toggling schedule:", error);
    }
  };

  const handleExecuteNow = async (id: number) => {
    if (!confirm("Deseja executar esta enquete agora?")) return;
    setExecutingId(id);
    try {
      const result = await executePollSchedule(id);
      if (result.success) {
        alert("Enquete enviada com sucesso!");
      } else {
        alert(result.message || "Erro ao enviar enquete");
      }
      fetchData();
    } catch (error) {
      console.error("Error executing schedule:", error);
      alert("Erro ao executar enquete");
    } finally {
      setExecutingId(null);
    }
  };

  const toggleDay = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      [day]: !prev[day as keyof typeof prev],
    }));
  };

  const addOption = () => {
    if (newOption.trim() && !formData.pollOptions.includes(newOption.trim())) {
      setFormData((prev) => ({
        ...prev,
        pollOptions: [...prev.pollOptions, newOption.trim()],
      }));
      setNewOption("");
    }
  };

  const removeOption = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      pollOptions: prev.pollOptions.filter((_, i) => i !== index),
    }));
  };

  const getActiveDays = (schedule: PollSchedule) => {
    const days = [];
    if (schedule.monday) days.push("Seg");
    if (schedule.tuesday) days.push("Ter");
    if (schedule.wednesday) days.push("Qua");
    if (schedule.thursday) days.push("Qui");
    if (schedule.friday) days.push("Sex");
    if (schedule.saturday) days.push("Sáb");
    if (schedule.sunday) days.push("Dom");
    return days.join(", ") || "Nenhum dia";
  };

  return (
    <DashboardLayout title="Enquetes">
      <Tabs defaultValue="schedules" className="space-y-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="schedules" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Agendamentos
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Enviadas ({sentPolls.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab: Agendamentos */}
        <TabsContent value="schedules" className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Enquetes Automáticas</h2>
              <p className="text-muted-foreground">
                Configure enquetes que serão enviadas automaticamente nos horários programados
              </p>
            </div>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Enquete
            </Button>
          </div>

          {/* Schedules List */}
          {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Nenhuma enquete configurada
            </p>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Enquete
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className={!schedule.enabled ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {schedule.name}
                      {!schedule.enabled && (
                        <Badge variant="secondary">Desativada</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <Users className="h-3 w-3" />
                      {schedule.targetGroup === "recreio" ? "Recreio" :
                       schedule.targetGroup === "bangu" ? "Bangu" :
                       "Grupo Customizado"}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={schedule.enabled}
                    onCheckedChange={() => handleToggleEnabled(schedule)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{schedule.time}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{getActiveDays(schedule)}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {schedule.pollOptions.map((option, i) => (
                    <Badge key={i} variant="outline">
                      {option}
                    </Badge>
                  ))}
                </div>
                {schedule.lastExecuted && (
                  <p className="text-xs text-muted-foreground">
                    Última execução: {new Date(schedule.lastExecuted).toLocaleString("pt-BR")}
                  </p>
                )}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1"
                    onClick={() => handleExecuteNow(schedule.id)}
                    disabled={executingId === schedule.id}
                  >
                    {executingId === schedule.id ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1" />
                        Executar
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(schedule)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => handleDelete(schedule.id)}
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

        {/* Tab: Enviadas */}
        <TabsContent value="sent" className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Enquetes Enviadas</h2>
            <p className="text-muted-foreground">
              Histórico de enquetes enviadas - clique em Fixar para manter no topo do grupo
            </p>
          </div>

          {loadingSentPolls ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : sentPolls.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nenhuma enquete enviada ainda
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Envie enquetes pela aba Agendamentos ou execute um agendamento
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sentPolls.map((poll) => (
                <Card key={poll.id} className={isPinned(poll) ? "border-primary" : ""}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{poll.title}</h3>
                          {isPinned(poll) && (
                            <Badge variant="default" className="bg-primary">
                              <Pin className="h-3 w-3 mr-1" />
                              Fixada
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {getGroupName(poll.groupId)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(poll.sentAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {poll.options.map((option, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {option}
                            </Badge>
                          ))}
                        </div>
                        {isPinned(poll) && poll.pinnedUntil && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Fixada até: {new Date(poll.pinnedUntil).toLocaleString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        {isPinned(poll) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUnpin(poll)}
                            disabled={pinningId === poll.id}
                          >
                            {pinningId === poll.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <>
                                <PinOff className="h-4 w-4 mr-1" />
                                Desfixar
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openPinDialog(poll)}
                            disabled={pinningId === poll.id}
                          >
                            {pinningId === poll.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <>
                                <Pin className="h-4 w-4 mr-1" />
                                Fixar
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => handleDeleteSentPoll(poll.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Pin Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fixar Enquete</DialogTitle>
            <DialogDescription>
              Defina por quanto tempo a mensagem ficará fixada no grupo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm font-medium">{selectedPollToPin?.title}</p>
            <div className="space-y-3">
              {PIN_DURATIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPinDuration === option.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="pinDuration"
                    value={option.value}
                    checked={selectedPinDuration === option.value}
                    onChange={() => setSelectedPinDuration(option.value)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selectedPinDuration === option.value
                        ? "border-primary"
                        : "border-muted-foreground"
                    }`}
                  >
                    {selectedPinDuration === option.value && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode desfixar a mensagem a qualquer momento.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPinDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handlePin} disabled={pinningId !== null}>
                {pinningId !== null ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                ) : (
                  <Pin className="h-4 w-4 mr-2" />
                )}
                Fixar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? "Editar Enquete" : "Nova Enquete"}
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes da enquete automática
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Enquete</Label>
              <Input
                id="name"
                placeholder="Ex: Presença na aula"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetGroup">Grupo Alvo</Label>
              <Select
                value={formData.targetGroup}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, targetGroup: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recreio">Recreio</SelectItem>
                  <SelectItem value="bangu">Bangu</SelectItem>
                  <SelectItem value="custom">Grupo Customizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.targetGroup === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="customGroupId">ID do Grupo</Label>
                <Input
                  id="customGroupId"
                  placeholder="Ex: 5521999999999-1234567890@g.us"
                  value={formData.customGroupId || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, customGroupId: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="time">Horário</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData((prev) => ({ ...prev, time: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Dias da Semana</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <Button
                    key={day.key}
                    type="button"
                    variant={formData[day.key as keyof typeof formData] ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDay(day.key)}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Opções da Enquete</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.pollOptions.map((option, index) => (
                  <Badge key={index} variant="secondary" className="pr-1">
                    {option}
                    <button
                      type="button"
                      className="ml-1 hover:text-red-400"
                      onClick={() => removeOption(index)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nova opção"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addOption())}
                />
                <Button type="button" variant="outline" onClick={addOption}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Enquete Ativada</Label>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={!formData.name || formData.pollOptions.length < 2}
              >
                {editingSchedule ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
