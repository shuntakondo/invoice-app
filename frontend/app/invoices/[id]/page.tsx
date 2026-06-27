"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getInvoice, markPaid, deleteInvoice, Invoice, pdfUrl } from "@/lib/api";
import { Download, Trash2, CheckCircle, Circle, ArrowLeft, Mail, Copy } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "../../page";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    getInvoice(parseInt(id))
      .then(setInvoice)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  const togglePaid = async () => {
    if (!invoice) return;
    const today = new Date().toISOString().split("T")[0];
    await markPaid(invoice.id, !invoice.paid, !invoice.paid ? today : undefined);
    load();
  };

  const remove = async () => {
    if (!invoice) return;
    if (!confirm("Delete this invoice?")) return;
    await deleteInvoice(invoice.id);
    router.push("/invoices");
  };

  const fmt = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

  const openGmailCompose = () => {
    if (!invoice) return;
    const firstItem = invoice.line_items[0]?.description || "your project";
    const cleanDesc = firstItem.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const firstName = invoice.client.name.split(" ")[0];
    const dueDateLabel = new Date(invoice.due_date).toLocaleDateString("en-AU", {
      day: "numeric", month: "long", year: "numeric",
    });
    const total = `AUD $${invoice.total.toFixed(2)}`;

    const subject = `Invoice — ${cleanDesc}`;
    const body = `Hi ${firstName},

Please find the invoice attached for ${cleanDesc}.

Total: ${total}, due by ${dueDateLabel}. Bank details are included on the invoice.

Please let me know if you have any questions.

Cheers,
${invoice.sender_name}`;

    const params = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: invoice.client.email || "",
      su: subject,
      body,
    });
    window.open(`https://mail.google.com/mail/?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  if (loading) return <p className="text-gray-400 text-sm">Loading...</p>;
  if (!invoice) return <p className="text-red-500 text-sm">Invoice not found.</p>;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/invoices" className="p-1.5 hover:bg-gray-100 rounded text-gray-500">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 whitespace-nowrap">Invoice #{invoice.invoice_number}</h1>
        <StatusBadge paid={invoice.paid} dueDate={invoice.due_date} />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={togglePaid}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              invoice.paid
                ? "border-gray-300 text-gray-600 hover:bg-gray-50"
                : "border-green-500 text-green-700 hover:bg-green-50"
            }`}
          >
            {invoice.paid ? <Circle size={14} /> : <CheckCircle size={14} />}
            {invoice.paid ? "Mark Unpaid" : "Mark Paid"}
          </button>
          <Link
            href={`/invoices/new?from=${invoice.id}`}
            className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Copy size={14} /> Duplicate
          </Link>
          <button
            onClick={openGmailCompose}
            className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Mail size={14} /> Email
          </button>
          <a
            href={pdfUrl(invoice.id)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={14} /> Download PDF
          </a>
          <button onClick={remove} className="p-1.5 hover:bg-red-50 rounded text-gray-500 hover:text-red-600 transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between">
          <div>
            <div className="text-lg font-bold text-blue-700">{invoice.sender_name}</div>
            {invoice.sender_abn && <div className="text-sm text-gray-500">ABN: {invoice.sender_abn}</div>}
            {invoice.sender_email && <div className="text-sm text-gray-500">{invoice.sender_email}</div>}
            {invoice.sender_address && (
              <div className="text-sm text-gray-500 whitespace-pre-line">{invoice.sender_address}</div>
            )}
          </div>
          <div className="text-right space-y-1 text-sm">
            <div className="text-gray-500">Issue Date: <span className="text-gray-800 font-medium">{invoice.issue_date}</span></div>
            <div className="text-gray-500">Due Date: <span className="text-gray-800 font-medium">{invoice.due_date}</span></div>
            {invoice.paid && invoice.paid_date && (
              <div className="text-gray-500">Paid: <span className="text-green-700 font-medium">{invoice.paid_date}</span></div>
            )}
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Bill to */}
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Bill To</div>
          <div className="font-semibold text-gray-900">{invoice.client.name}</div>
          {invoice.client.abn && <div className="text-sm text-gray-500">ABN: {invoice.client.abn}</div>}
          {invoice.client.email && <div className="text-sm text-gray-500">{invoice.client.email}</div>}
          {invoice.client.phone && <div className="text-sm text-gray-500">{invoice.client.phone}</div>}
          {invoice.client.address && <div className="text-sm text-gray-500 whitespace-pre-line">{invoice.client.address}</div>}
        </div>

        {/* Line items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-blue-700 text-blue-700 text-xs font-semibold">
              <th className="text-left py-2 pr-4">Description</th>
              <th className="text-center py-2 px-3 w-12 whitespace-nowrap">Qty</th>
              <th className="text-right py-2 px-3 w-28 whitespace-nowrap">Unit Price</th>
              <th className="text-center py-2 px-3 w-14 whitespace-nowrap">GST</th>
              <th className="text-right py-2 pl-3 w-28 whitespace-nowrap">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.line_items.map((item, i) => (
              <tr key={item.id} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                <td className="py-2 pr-4 align-top break-words">{item.description}</td>
                <td className="py-2 px-3 text-center align-top whitespace-nowrap">{item.quantity}</td>
                <td className="py-2 px-3 text-right align-top whitespace-nowrap">{fmt(item.unit_price)}</td>
                <td className="py-2 px-3 text-center align-top whitespace-nowrap">{item.gst_rate}%</td>
                <td className="py-2 pl-3 text-right align-top whitespace-nowrap font-medium">{fmt(item.quantity * item.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex flex-col items-end gap-1 text-sm pt-2 border-t border-gray-100">
          <div className="flex gap-8 text-gray-600">
            <span>Subtotal (excl. GST)</span><span className="w-32 text-right">{fmt(invoice.subtotal)}</span>
          </div>
          <div className="flex gap-8 text-gray-600">
            <span>GST</span><span className="w-32 text-right">{fmt(invoice.gst)}</span>
          </div>
          <div className="flex gap-8 font-bold text-blue-700 text-base border-t border-gray-200 pt-2 mt-1">
            <span>Total</span><span className="w-32 text-right">{fmt(invoice.total)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</div>
            <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
