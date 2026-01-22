"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Shield,
  Crown,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  Mail,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";

interface AdminUser {
  id: string;
  prismaId: string | null;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  isOwner: boolean;
  subscriptionStatus: "FREE" | "PRO";
  dealsCount: number;
  createdAt: number;
  lastSignInAt: number | null;
  inPrisma: boolean;
}

interface UsersResponse {
  data: AdminUser[];
  totalCount: number;
  limit: number;
  offset: number;
}

async function fetchUsers(): Promise<UsersResponse> {
  const response = await fetch("/api/admin/users");
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to fetch users");
  }
  return response.json();
}

async function updateUser(
  userId: string,
  data: {
    subscriptionStatus?: "FREE" | "PRO";
    role?: "admin" | "user";
    isOwner?: boolean;
  }
) {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to update user");
  }
  return response.json();
}

async function deleteUser(userId: string) {
  const response = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to delete user");
  }
  return response.json();
}

async function sendPasswordReset(userId: string) {
  const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error ?? "Failed to send password reset");
  }
  return response.json();
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

function SubscriptionBadge({
  status,
}: {
  status: "FREE" | "PRO";
}) {
  return status === "PRO" ? (
    <Badge className="bg-gradient-to-r from-amber-500 to-orange-600 border-0">
      PRO
    </Badge>
  ) : (
    <Badge variant="secondary">FREE</Badge>
  );
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [deleteDialogUser, setDeleteDialogUser] = useState<AdminUser | null>(null);
  const [editDialogUser, setEditDialogUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<{
    subscriptionStatus: "FREE" | "PRO";
    role: "admin" | "user";
    isOwner: boolean;
  }>({ subscriptionStatus: "FREE", role: "user", isOwner: false });

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: fetchUsers,
    staleTime: 30 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
      toast.success("Utilisateur mis à jour");
      setEditDialogUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
      toast.success("Utilisateur supprimé");
      setDeleteDialogUser(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetMutation = useMutation({
    mutationFn: sendPasswordReset,
    onSuccess: (data) => {
      toast.info(data.message, {
        description: `Email: ${data.email}`,
        duration: 10000,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleOpenEdit = useCallback((user: AdminUser) => {
    setEditDialogUser(user);
    setEditForm({
      subscriptionStatus: user.subscriptionStatus,
      role: user.role as "admin" | "user",
      isOwner: user.isOwner,
    });
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editDialogUser) return;
    updateMutation.mutate({
      userId: editDialogUser.id,
      data: editForm,
    });
  }, [editDialogUser, editForm, updateMutation]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, admins: 0, pro: 0, free: 0 };
    return {
      total: data.data.length,
      admins: data.data.filter((u) => u.role === "admin").length,
      pro: data.data.filter((u) => u.subscriptionStatus === "PRO").length,
      free: data.data.filter((u) => u.subscriptionStatus === "FREE").length,
    };
  }, [data]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-lg font-medium">Erreur de chargement</p>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <Button onClick={handleRefresh}>Réessayer</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestion des utilisateurs</h1>
          <p className="text-muted-foreground">
            Gérer les utilisateurs, abonnements et permissions
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total utilisateurs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.admins}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pro</CardTitle>
            <Crown className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pro}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Free</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.free}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Utilisateurs</CardTitle>
          <CardDescription>
            Liste de tous les utilisateurs inscrits sur la plateforme
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Abonnement</TableHead>
                  <TableHead>Deals</TableHead>
                  <TableHead>Dernière connexion</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.image ?? undefined} />
                          <AvatarFallback>
                            {getInitials(user.name, user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {user.name || "Sans nom"}
                            {user.isOwner && (
                              <Crown className="h-3.5 w-3.5 text-amber-500" />
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.role === "admin" ? (
                        <Badge variant="outline" className="border-blue-500 text-blue-500">
                          <Shield className="mr-1 h-3 w-3" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">User</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <SubscriptionBadge status={user.subscriptionStatus} />
                    </TableCell>
                    <TableCell>{user.dealsCount}</TableCell>
                    <TableCell>
                      {user.lastSignInAt
                        ? formatDistanceToNow(new Date(user.lastSignInAt), {
                            addSuffix: true,
                            locale: fr,
                          })
                        : "Jamais"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenEdit(user)}>
                            <Shield className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => resetMutation.mutate(user.id)}
                            disabled={resetMutation.isPending}
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            Reset mot de passe
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteDialogUser(user)}
                            disabled={user.isOwner}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editDialogUser} onOpenChange={() => setEditDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'utilisateur</DialogTitle>
            <DialogDescription>
              {editDialogUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Abonnement</label>
              <Select
                value={editForm.subscriptionStatus}
                onValueChange={(v) =>
                  setEditForm((f) => ({
                    ...f,
                    subscriptionStatus: v as "FREE" | "PRO",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">FREE</SelectItem>
                  <SelectItem value="PRO">PRO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rôle</label>
              <Select
                value={editForm.role}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, role: v as "admin" | "user" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Owner</label>
              <Button
                variant={editForm.isOwner ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setEditForm((f) => ({ ...f, isOwner: !f.isOwner }))
                }
              >
                {editForm.isOwner ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Oui
                  </>
                ) : (
                  <>
                    <X className="mr-2 h-4 w-4" /> Non
                  </>
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogUser(null)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialogUser} onOpenChange={() => setDeleteDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l'utilisateur</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer {deleteDialogUser?.email} ?
              Cette action est irréversible et supprimera également tous ses deals.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogUser(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDialogUser && deleteMutation.mutate(deleteDialogUser.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
