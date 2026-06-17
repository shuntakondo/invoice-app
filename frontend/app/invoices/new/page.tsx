"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getClients, getSettings, getInvoice, createInvoice, createClient,
  getAIStatus, draftInvoiceFromAI, Client, BusinessSettings, AIInvoiceDraft,
} from "@/lib/api";
import { Plus, Trash2, AlertCircle, Sparkles, Loader2, Paperclip, X } from "lucide-react";
import Link from "next/link";
import { HelpTip } from "@/components/HelpTip";

interface LineItemDraft {
  description: string;
  quantity: string;
  unit_price: string;
  gst_rate: string;
}

const emptyItem = (): LineItemDraft => ({ description: "", quantity: "1", unit_price: "", gst_rate: "10" });

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<p className="text-gray-400 text-sm">Loading...</p>}>
      <NewInvoiceForm />
    </Suspense>
  );
}

function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromId = searchParams.get("from");
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [duplicatedFrom, setDuplicatedFrom] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const dueDefault = new Date(Date.now() + 14 * 86400_000).toISOString().split("T")[0];

  const [form, setForm] = useState({
    client_id: "",
    issue_date: today,
    due_date: dueDefault,
    notes: "",
  });
  const [items, setItems] = useState<LineItemDraft[]>([emptyItem()]);

  // AI Assist
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [suggestedClient, setSuggestedClient] = useState<{ name: string; email: string; abn: string } | null>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    Promise.all([getClients(), getSettings(), getAIStatus()]).then(([c, s, ai]) => {
      setClients(c);
      setSettings(s);
      setAiConfigured(ai.configured);
    });
  }, []);

  useEffect(() => {
    if (!fromId) return;
    getInvoice(parseInt(fromId)).then((inv) => {
      setForm((f) => ({
        ...f,
        client_id: String(inv.client_id),
        notes: inv.notes || "",
      }));
      setItems(
        inv.line_items.map((it) => ({
          description: it.description,
          quantity: String(it.quantity),
          unit_price: String(it.unit_price),
          gst_rate: String(it.gst_rate),
        }))
      );
      setDuplicatedFrom(inv.invoice_number);
    }).catch(() => {
      setError("Could not load the source invoice to duplicate");
    });
  }, [fromId]);

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

  // --- AI Assist ---
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setAiFiles((prev) => [...prev, ...picked].slice(0, 8));
    e.target.value = ""; // allow re-selecting the same file
  };
  const removeAiFile = (i: number) => setAiFiles((prev) => prev.filter((_, idx) => idx !== i));

  const applyDraft = (d: AIInvoiceDraft) => {
    setForm((f) => ({
      ...f,
      client_id: d.matched_client_id ? String(d.matched_client_id) : f.client_id,
      issue_date: d.issue_date || f.issue_date,
      due_date: d.due_date || f.due_date,
      notes: d.notes ?? f.notes,
    }));
    // Reset to a clean blank row when the AI found nothing billable.
    setItems(
      d.line_items.length > 0
        ? d.line_items.map((it) => ({
            description: it.description,
            quantity: String(it.quantity && it.quantity > 0 ? it.quantity : 1),
            unit_price: String(it.unit_price ?? ""),
            // AU GST is binary: coerce any non-zero rate to the 10% option.
            gst_rate: it.gst_rate === 0 ? "0" : "10",
          }))
        : [emptyItem()]
    );
    setSuggestedClient(
      !d.matched_client_id && d.suggested_client_name
        ? { name: d.suggested_client_name, email: d.suggested_client_email || "", abn: d.suggested_client_abn || "" }
        : null
    );
    setAiSummary(d.summary);
  };

  const generate = async () => {
    if (!aiText.trim() && aiFiles.length === 0) {
      setAiError("Add some text or attach a file first");
      return;
    }
    setAiLoading(true);
    setAiError("");
    setAiSummary("");
    try {
      const draft = await draftInvoiceFromAI(aiText, aiFiles);
      applyDraft(draft);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  };

  const createSuggestedClient = async () => {
    if (!suggestedClient) return;
    setCreatingClient(true);
    setAiError("");
    try {
      const c = await createClient({
        name: suggestedClient.name,
        email: suggestedClient.email || undefined,
        phone: undefined,
        address: undefined,
        abn: suggestedClient.abn || undefined,
      });
      setClients(await getClients());
      setForm((f) => ({ ...f, client_id: String(c.id) }));
      setSuggestedClient(null);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : "Could not create client");
    } finally {
      setCreatingClient(false);
    }
  };

  const submit = async () => {
    if (!form.client_id) { setError("Select a client"); return; }
    if (items.some((it) => !it.description || !(parseFloat(it.unit_price) > 0) || !(parseFloat(it.quantity) > 0))) {
      setError("Every line item needs a description, a quantity above 0, and a price above 0");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        client_id: parseInt(form.client_id),
        line_items: items.map((it) => ({
          description: it.description,
          quantity: parseFloat(it.quantity) || 1,
          unit_price: parseFloat(it.unit_price),
          gst_rate: parseFloat(it.gst_rate) || 0,
        })),
      };
      const inv = await createInvoice(payload);
      router.push(`/invoices/${inv.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error creating invoice");
      setSaving(false);
    }
  };

  const noProfile = settings && !settings.name;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {duplicatedFrom ? "New Invoice (Duplicate)" : "New Invoice"}
      </h1>

      {duplicatedFrom && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-5 text-sm text-indigo-800">
          Duplicated from <span className="font-mono font-semibold">#{duplicatedFrom}</span>.
          Adjust amounts and description (e.g. &ldquo;Part 2/2&rdquo;) before saving — a new invoice number is assigned on save.
        </div>
      )}

      {/* Warn if business profile not set up */}
      {noProfile && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            Your business profile is not set up yet.{" "}
            <Link href="/settings" className="font-semibold underline hover:text-amber-900">
              Go to Settings
            </Link>{" "}
            to add your name, ABN, and contact details — they appear on every invoice.
          </span>
        </div>
      )}

      {/* Business info preview */}
      {settings?.name && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 flex items-start justify-between">
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

      <div className="space-y-5">
        {/* AI Assist */}
        <Section title="✨ AI Assist">
          {aiConfigured === false ? (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                AI drafting is off. Set <span className="font-mono">ANTHROPIC_API_KEY</span> in the backend
                environment to enable it (see <span className="font-mono">backend/.env.example</span>).
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Paste an email, chat, or project notes — or attach a quote/receipt image or PDF — and let AI
                pre-fill this invoice. Review everything before saving.
              </p>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                rows={4}
                placeholder="e.g. Hi, can you invoice Acme for the 3 days of design work we agreed at $1,200/day plus the $400 logo revision?"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
              />
              {aiFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {aiFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs rounded-full pl-3 pr-1.5 py-1">
                      {f.name}
                      <button type="button" onClick={() => removeAiFile(i)} className="p-0.5 hover:bg-gray-200 rounded-full">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                  <Paperclip size={14} />
                  Attach image / PDF
                  <input type="file" multiple accept="image/*,application/pdf,text/plain" className="hidden" onChange={onFiles} />
                </label>
                <button
                  type="button"
                  onClick={generate}
                  disabled={aiLoading || aiConfigured === null}
                  className="ml-auto inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {aiLoading ? "Reading..." : "Generate draft"}
                </button>
              </div>
              {aiError && <p className="text-red-600 text-sm">{aiError}</p>}
              {aiSummary && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 text-sm text-violet-800">
                  <span className="font-semibold">AI:</span> {aiSummary}
                </div>
              )}
              {suggestedClient && (
                <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 text-sm text-violet-900 flex items-center justify-between gap-3">
                  <span>
                    Suggested new client: <span className="font-semibold">{suggestedClient.name}</span>
                    {suggestedClient.abn ? ` · ABN ${suggestedClient.abn}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={createSuggestedClient}
                    disabled={creatingClient}
                    className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {creatingClient ? "Creating..." : "Create & select"}
                  </button>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Invoice details */}
        <Section title="Invoice Details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client *</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  No clients yet.{" "}
                  <Link href="/clients" className="text-blue-600 hover:underline">Add one first.</Link>
                </p>
              )}
            </div>
            <div /> {/* spacer */}
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

        {/* Line items */}
        <Section title="Line Items">
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
            <div className="flex gap-8 text-gray-600">
              <span>Subtotal</span><span className="w-28 text-right">{fmt(subtotal)}</span>
            </div>
            <div className="flex gap-8 text-gray-600">
              <span>GST</span><span className="w-28 text-right">{fmt(gst)}</span>
            </div>
            <div className="flex gap-8 font-bold text-blue-700 text-base border-t border-gray-200 pt-2 mt-1">
              <span>Total</span><span className="w-28 text-right">{fmt(subtotal + gst)}</span>
            </div>
          </div>
        </Section>

        {/* Notes */}
        <Section title="Notes (optional)">
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="Payment terms, bank details, thank you message..."
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
            {saving ? "Creating..." : "Create Invoice"}
          </button>
          <button
            onClick={() => router.back()}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
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
