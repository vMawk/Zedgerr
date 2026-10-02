import { useEffect, useMemo, useState } from "react";
import { useOpenOnNew } from "@/hooks/use-open-on-new";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Lead, LeadStatus } from "@/lib/db-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  emailed: "Emailed",
  received_answer: "Replied",
  no_response: "No response",
  follow_up: "Follow up",
  converted: "Converted to client",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  emailed: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  received_answer: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  no_response: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  follow_up: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  converted: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  rejected: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};

const ALL_STATUSES: LeadStatus[] = ["new", "emailed", "received_answer", "no_response", "follow_up", "converted", "rejected"];

const emptyForm: Partial<Lead> = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  website: "",
  status: "new",
  notes: "",
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [form, setForm] = useState<Partial<Lead>>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useOpenOnNew(setOpen);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");

  const fetchLeads = async () => {
    const data = await api.getLeads();
    setLeads(data);
  };

  useEffect(() => {
    if (user) fetchLeads();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (
        q &&
        !l.company_name.toLowerCase().includes(q) &&
        !(l.contact_name ?? "").toLowerCase().includes(q) &&
        !(l.email ?? "").toLowerCase().includes(q) &&
        !(l.notes ?? "").toLowerCase().includes(q)
      ) return false;
      return true;
    });
  }, [leads, statusFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const updateField = (field: string, value: string | null | undefined) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!user || !form.company_name?.trim()) {
      toast({ title: "Enter a company name", variant: "destructive" });
      return;
    }
    try {
      const payload = {
        ...form,
        company_name: form.company_name.trim(),
        contact_name: form.contact_name?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        website: form.website?.trim() || null,
        notes: form.notes?.trim() || null,
        status: form.status ?? "new",
      };
      if (editId) {
        await api.updateLead(editId, payload);
        toast({ title: "Lead updated" });
      } else {
        await api.createLead(payload as Partial<Lead> & { company_name: string });
        toast({ title: "Lead added" });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      fetchLeads();
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleEdit = (lead: Lead) => {
    setForm({
      company_name: lead.company_name,
      contact_name: lead.contact_name ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      website: lead.website ?? "",
      status: lead.status,
      notes: lead.notes ?? "",
    });
    setEditId(lead.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    await api.deleteLead(id);
    fetchLeads();
    toast({ title: "Lead deleted" });
  };

  const handleQuickStatus = async (lead: Lead, status: LeadStatus) => {
    try {
      await api.updateLead(lead.id, { status });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setForm(emptyForm);
              setEditId(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit lead" : "New lead"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Company name *</Label>
                <Input
                  placeholder="e.g. Acme Ltd"
                  value={form.company_name || ""}
                  onChange={(e) => updateField("company_name", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Contact person</Label>
                  <Input
                    placeholder="Optional"
                    value={form.contact_name || ""}
                    onChange={(e) => updateField("contact_name", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status ?? "new"}
                    onValueChange={(v) => updateField("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="Optional"
                    value={form.email || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="Optional"
                    value={form.phone || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Website</Label>
                <Input
                  placeholder="e.g. https://acme.com"
                  value={form.website || ""}
                  onChange={(e) => updateField("website", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Optional"
                  rows={3}
                  value={form.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value)}
                />
              </div>
              <Button onClick={handleSave}>{editId ? "Save" : "Add"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            statusFilter === "all"
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({leads.length})
        </button>
        {ALL_STATUSES.filter((s) => counts[s]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? `${STATUS_COLORS[s]} opacity-100`
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {STATUS_LABELS[s]} ({counts[s]})
          </button>
        ))}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <Input
            placeholder="Search by company, contact, email or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mb-4" />
            <p>No leads found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="min-w-[160px]">
                          <p className="font-medium">{lead.company_name}</p>
                          {lead.website && (
                            <a
                              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground truncate block max-w-[200px]"
                            >
                              {lead.website}
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 min-w-[140px]">
                          {lead.contact_name && <p className="text-sm">{lead.contact_name}</p>}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="text-xs text-muted-foreground hover:text-foreground block">
                              {lead.email}
                            </a>
                          )}
                          {lead.phone && <p className="text-xs text-muted-foreground">{lead.phone}</p>}
                          {!lead.contact_name && !lead.email && !lead.phone && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={lead.status}
                          onValueChange={(v) => handleQuickStatus(lead, v as LeadStatus)}
                        >
                          <SelectTrigger className="w-auto h-auto border-0 p-0 shadow-none focus:ring-0 [&>svg]:hidden">
                            <StatusBadge status={lead.status} />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-muted-foreground max-w-[200px] line-clamp-2">
                          {lead.notes || "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(lead.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(lead)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(lead.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
