"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings,
  Clock,
  MessageSquare,
  Shield,
  Save,
} from "lucide-react";
import {
  getSettings,
  updateSettings,
  Settings as SettingsType,
} from "@/lib/api";

const DAYS_OF_WEEK = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

export default function ConfiguracoesContent() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    workingHoursEnabled: false,
    workingHoursStart: "08:00",
    workingHoursEnd: "18:00",
    workingDays: [1, 2, 3, 4, 5],
    outsideHoursMessage: "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve!",
    pausedMessage: "O bot está temporariamente pausado. Por favor, tente novamente mais tarde.",
  });

  const fetchData = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      setFormData({
        workingHoursEnabled: data.workingHoursEnabled || false,
        workingHoursStart: data.workingHoursStart || "08:00",
        workingHoursEnd: data.workingHoursEnd || "18:00",
        workingDays: data.workingDays || [1, 2, 3, 4, 5],
        outsideHoursMessage: data.outsideHoursMessage || "",
        pausedMessage: data.pausedMessage || "",
      });
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(formData);
      await fetchData();
      alert("Configurações salvas com sucesso!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkingDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day].sort(),
    }));
  };

  if (loading) {
    return (
      <DashboardLayout title="Configurações">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Configurações">
      <div className="space-y-6">
        {/* Bot Status */}
        {settings?.botPaused && (
          <Card className="border-yellow-500/50 bg-yellow-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-yellow-400">
                <Shield className="h-5 w-5" />
                Bot Pausado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <strong>Motivo:</strong> {settings.pauseReason || "Não informado"}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Pausado em:</strong> {settings.pausedAt ? new Date(settings.pausedAt).toLocaleString("pt-BR") : "-"}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Por:</strong> {settings.pausedBy || "Sistema"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Working Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horário de Funcionamento
            </CardTitle>
            <CardDescription>
              Configure os horários em que o bot irá responder automaticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ativar Horário de Funcionamento</Label>
                <p className="text-sm text-muted-foreground">
                  O bot só responderá dentro do horário configurado
                </p>
              </div>
              <Switch
                checked={formData.workingHoursEnabled}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, workingHoursEnabled: checked }))
                }
              />
            </div>

            {formData.workingHoursEnabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Início</Label>
                    <Input
                      type="time"
                      value={formData.workingHoursStart}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, workingHoursStart: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fim</Label>
                    <Input
                      type="time"
                      value={formData.workingHoursEnd}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, workingHoursEnd: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Dias de Funcionamento</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={formData.workingDays.includes(day.value) ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleWorkingDay(day.value)}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Mensagens Automáticas
            </CardTitle>
            <CardDescription>
              Configure as mensagens que o bot enviará em situações específicas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Mensagem Fora do Horário</Label>
              <Textarea
                placeholder="Mensagem enviada quando alguém contata fora do horário de funcionamento"
                value={formData.outsideHoursMessage}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, outsideHoursMessage: e.target.value }))
                }
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Mensagem Bot Pausado</Label>
              <Textarea
                placeholder="Mensagem enviada quando o bot está pausado"
                value={formData.pausedMessage}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, pausedMessage: e.target.value }))
                }
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
