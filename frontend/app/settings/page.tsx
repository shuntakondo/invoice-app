"use client";
import { useEffect, useState } from "react";
import { getSettings, updateSettings, connectBank, BusinessSettings } from "@/lib/api";
import { Check, Building2, Landmark, Link2, ExternalLink, Info } from "lucide-react";

export default function SettingsPage() {
  const [form, setForm] = useState({
    name: "",
    abn: "",
    email: "",
    address: "",
    invoice_prefix: "INV",
    bank_name: "",
    bank_account_name: "",
    bsb: "",
    account_number: "",
    basiq_api_key: "",
  });
  const [nextNumber, setNextNumber] = useState("");
  const [basiqConnected, setBasiqConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSettings()
      .then((s: BusinessSettings) => {
        setForm({
          name: s.name ?? "",
          abn: s.abn ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
          invoice_prefix: s.invoice_prefix ?? "INV",
          bank_name: s.bank_name ?? "",
          bank_account_name: s.bank_account_name ?? "",
          bsb: s.bsb ?? "",
          account_number: s.account_number ?? "",
          basiq_api_key: s.basiq_api_key ?? "",
        });
        setNextNumber(s.next_invoice_number);
        setBasiqConnected(s.basiq_connected);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!form.name.trim()) { setError("Business name is required"); return; }
    if (!form.invoice_prefix.trim()) { setError("Invoice prefix is required"); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await updateSettings(form);
      setNextNumber(updated.next_invoice_number);
      setBasiqConnected(updated.basiq_connected);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    // Save API key first so the backend can use it
    if (!form.basiq_api_key || form.basiq_api_key === "••••••••") {
      setError("Enter your Basiq API key before connecting");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      await updateSettings(form);
      const { url } = await connectBank();
      window.open(url, "_blank", "noopener,noreferrer");
      setBasiqConnected(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error connecting bank");
    } finally {
      setConnecting(false);
    }
  };

  const set = (field: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [field]: v }));

  if (loading) return <p className="text-gray-400 text-sm">Loading...</p>;

  return (
    <div className="max-w-xl space-y-6">
      {/* ── Business Profile ── */}
      <Section icon={<Building2 size={18} className="text-blue-700" />} title="Business Profile">
        <p className="text-sm text-gray-500 mb-4">
          Appears on every invoice automatically.
        </p>
        <div className="space-y-4">
          <Field label="Business / Your Name *" value={form.name} onChange={set("name")} placeholder="Jane Smith Consulting" />
          <Field label="ABN" value={form.abn} onChange={set("abn")} placeholder="12 345 678 901" mono />
          <Field label="Email" value={form.email} onChange={set("email")} type="email" placeholder="you@example.com" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={form.address}
              onChange={(e) => set("address")(e.target.value)}
              placeholder={"123 Your Street\nCity STATE 0000"}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">Invoice Numbering</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Prefix</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  value={form.invoice_prefix}
                  onChange={(e) => set("invoice_prefix")(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </div>
              <div className="pb-2 text-sm text-gray-500">
                Next: <span className="font-mono font-semibold text-blue-700">
                  {form.invoice_prefix
                    ? `${form.invoice_prefix}-${nextNumber.split("-").pop()}`
                    : nextNumber}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Bank Payment Details ── */}
      <Section icon={<Landmark size={18} className="text-blue-700" />} title="Bank Payment Details">
        <p className="text-sm text-gray-500 mb-4">
          Printed on every invoice so clients know where to transfer payment.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Bank Name" value={form.bank_name} onChange={set("bank_name")} placeholder="Commonwealth Bank" />
          </div>
          <div className="col-span-2">
            <Field label="Account Name" value={form.bank_account_name} onChange={set("bank_account_name")} placeholder="Jane Smith" />
          </div>
          <Field label="BSB" value={form.bsb} onChange={set("bsb")} placeholder="062-000" mono />
          <Field label="Account Number" value={form.account_number} onChange={set("account_number")} placeholder="12345678" mono />
        </div>
      </Section>

      {/* ── Basiq Bank Feed ── */}
      <Section icon={<Link2 size={18} className="text-blue-700" />} title="Bank Feed (Auto-Reconciliation)">
        <div className="text-sm text-gray-500 mb-4 space-y-1">
          <p>
            Connect your bank via <strong>Basiq</strong> (Australian Open Banking) to automatically
            match incoming payments to invoices.
          </p>
          <a
            href="https://basiq.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
          >
            Get a free Basiq API key at basiq.io <ExternalLink size={11} />
          </a>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Basiq API Key</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.basiq_api_key}
              onChange={(e) => set("basiq_api_key")(e.target.value)}
              placeholder="Paste your Basiq server API key"
              autoComplete="off"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Link2 size={14} />
              {connecting ? "Opening…" : basiqConnected ? "Re-connect Bank" : "Connect Bank"}
            </button>
            {basiqConnected && (
              <span className="flex items-center gap-1 text-green-700 text-sm font-medium">
                <Check size={14} /> Connected
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Clicking "Connect Bank" opens a Basiq-hosted page where you securely authorise
              read-only access to your bank transactions. Your credentials never pass through
              this app.
            </span>
          </div>
        </div>
      </Section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
      >
        {saved ? <><Check size={15} /> Saved!</> : saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, mono,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${mono ? "font-mono" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
