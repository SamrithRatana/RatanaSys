"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, ChevronDown, ChevronUp, X } from "lucide-react";
import toast from "react-hot-toast";

type Member = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  title?: string | null;
  balances?: {
    annualAvailable?: number | null;
    sickAvailable?: number | null;
    personalAvailable?: number | null;
  } | null;
};

type Moderator = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type Team = {
  id: string;
  name: string;
  department: string;
  moderators: Moderator[];
  members: Member[];
};

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  department: string | null;
};

type Department = { id: string; label: string };

type Props = {
  teams: Team[];
  currentUserRole: string;
  allUsers?: UserOption[];
  departments?: Department[];
};

export default function TeamsTable({
  teams,
  currentUserRole,
  allUsers = [],
  departments = [],
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [editDepartment, setEditDepartment] = useState("");
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const regularUsers = allUsers.filter((u) => u.role === "USER");

  // ✅ Auto moderators for edit modal
  const editAutoModerators = allUsers.filter(
    (u) => u.role === "MODERATOR" && u.department === editDepartment
  );

  function openEdit(team: Team) {
    setEditTeam(team);
    setEditDepartment(team.department);
    setMemberEmails(team.members.map((m) => m.email ?? "").filter(Boolean));
  }

  function closeEdit() {
    setEditTeam(null);
    setEditDepartment("");
    setMemberEmails([]);
  }

  const toggleMember = (email: string) => {
    setMemberEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  async function handleEdit() {
    if (!editTeam) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${editTeam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${editDepartment} Team`,
          department: editDepartment,
          memberEmails,
        }),
      });
      if (res.ok) {
        toast.success("កែប្រែក្រុមបានជោគជ័យ!");
        closeEdit();
        router.refresh();
      } else {
        toast.error("មានបញ្ហាកើតឡើង");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("លុបក្រុមបានជោគជ័យ!");
        setDeleteId(null);
        router.refresh();
      } else {
        toast.error("មានបញ្ហាកើតឡើង");
      }
    } finally {
      setLoading(false);
    }
  }

  const availableMembers = editDepartment
    ? regularUsers.filter((u) => u.department === editDepartment)
    : [];
  const otherMembers = editDepartment
    ? regularUsers.filter((u) => u.department !== editDepartment)
    : regularUsers;

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        មិនទាន់មានក្រុមណាមួយទេ
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {teams.map((team) => (
          <Card key={team.id} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-3 cursor-pointer flex-1"
                  onClick={() => setExpanded(expanded === team.id ? null : team.id)}
                >
                  <CardTitle className="text-lg">{team.name}</CardTitle>
                  <Badge variant="outline">{team.department}</Badge>
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40">
                    {team.members.length} នាក់
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  {currentUserRole === "ADMIN" && (
                    <>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => openEdit(team)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => setDeleteId(team.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setExpanded(expanded === team.id ? null : team.id)}
                  >
                    {expanded === team.id
                      ? <ChevronUp className="h-5 w-5" />
                      : <ChevronDown className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              {/* ✅ Show all moderators */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {team.moderators.length > 0 ? (
                  team.moderators.map((mod) => (
                    <div key={mod.id} className="flex items-center gap-1">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={mod.image ?? ""} />
                        <AvatarFallback>{mod.name?.[0] ?? "M"}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">
                        <strong>{mod.name}</strong>
                        <Badge className="ml-1 text-xs bg-indigo-100 text-indigo-700">Moderator</Badge>
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-amber-500">⚠️ មិនទាន់មាន Moderator</span>
                )}
              </div>
            </CardHeader>

            {/* Members table */}
            {expanded === team.id && (
              <CardContent className="pt-0">
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-4 py-2">បុគ្គលិក</th>
                        <th className="text-left px-4 py-2">តួនាទី</th>
                        <th className="text-center px-4 py-2">Annual</th>
                        <th className="text-center px-4 py-2">Sick</th>
                        <th className="text-center px-4 py-2">Personal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-4 text-muted-foreground text-xs">
                            មិនទាន់មានសមាជិក
                          </td>
                        </tr>
                      ) : (
                        team.members.map((m, i) => (
                          <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={m.image ?? ""} />
                                  <AvatarFallback>{m.name?.[0] ?? "U"}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium">{m.name ?? "—"}</p>
                                  <p className="text-xs text-muted-foreground">{m.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{m.title ?? "—"}</td>
                            <td className="px-4 py-2 text-center">
                              <Badge variant="outline">{m.balances?.annualAvailable ?? 0} ថ្ងៃ</Badge>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <Badge variant="outline">{m.balances?.sickAvailable ?? 0} ថ្ងៃ</Badge>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <Badge variant="outline">{m.balances?.personalAvailable ?? 0} ថ្ងៃ</Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editTeam} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>កែប្រែក្រុម — {editTeam?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">

            {/* Department select */}
            <div className="space-y-1">
              <Label>ផ្នែក (Department)</Label>
              <select
                value={editDepartment}
                onChange={(e) => {
                  setEditDepartment(e.target.value);
                  setMemberEmails([]);
                }}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">ជ្រើសរើស Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.label}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Auto moderators */}
            <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
              <p className="font-medium text-muted-foreground">👤 Moderator (Auto)</p>
              {editAutoModerators.length > 0 ? (
                editAutoModerators.map((m) => (
                  <Badge key={m.id} className="bg-blue-600 text-white mr-1">{m.name}</Badge>
                ))
              ) : (
                <p className="text-amber-500 text-xs">⚠️ មិនទាន់មាន Moderator</p>
              )}
            </div>

            {/* Members */}
            <div className="space-y-2">
              <Label>សមាជិក (Members)</Label>

              {availableMembers.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">ក្នុង {editDepartment}</p>
                  <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
                    {availableMembers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => toggleMember(u.email ?? "")}
                        className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors
                          ${memberEmails.includes(u.email ?? "") ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-muted"}`}
                      >
                        <span className="text-sm">{u.name}</span>
                        {memberEmails.includes(u.email ?? "") && (
                          <Badge className="bg-blue-600 text-white text-xs">✓</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {otherMembers.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">ផ្នែកផ្សេង</p>
                  <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
                    {otherMembers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => toggleMember(u.email ?? "")}
                        className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors
                          ${memberEmails.includes(u.email ?? "") ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-muted"}`}
                      >
                        <span className="text-sm">
                          {u.name}
                          <span className="text-xs text-muted-foreground ml-1">({u.department ?? "—"})</span>
                        </span>
                        {memberEmails.includes(u.email ?? "") && (
                          <Badge className="bg-blue-600 text-white text-xs">✓</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {memberEmails.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memberEmails.map((email) => {
                    const u = regularUsers.find((u) => u.email === email);
                    return (
                      <Badge key={email} variant="outline" className="gap-1">
                        {u?.name ?? email}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => toggleMember(email)} />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <Button className="w-full" onClick={handleEdit} disabled={loading}>
              {loading ? "កំពុងរក្សាទុក..." : "រក្សាទុក"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Modal */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>បញ្ជាក់ការលុប</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            តើអ្នកពិតជាចង់លុបក្រុមនេះមែនទេ? សកម្មភាពនេះមិនអាចប្រឈប់បានទេ។
          </p>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>
              បោះបង់
            </Button>
            <Button
              variant="destructive" className="flex-1"
              disabled={loading}
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              {loading ? "កំពុងលុប..." : "លុប"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}