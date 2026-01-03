"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit, Trash2, Shield, User as UserIcon, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getUnits,
  User,
  Unit,
  USER_ROLES,
  getCachedUser,
} from "@/lib/api";

export default function UsuariosContent() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    role: "gestor" as "admin" | "gestor",
    units: [] as string[],
    status: "active" as "active" | "inactive",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState("");

  // Check if current user is admin
  useEffect(() => {
    const currentUser = getCachedUser();
    if (!currentUser || currentUser.role !== "admin") {
      router.push("/");
    }
  }, [router]);

  // Fetch data
  const fetchData = async () => {
    try {
      const [usersData, unitsData] = await Promise.all([
        getUsers(),
        getUnits(),
      ]);
      setUsers(usersData);
      setUnits(unitsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      username: "",
      password: "",
      name: "",
      email: "",
      role: "gestor",
      units: [],
      status: "active",
    });
    setFormError("");
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: "",
      name: user.name,
      email: user.email || "",
      role: user.role,
      units: user.units,
      status: user.status,
    });
    setFormError("");
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleOpenDelete = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Validation
    if (!formData.username || !formData.name) {
      setFormError("Nome de usuário e nome são obrigatórios");
      return;
    }

    if (!editingUser && !formData.password) {
      setFormError("Senha é obrigatória para novos usuários");
      return;
    }

    if (formData.password && formData.password.length < 4) {
      setFormError("Senha deve ter pelo menos 4 caracteres");
      return;
    }

    setSaving(true);

    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          username: formData.username,
          password: formData.password || undefined,
          name: formData.name,
          email: formData.email || undefined,
          role: formData.role,
          units: formData.units,
          status: formData.status,
        });
      } else {
        await createUser({
          username: formData.username,
          password: formData.password,
          name: formData.name,
          email: formData.email || undefined,
          role: formData.role,
          units: formData.units,
        });
      }

      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving user:", error);
      setFormError(error instanceof Error ? error.message : "Erro ao salvar usuário");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    try {
      await deleteUser(userToDelete.id);
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting user:", error);
      alert(error instanceof Error ? error.message : "Erro ao excluir usuário");
    }
  };

  const toggleUnit = (slug: string) => {
    setFormData((prev) => ({
      ...prev,
      units: prev.units.includes(slug)
        ? prev.units.filter((u) => u !== slug)
        : [...prev.units, slug],
    }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getUnitName = (slug: string) => {
    const unit = units.find((u) => u.slug === slug);
    return unit?.name || slug;
  };

  if (loading) {
    return (
      <DashboardLayout title="Usuários">
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Usuários">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Gestão de Usuários</h2>
            <p className="text-sm text-muted-foreground">
              Gerencie os usuários que podem acessar o painel
            </p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>

        {/* Info Card */}
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-500">Sobre as permissões</p>
              <p className="text-muted-foreground">
                <strong>Administradores</strong> têm acesso total ao sistema, incluindo esta página de usuários.{" "}
                <strong>Gestores</strong> só podem ver informações das unidades que estão atribuídas a eles.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <div className="grid gap-4">
          {users.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum usuário cadastrado
              </CardContent>
            </Card>
          ) : (
            users.map((user) => (
              <Card key={user.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        user.role === "admin" ? "bg-yellow-500/20" : "bg-primary/20"
                      }`}>
                        {user.role === "admin" ? (
                          <Shield className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <UserIcon className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{user.name}</h3>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {user.role === "admin" ? "Administrador" : "Gestor"}
                          </Badge>
                          <Badge variant={user.status === "active" ? "outline" : "destructive"}>
                            {user.status === "active" ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                        {user.email && (
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        )}
                        {user.role === "gestor" && user.units.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {user.units.map((slug) => (
                              <Badge key={slug} variant="outline" className="text-xs">
                                {getUnitName(slug)}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Criado em {formatDate(user.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(user)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDelete(user)}
                        className="text-red-500 hover:text-red-600"
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
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar Usuário" : "Novo Usuário"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Atualize as informações do usuário"
                : "Preencha as informações do novo usuário"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Nome de Usuário *</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                placeholder="nome.usuario"
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

            <div className="space-y-2">
              <Label htmlFor="password">
                Senha {editingUser ? "(deixe em branco para manter)" : "*"}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? "Nova senha" : "Senha"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Tipo *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as "admin" | "gestor" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.role === "gestor" && (
              <div className="space-y-2">
                <Label>Unidades que pode acessar</Label>
                <div className="flex flex-wrap gap-2">
                  {units.map((unit) => (
                    <Badge
                      key={unit.slug}
                      variant={formData.units.includes(unit.slug) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleUnit(unit.slug)}
                    >
                      {unit.name}
                    </Badge>
                  ))}
                </div>
                {formData.units.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Selecione pelo menos uma unidade
                  </p>
                )}
              </div>
            )}

            {editingUser && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as "active" | "inactive" })}
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
            )}

            {formError && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : editingUser ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário{" "}
              <strong>{userToDelete?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
