"use client";

import { useEffect, useState, useCallback } from "react";
import { Pencil, Trash2, Plus, X, Check, Loader2 } from "lucide-react";

type Item = { id: string; label: string; description?: string | null };

type Props = {
  title: string;
  apiPath: string;
};

export default function DynamicTable({ title, apiPath }: Props) {
  const [items, setItems]         = useState<Item[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState({ label: "", description: "" });
  const [newForm, setNewForm]     = useState({ label: "", description: "" });
  const [showAdd, setShowAdd]     = useState(false);
  const [error, setError]         = useState("");

  // ✅ wrap in useCallback so useEffect dependency is stable
  const load = useCallback(() => {
    fetch(apiPath)
      .then(r => r.json())
      .then(d => { setItems(d); setLoading(false); });
  }, [apiPath]);

  useEffect(() => { load(); }, [load]); // ✅ no more warning

  const handleAdd = async () => {
    if (!newForm.label.trim()) { setError("Label is required"); return; }
    setSaving(true);
    await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    setNewForm({ label: "", description: "" });
    setShowAdd(false);
    setError("");
    setSaving(false);
    load();
  };

  const handleEdit = async (id: string) => {
    if (!editForm.label.trim()) { setError("Label is required"); return; }
    setSaving(true);
    await fetch(`${apiPath}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    setError("");
    setSaving(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete this ${title.toLowerCase()}?`)) return;
    await fetch(`${apiPath}/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-muted-foreground" size={28} />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{items.length} {title.toLowerCase()} total</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(""); }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm mb-3 bg-red-50 dark:bg-red-950 px-3 py-2 rounded-md">{error}</p>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="border rounded-xl p-4 mb-4 flex flex-col gap-3 bg-muted/40">
          <p className="text-sm font-medium">New {title}</p>
          <input
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Label *"
            value={newForm.label}
            onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))}
          />
          <input
            className="border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Description (optional)"
            value={newForm.description}
            onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(""); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition-colors"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-xl">
          <p className="text-sm">No {title.toLowerCase()} yet. Add one above.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <div key={item.id} className="border rounded-xl px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
              {editingId === item.id ? (
                <div className="flex flex-col gap-2 flex-1 mr-3">
                  <input
                    className="border rounded-lg px-2 py-1.5 text-sm bg-background"
                    value={editForm.label}
                    onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                  />
                  <input
                    className="border rounded-lg px-2 py-1.5 text-sm bg-background"
                    value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
              ) : (
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 shrink-0">
                {editingId === item.id ? (
                  <>
                    <button
                      onClick={() => handleEdit(item.id)}
                      disabled={saving}
                      className="text-green-600 hover:text-green-700 p-1 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                    <button onClick={() => { setEditingId(null); setError(""); }} className="text-gray-400 hover:text-gray-600 p-1">
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditingId(item.id); setEditForm({ label: item.label, description: item.description ?? "" }); }}
                      className="text-blue-500 hover:text-blue-700 p-1"
                    >
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}