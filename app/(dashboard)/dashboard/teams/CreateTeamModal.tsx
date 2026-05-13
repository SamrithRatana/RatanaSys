"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  department: string | null;
};

type Department = { id: string; label: string };
type Props = { allUsers: UserOption[]; departments: Department[] };

export default function CreateTeamModal({ allUsers, departments }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [department, setDepartment] = useState("");
  const [memberEmails, setMemberEmails] = useState<string[]>([]);

  const regularUsers = allUsers.filter((u) => u.role === "USER");

  // ✅ Auto moderators from selected department
  const autoModerators = allUsers.filter(
    (u) => u.role === "MODERATOR" && u.department === department
  );

  const toggleMember = (email: string) => {
    setMemberEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const handleDepartmentChange = (val: string) => {
    setDepartment(val);
    setMemberEmails([]);
  };

  async function handleSubmit() {
    if (!department) {
      toast.error("សូមជ្រើស Department");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${department} Team`,
          department,
          memberEmails,
        }),
      });
      if (res.ok) {
        toast.success("បង្កើតក្រុមបានជោគជ័យ!");
        setOpen(false);
        setDepartment("");
        setMemberEmails([]);
        router.refresh();
      } else {
        toast.error("មានបញ្ហាកើតឡើង");
      }
    } finally {
      setLoading(false);
    }
  }

  const availableMembers = department
    ? regularUsers.filter((u) => u.department === department)
    : [];
  const otherMembers = department
    ? regularUsers.filter((u) => u.department !== department)
    : regularUsers;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />បង្កើតក្រុម</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>បង្កើតក្រុមថ្មី</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">

          {/* Department */}
          <div className="space-y-1">
            <Label>ផ្នែក (Department)</Label>
            <select
              value={department}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">ជ្រើសរើស Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.label}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* ✅ Auto moderators display */}
          {department && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
              <p className="font-medium text-muted-foreground">👤 Moderator (Auto)</p>
              {autoModerators.length > 0 ? (
                autoModerators.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <Badge className="bg-blue-600 text-white">{m.name}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-amber-500 text-xs">⚠️ មិនទាន់មាន Moderator សម្រាប់ {department} ទេ</p>
              )}
            </div>
          )}

          {/* Members */}
          {department && (
            <div className="space-y-2">
              <Label>សមាជិក (Members)</Label>

              {availableMembers.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">ក្នុង {department}</p>
                  <div className="border rounded-md p-3 max-h-36 overflow-y-auto space-y-1">
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
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={loading || !department}
          >
            {loading ? "កំពុងបង្កើត..." : "បង្កើតក្រុម"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}