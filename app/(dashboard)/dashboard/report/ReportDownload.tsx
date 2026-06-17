"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, FileSpreadsheet, Loader2,
  User as UserIcon, Download,
} from "lucide-react";
import toast from "react-hot-toast";
import Image from "next/image";

type UserItem = {
  id:    string;
  name:  string | null;
  email: string | null;
  image: string | null;
};

type Props = {
  users: UserItem[];
};

const YEARS = ["2026", "2025", "2024", "2023"];

export default function ReportDownload({ users }: Props) {
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<UserItem | null>(null);
  const [year,     setYear]     = useState("2026");
  const [loading,  setLoading]  = useState(false);

  const filtered = search.trim().length === 0
    ? []
    : users.filter((u) =>
        (u.name  ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.email ?? "").toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8);

  function pickUser(u: UserItem) {
    setSelected(u);
    setSearch("");
  }

  async function handleDownload() {
    if (!selected) return;
    setLoading(true);
    const toastId = toast.loading("កំពុងបង្កើតរបាយការណ៍...");

    try {
      const res = await fetch(
        `/api/leave/export/${encodeURIComponent(selected.email ?? "")}?year=${year}`
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error ?? "Export failed");
      }

      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href         = url;
      a.download     = `leave-card-${selected.name ?? selected.email ?? "user"}-${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`✅ បានទាញយករបាយការណ៍ ${selected.name}`, { id: toastId, duration: 4000 });
    } catch (err: any) {
      toast.error(err.message ?? "Export failed", { id: toastId });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">

      {/* ── Title ── */}
      <div>
        <h1 className="text-2xl font-bold">របាយការណ៍ច្បាប់បុគ្គលិក</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Employee Leave Report — Search and download individual leave card
        </p>
      </div>

      {/* ── Search box ── */}
      <div className="space-y-2">
        <label className="text-sm font-medium">ស្វែងរកបុគ្គលិក</label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="វាយឈ្មោះ ឬអ៊ីម៉ែល..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(null);
            }}
            className="pl-9"
          />
        </div>

        {/* ── Dropdown results ── */}
        {filtered.length > 0 && (
          <div className="rounded-md border bg-popover shadow-md overflow-hidden divide-y">
            {filtered.map((u) => (
              <button
                key={u.id}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left"
                onClick={() => pickUser(u)}
              >
                {u.image ? (
                  <Image
                    src={u.image}
                    alt={u.name ?? ""}
                    width={32}
                    height={32}
                    className="rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">{u.name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {search.trim().length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground px-1">រកមិនឃើញបុគ្គលិក</p>
        )}
      </div>

      {/* ── Selected employee card ── */}
      {selected && (
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center gap-4">
            {selected.image ? (
              <Image
                src={selected.image}
                alt={selected.name ?? ""}
                width={48}
                height={48}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <UserIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="font-semibold text-base">{selected.name}</p>
              <p className="text-sm text-muted-foreground">{selected.email}</p>
            </div>
            <Badge variant="outline" className="ml-auto text-green-600 border-green-200 bg-green-50">
              បានជ្រើស
            </Badge>
          </div>

          {/* ── Year picker ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium">ជ្រើសឆ្នាំ</label>
            <div className="flex gap-2 flex-wrap">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    year === y
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* ── Download button ── */}
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 h-10"
            onClick={handleDownload}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                កំពុងបង្កើត Excel...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                <Download className="h-4 w-4" />
                ទាញយក បណ្ណច្បាប់ {selected.name} · {year}
              </>
            )}
          </Button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!selected && search.trim().length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center space-y-2">
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-muted-foreground">
            វាយឈ្មោះបុគ្គលិកខាងលើដើម្បីស្វែងរក
          </p>
          <p className="text-xs text-muted-foreground">
            បន្ទាប់ពីជ្រើសបុគ្គលិក អ្នកអាចទាញយកបណ្ណច្បាប់ Excel
          </p>
        </div>
      )}

    </div>
  );
}