"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
} from "lucide-react";
import {
  getPollSchedules,
  createPollSchedule,
  updatePollSchedule,
  deletePollSchedule,
  executePollSchedule,
  PollSchedule,
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
  targetGroup: "alunos",
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

export default function EnquetesContent() {
  const [schedules, setSchedules] = useState<PollSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<PollSchedule | null>(null);
  const [formData, setFormData] = useState<Omit<PollSchedule, "id">>(DEFAULT_POLL);
  const [newOption, setNewOption] = useState("");
  const [executingId, setExecutingId] = useState<number | null>(null);

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

  useEffect(() => {
    fetchData();
  }, []);

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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
                      {schedule.targetGroup === "alunos" ? "Grupo de Alunos" :
                       schedule.targetGroup === "geral" ? "Grupo Geral" :
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
                  <SelectItem value="alunos">Grupo de Alunos</SelectItem>
                  <SelectItem value="geral">Grupo Geral</SelectItem>
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
