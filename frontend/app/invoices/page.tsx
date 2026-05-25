"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getInvoices, markPaid, deleteInvoice, Invoice, pdfUrl } from "@/lib/api";
import { Plus, Download, Trash2, Eye, CheckCircle, Circle, Copy } from "lucide-react";
import { StatusBadge } from "../page";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all");

  const load = (f: typeof filter) => {
    setLoading(true);
    const paid = f === "all" ? undefined : f === "paid";
    getInvoices(paid).then(setInvoices).finally(() => setLoading(false));
  };

  useEffect(() => { load(filter); }, [filter]);

  const togglePaid = async (inv: Invoice) => {
    const today = new Date().toISOString().split("T")[0];
    await markPaid(inv.id, !inv.paid, !inv.paid ? today : undefined);
    load(filter);
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this invoice?")) return;
    await deleteInvoice(id);
    load(filter);
  };

  const fmt = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <Link href="/invoices/new" className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> New Invoice
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "unpaid", "paid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === f ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          No invoices found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Invoice #</th>
                <th className="text-left px-5 py-3 font-medium">Client</th>
                <th className="text-left px-5 py-3 font-medium">Issued</th>
                <th className="text-left px-5 py-3 font-medium">Due</th>
                <th className="text-right px-5 py-3 font-medium">Amount</th>
                <th className="text-center px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline font-medium">
                      #{inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-700">{inv.client.name}</td>
                  <td className="px-5 py-3 text-gray-500">{inv.issue_date}</td>
                  <td className="px-5 py-3 text-gray-500">{inv.due_date}</td>
                  <td className="px-5 py-3 text-right font-semibold">{fmt(inv.total)}</td>
                  <td className="px-5 py-3 text-center">
                    <StatusBadge paid={inv.paid} dueDate={inv.due_date} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => togglePaid(inv)}
                        title={inv.paid ? "Mark unpaid" : "Mark paid"}
                        className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${inv.paid ? "text-green-600" : "text-gray-400 hover:text-green-600"}`}
                      >
                        {inv.paid ? <CheckCircle size={15} /> : <Circle size={15} />}
                      </button>
                      <Link href={`/invoices/${inv.id}`} className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600 transition-colors">
                        <Eye size={15} />
                      </Link>
                      <Link
                        href={`/invoices/new?from=${inv.id}`}
                        title="Duplicate"
                        className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-indigo-600 transition-colors"
                      >
                        <Copy size={15} />
                      </Link>
                      <a href={pdfUrl(inv.id)} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600 transition-colors">
                        <Download size={15} />
                      </a>
                      <button onClick={() => remove(inv.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-500 hover:text-red-600 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
