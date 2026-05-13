"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
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

type Props = { allUsers: UserOption[] };

export default function CreateTeamModal({ allUsers }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [moderatorId, setModeratorId] = useState("");
  const [memberEmails, setMemberEmails] = useState<string[]>([]);

  const moderators = allUsers.filter((u) => u.role === "MODERATOR");
  const regularUsers = allUsers.filter((u) => u.role === "USER");

  const toggleMember = (email: string) => {
    setMemberEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  async function handleSubmit() {
    if (!name || !department || !moderatorId) {
      toast.error("សូមបំពេញព័ត៌មានទាំងអស់");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, department, moderatorId, memberEmails }),
      });
      if (res.ok) {
        toast.success("បង្កើតក្រុមបានជោគជ័យ!");
        setOpen(false);
        setName(""); setDepartment(""); setModeratorId(""); setMemberEmails([]);
        router.refresh();
      } else {
        toast.error("មានបញ្ហាកើតឡើង");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />បង្កើតក្រុម</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>បង្កើតក្រុមថ្មី</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">

          <div className="space-y-1">
            <Label>ឈ្មោះក្រុម</Label>
            <Input placeholder="e.g. IT Team" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>ផ្នែក (Department)</Label>
            <Input placeholder="e.g. IT" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>

          {/* ✅ Native select — no shadcn/ui Select needed */}
          <div className="space-y-1">
            <Label>Moderator (ប្រធានផ្នែក)</Label>
            <select
              value={moderatorId}
              onChange={(e) => setModeratorId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">ជ្រើសរើស Moderator</option>
              {moderators.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.department ?? "គ្មានផ្នែក"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>សមាជិក (Members)</Label>
            <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1">
              {regularUsers.map((u) => (
                <div
                  key={u.id}
                  onClick={() => toggleMember(u.email ?? "")}
                  className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors
                    ${memberEmails.includes(u.email ?? "")
                      ? "bg-blue-50 dark:bg-blue-900/30"
                      : "hover:bg-muted"}`}
                >
                  <span className="text-sm">
                    {u.name}{" "}
                    <span className="text-muted-foreground text-xs">({u.department ?? "—"})</span>
                  </span>
                  {memberEmails.includes(u.email ?? "") && (
                    <Badge className="bg-blue-600 text-white text-xs">✓</Badge>
                  )}
                </div>
              ))}
            </div>
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

          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? "កំពុងបង្កើត..." : "បង្កើតក្រុម"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}