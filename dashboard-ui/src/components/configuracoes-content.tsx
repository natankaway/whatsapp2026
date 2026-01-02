"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  MessageSquare,
  Shield,
  Save,
  Building2,
  MapPin,
  Edit,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  getSettings,
  updateSettings,
  getUnits,
  updateUnit,
  createUnit,
  deleteUnit,
  Settings as SettingsType,
  Unit,
  UnitPrice,
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

interface UnitFormData {
  slug: string;
  name: string;
  address: string;
  location: string;
  workingDays: string;
  schedules: string[];
  schedulesText: string[];
  saturdayClass: string;
  prices: {
    mensalidade: UnitPrice[];
    avulsa: string;
  };
  platforms: string[];
  whatsappGroupId: string;
  isActive: boolean;
}

const emptyUnitForm: UnitFormData = {
  slug: "",
  name: "",
  address: "",
  location: "",
  workingDays: "Segunda a Sexta",
  schedules: [],
  schedulesText: [],
  saturdayClass: "",
  prices: {
    mensalidade: [{ frequencia: "1x por semana", valor: "R$ 100,00" }],
    avulsa: "R$ 30,00",
  },
  platforms: [],
  whatsappGroupId: "",
  isActive: true,
};

export default function ConfiguracoesContent() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
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

  // Unit editing state
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [isNewUnit, setIsNewUnit] = useState(false);
  const [unitFormData, setUnitFormData] = useState<UnitFormData>(emptyUnitForm);
  const [savingUnit, setSavingUnit] = useState(false);

  // Temporary input states for arrays
  const [newSchedule, setNewSchedule] = useState("");
  const [newScheduleText, setNewScheduleText] = useState("");
  const [newPlatform, setNewPlatform] = useState("");

  const fetchData = async () => {
    try {
      const [settingsData, unitsData] = await Promise.all([
        getSettings(),
        getUnits(),
      ]);
      setSettings(settingsData);
      setUnits(unitsData);
      setFormData({
        workingHoursEnabled: settingsData.workingHoursEnabled || false,
        workingHoursStart: settingsData.workingHoursStart || "08:00",
        workingHoursEnd: settingsData.workingHoursEnd || "18:00",
        workingDays: settingsData.workingDays || [1, 2, 3, 4, 5],
        outsideHoursMessage: settingsData.outsideHoursMessage || "",
        pausedMessage: settingsData.pausedMessage || "",
      });
    } catch (error) {
      console.error("Error fetching data:", error);
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

  // Unit management functions
  const openEditUnit = (unit: Unit) => {
    setEditingUnit(unit);
    setIsNewUnit(false);
    setUnitFormData({
      slug: unit.slug || "",
      name: unit.name || "",
      address: unit.address || "",
      location: unit.location || "",
      workingDays: unit.workingDays || "Segunda a Sexta",
      schedules: Array.isArray(unit.schedules) ? unit.schedules : [],
      schedulesText: Array.isArray(unit.schedulesText) ? unit.schedulesText : [],
      saturdayClass: unit.saturdayClass || "",
      prices: {
        mensalidade: Array.isArray(unit.prices?.mensalidade) ? unit.prices.mensalidade : [],
        avulsa: unit.prices?.avulsa || "R$ 30,00",
      },
      platforms: Array.isArray(unit.platforms) ? unit.platforms : [],
      whatsappGroupId: unit.whatsappGroupId || "",
      isActive: unit.isActive !== false,
    });
  };

  const openNewUnit = () => {
    setEditingUnit(null);
    setIsNewUnit(true);
    setUnitFormData(emptyUnitForm);
  };

  const closeUnitDialog = () => {
    setEditingUnit(null);
    setIsNewUnit(false);
    setUnitFormData(emptyUnitForm);
    setNewSchedule("");
    setNewScheduleText("");
    setNewPlatform("");
  };

  const handleSaveUnit = async () => {
    setSavingUnit(true);
    try {
      if (isNewUnit) {
        await createUnit(unitFormData as Omit<Unit, 'id' | 'createdAt' | 'updatedAt'>);
        alert("Unidade criada com sucesso!");
      } else if (editingUnit) {
        await updateUnit(editingUnit.id, unitFormData);
        alert("Unidade atualizada com sucesso!");
      }
      await fetchData();
      closeUnitDialog();
    } catch (error) {
      console.error("Error saving unit:", error);
      alert("Erro ao salvar unidade");
    } finally {
      setSavingUnit(false);
    }
  };

  const handleDeleteUnit = async (unit: Unit) => {
    if (!confirm(`Deseja realmente desativar a unidade "${unit.name}"?`)) return;
    try {
      await deleteUnit(unit.id);
      await fetchData();
      alert("Unidade desativada com sucesso!");
    } catch (error) {
      console.error("Error deleting unit:", error);
      alert("Erro ao desativar unidade");
    }
  };

  // Array management helpers
  const addSchedule = () => {
    if (newSchedule.trim()) {
      setUnitFormData(prev => ({
        ...prev,
        schedules: [...prev.schedules, newSchedule.trim()],
      }));
      setNewSchedule("");
    }
  };

  const removeSchedule = (index: number) => {
    setUnitFormData(prev => ({
      ...prev,
      schedules: prev.schedules.filter((_, i) => i !== index),
    }));
  };

  const addScheduleText = () => {
    if (newScheduleText.trim()) {
      setUnitFormData(prev => ({
        ...prev,
        schedulesText: [...prev.schedulesText, newScheduleText.trim()],
      }));
      setNewScheduleText("");
    }
  };

  const removeScheduleText = (index: number) => {
    setUnitFormData(prev => ({
      ...prev,
      schedulesText: prev.schedulesText.filter((_, i) => i !== index),
    }));
  };

  const addPlatform = () => {
    if (newPlatform.trim()) {
      setUnitFormData(prev => ({
        ...prev,
        platforms: [...prev.platforms, newPlatform.trim()],
      }));
      setNewPlatform("");
    }
  };

  const removePlatform = (index: number) => {
    setUnitFormData(prev => ({
      ...prev,
      platforms: prev.platforms.filter((_, i) => i !== index),
    }));
  };

  const addMensalidade = () => {
    setUnitFormData(prev => ({
      ...prev,
      prices: {
        ...prev.prices,
        mensalidade: [...prev.prices.mensalidade, { frequencia: "", valor: "" }],
      },
    }));
  };

  // Formata valor para moeda brasileira
  const formatCurrencyValue = (value: string): string => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    if (!numbers) return '';

    // Converte para centavos e formata
    const cents = parseInt(numbers, 10);
    const reais = cents / 100;
    return reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleValorChange = (index: number, inputValue: string) => {
    // Remove tudo que não é número
    const numbers = inputValue.replace(/\D/g, '');

    // Formata e adiciona o prefixo R$
    let formatted = '';
    if (numbers) {
      const cents = parseInt(numbers, 10);
      const reais = cents / 100;
      formatted = `R$ ${reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    updateMensalidade(index, 'valor', formatted);
  };

  const handleAvulsaChange = (inputValue: string) => {
    // Remove tudo que não é número
    const numbers = inputValue.replace(/\D/g, '');

    // Formata e adiciona o prefixo R$
    let formatted = '';
    if (numbers) {
      const cents = parseInt(numbers, 10);
      const reais = cents / 100;
      formatted = `R$ ${reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    setUnitFormData(prev => ({
      ...prev,
      prices: { ...prev.prices, avulsa: formatted }
    }));
  };

  const updateMensalidade = (index: number, field: keyof UnitPrice, value: string) => {
    setUnitFormData(prev => ({
      ...prev,
      prices: {
        ...prev.prices,
        mensalidade: prev.prices.mensalidade.map((m, i) =>
          i === index ? { ...m, [field]: value } : m
        ),
      },
    }));
  };

  const removeMensalidade = (index: number) => {
    setUnitFormData(prev => ({
      ...prev,
      prices: {
        ...prev.prices,
        mensalidade: prev.prices.mensalidade.filter((_, i) => i !== index),
      },
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

        {/* Units Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Unidades
                </CardTitle>
                <CardDescription>
                  Gerencie as unidades do CT (endereço, horários, preços, plataformas)
                </CardDescription>
              </div>
              <Button onClick={openNewUnit} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Unidade
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {units.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma unidade cadastrada
                </p>
              ) : (
                units.map((unit) => (
                  <Card key={unit.id} className="bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{unit.name}</h3>
                            <Badge variant={unit.isActive ? "default" : "secondary"}>
                              {unit.isActive ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{unit.address}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {unit.platforms?.map((platform, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {platform}
                              </Badge>
                            ))}
                          </div>
                          {unit.prices?.avulsa && (
                            <p className="text-sm text-muted-foreground">
                              Aula avulsa: {unit.prices.avulsa}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditUnit(unit)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteUnit(unit)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>

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

      {/* Unit Edit Dialog */}
      <Dialog open={editingUnit !== null || isNewUnit} onOpenChange={(open) => !open && closeUnitDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isNewUnit ? "Nova Unidade" : `Editar ${editingUnit?.name}`}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados da unidade
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Slug (identificador único)</Label>
                <Input
                  value={unitFormData.slug}
                  onChange={(e) => setUnitFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase() }))}
                  placeholder="recreio"
                  disabled={!isNewUnit}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={unitFormData.name}
                  onChange={(e) => setUnitFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Unidade Recreio"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Endereço</Label>
              <Textarea
                value={unitFormData.address}
                onChange={(e) => setUnitFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Endereço completo da unidade"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Local/Bairro</Label>
                <Input
                  value={unitFormData.location}
                  onChange={(e) => setUnitFormData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Recreio dos Bandeirantes"
                />
              </div>
              <div className="space-y-2">
                <Label>Dias de Funcionamento</Label>
                <Input
                  value={unitFormData.workingDays}
                  onChange={(e) => setUnitFormData(prev => ({ ...prev, workingDays: e.target.value }))}
                  placeholder="Segunda a Sexta"
                />
              </div>
            </div>

            {/* Schedules */}
            <div className="space-y-2">
              <Label>Horários das Aulas</Label>
              <div className="flex gap-2">
                <Input
                  value={newSchedule}
                  onChange={(e) => setNewSchedule(e.target.value)}
                  placeholder="17:30 às 18:30"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSchedule())}
                />
                <Button type="button" onClick={addSchedule} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {unitFormData.schedules.map((schedule, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1">
                    {schedule}
                    <button onClick={() => removeSchedule(i)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Schedule Text (detailed) */}
            <div className="space-y-2">
              <Label>Horários Detalhados (texto)</Label>
              <p className="text-xs text-muted-foreground">Para horários mais complexos, adicione linha por linha</p>
              <div className="flex gap-2">
                <Input
                  value={newScheduleText}
                  onChange={(e) => setNewScheduleText(e.target.value)}
                  placeholder="SEGUNDA E SEXTA: 7h às 8h - Livre"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addScheduleText())}
                />
                <Button type="button" onClick={addScheduleText} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1 mt-2">
                {unitFormData.schedulesText.map((text, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                    <span className="flex-1">{text}</span>
                    <button onClick={() => removeScheduleText(i)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Saturday Class */}
            <div className="space-y-2">
              <Label>Aula de Sábado (opcional)</Label>
              <Input
                value={unitFormData.saturdayClass}
                onChange={(e) => setUnitFormData(prev => ({ ...prev, saturdayClass: e.target.value }))}
                placeholder="Sábado: Aulão das 7h às 8h"
              />
            </div>

            {/* Prices */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Mensalidades</Label>
                <Button type="button" onClick={addMensalidade} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {unitFormData.prices.mensalidade.map((m, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={m.frequencia}
                      onChange={(e) => updateMensalidade(i, 'frequencia', e.target.value)}
                      placeholder="1x por semana"
                      className="flex-1"
                    />
                    <Input
                      value={m.valor}
                      onChange={(e) => handleValorChange(i, e.target.value)}
                      placeholder="R$ 100,00"
                      className="w-32"
                      inputMode="numeric"
                    />
                    <button onClick={() => removeMensalidade(i)} className="hover:text-destructive p-2">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Valor Aula Avulsa</Label>
              <Input
                value={unitFormData.prices.avulsa}
                onChange={(e) => handleAvulsaChange(e.target.value)}
                placeholder="R$ 30,00"
                inputMode="numeric"
              />
            </div>

            {/* Platforms */}
            <div className="space-y-2">
              <Label>Plataformas de Check-in</Label>
              <div className="flex gap-2">
                <Input
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                  placeholder="Wellhub (Gympass)"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPlatform())}
                />
                <Button type="button" onClick={addPlatform} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {unitFormData.platforms.map((platform, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center gap-1">
                    {platform}
                    <button onClick={() => removePlatform(i)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* WhatsApp Group */}
            <div className="space-y-2">
              <Label>ID do Grupo WhatsApp</Label>
              <Input
                value={unitFormData.whatsappGroupId}
                onChange={(e) => setUnitFormData(prev => ({ ...prev, whatsappGroupId: e.target.value }))}
                placeholder="120363208643524067@g.us"
              />
              <p className="text-xs text-muted-foreground">
                ID do grupo para envio de enquetes
              </p>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Unidade Ativa</Label>
                <p className="text-sm text-muted-foreground">
                  Unidades inativas não aparecem no menu do bot
                </p>
              </div>
              <Switch
                checked={unitFormData.isActive}
                onCheckedChange={(checked) =>
                  setUnitFormData(prev => ({ ...prev, isActive: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeUnitDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSaveUnit} disabled={savingUnit}>
              {savingUnit ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Unidade
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
