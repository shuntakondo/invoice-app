"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getClients, getSettings, createClient, createInvoice,
  Client, BusinessSettings, Invoice,
} from "@/lib/api";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { HelpTip } from "@/components/HelpTip";

export interface LineItemDraft {
  description: string;
  quantity: string;
  unit_price: string;
  gst_rate: string;
}

export const emptyItem = (): LineItemDraft => ({ description: "", quantity: "1", unit_price: "", gst_rate: "10" });

export interface InvoiceFormInitial {
  client_id?: string;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  items?: LineItemDraft[];
  suggestedNewClient?: { name: string } | null;
}

export interface InvoiceFormProps {
  initial?: InvoiceFormInitial;
  onCreated?: (inv: Invoice) => void;  // called after a successful create (else navigates)
  onCancel?: () => void;
  submitLabel?: string;
  compact?: boolean;                    // tighter layout for the side drawer
}

const today = () => new Date().toISOString().split("T")[0];
const plusDays = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().split("T")[0];

export default function InvoiceForm({ initial, onCreated, onCancel, submitLabel = "Create Invoice", compact = false }: InvoiceFormProps) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [suggestedClient, setSuggestedClient] = useState<{ name: string } | null>(initial?.suggestedNewClient ?? null);

  const [form, setForm] = useState({
    client_id: initial?.client_id ?? "",
    issue_date: initial?.issue_date || today(),
    due_date: initial?.due_date || plusDays(14),
    notes: initial?.notes ?? "",
  });
  const [items, setItems] = useState<LineItemDraft[]>(
    initial?.items && initial.items.length > 0 ? initial.items : [emptyItem()]
  );

  useEffect(() => {
    Promise.all([getClients(), getSettings()]).then(([c, s]) => {
      setClients(c);
      setSettings(s);
    });
  }, []);

  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItemDraft, val: string) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: val };
    setItems(next);
  };

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
  const gst = items.reduce((s, it) => {
    const q = parseFloat(it.quantity) || 0;
    const p = parseFloat(it.unit_price) || 0;
    const r = parseFloat(it.gst_rate) || 0;
    return s + q * p * (r / 100);
  }, 0);
  const fmt = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

  const noProfile = settings && !settings.name;

  const submit = async () => {
    if (!form.client_id && !suggestedClient) { setError("Select a client"); return; }
    if (items.some((it) => !it.description || !(parseFloat(it.unit_price) > 0) || !(parseFloat(it.quantity) > 0))) {
      setError("Every line item needs a description, a quantity above 0, and a price above 0");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let clientId = form.client_id ? parseInt(form.client_id) : 0;
      if (!clientId && suggestedClient) {
        const c = await createClient({ name: suggestedClient.name });
        clientId = c.id;
      }
      const payload = {
        client_id: clientId,
        issue_date: form.issue_date,
        due_date: form.due_date,
        notes: form.notes,
        line_items: items.map((it) => ({
          description: it.description,
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price),
          gst_rate: parseFloat(it.gst_rate) || 0,
        })),
      };
      const inv = await createInvoice(payload);
      if (onCreated) onCreated(inv);
      else router.push(`/invoices/${inv.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error creating invoice");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {noProfile && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            Your business profile is not set up yet.{" "}
            <Link href="/settings" className="font-semibold underline hover:text-amber-900">Go to Settings</Link>{" "}
            to add your name, ABN, and contact details — they appear on every invoice.
          </span>
        </div>
      )}

      {!compact && settings?.name && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start justify-between">
          <div className="text-sm">
            <div className="font-semibold text-blue-800">{settings.name}</div>
            {settings.abn && <div className="text-blue-600 text-xs">ABN: {settings.abn}</div>}
            {settings.email && <div className="text-blue-600 text-xs">{settings.email}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-500">Next invoice number</div>
            <div className="font-mono font-bold text-blue-700">{settings.next_invoice_number}</div>
            <Link href="/settings" className="text-xs text-blue-500 hover:underline">Edit</Link>
          </div>
        </div>
      )}

      <Section title="Invoice Details" compact={compact}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.client_id}
              onChange={(e) => { setForm({ ...form, client_id: e.target.value }); if (e.target.value) setSuggestedClient(null); }}
            >
              <option value="">{suggestedClient ? `New client: ${suggestedClient.name}` : "Select client..."}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {suggestedClient && !form.client_id && (
              <p className="text-xs text-violet-600 mt-1">A new client &ldquo;{suggestedClient.name}&rdquo; will be created when you save.</p>
            )}
            {clients.length === 0 && !suggestedClient && (
              <p className="text-xs text-gray-400 mt-1">
                No clients yet. <Link href="/clients" className="text-blue-600 hover:underline">Add one first.</Link>
              </p>
            )}
          </div>
          <div className="hidden md:block" />
          <Field label="Issue Date *" value={form.issue_date} onChange={(v) => setForm({ ...form, issue_date: v })} type="date" />
          <Field
            label="Due Date *"
            value={form.due_date}
            onChange={(v) => setForm({ ...form, due_date: v })}
            type="date"
            help={
              <>
                <p className="font-semibold text-gray-800 mb-1">Why a due date?</p>
                <p>It sets the payment deadline printed on the PDF, drives the &ldquo;Overdue&rdquo; badge once passed, and feeds cash-flow forecasts in Tax Summary.</p>
                <p className="font-semibold text-gray-800 mt-2 mb-1">How to choose</p>
                <p>Net 7 / 14 / 30 days from the issue date is standard in Australia. Set it equal to the issue date to mark it as due immediately.</p>
              </>
            }
          />
        </div>
      </Section>

      <Section title="Line Items" compact={compact}>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
            <div className="col-span-5">Description</div>
            <div className="col-span-2 text-center">Qty</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-2 text-center">GST %</div>
            <div className="col-span-1"></div>
          </div>
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number" min="0" step="0.5"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={item.unit_price}
                  onChange={(e) => updateItem(i, "unit_price", e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <select
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={item.gst_rate}
                  onChange={(e) => updateItem(i, "gst_rate", e.target.value)}
                >
                  <option value="0">0%</option>
                  <option value="10">10%</option>
                </select>
              </div>
              <div className="col-span-1 flex justify-center">
                <button onClick={() => removeItem(i)} disabled={items.length === 1} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 disabled:opacity-30">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mt-2">
            <Plus size={14} /> Add item
          </button>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4 flex flex-col items-end gap-1 text-sm">
          <div className="flex gap-8 text-gray-600"><span>Subtotal</span><span className="w-28 text-right">{fmt(subtotal)}</span></div>
          <div className="flex gap-8 text-gray-600"><span>GST</span><span className="w-28 text-right">{fmt(gst)}</span></div>
          <div className="flex gap-8 font-bold text-blue-700 text-base border-t border-gray-200 pt-2 mt-1">
            <span>Total</span><span className="w-28 text-right">{fmt(subtotal + gst)}</span>
          </div>
        </div>
      </Section>

      <Section title="Notes (optional)" compact={compact}>
        <textarea
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={6}
          placeholder="Payment terms, reference, thank you message..."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </Section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={saving || !!noProfile}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? "Creating..." : submitLabel}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, compact }: { title: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl shadow-sm ${compact ? "p-4" : "p-5"}`}>
      <h2 className="font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, help }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; help?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        {help && <HelpTip>{help}</HelpTip>}
      </div>
      <input
        type={type}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
