"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getInvoices, Invoice } from "@/lib/api";
import { FileText, Users, DollarSign, AlertCircle, Plus, ArrowRight } from "lucide-react";

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInvoices()
      .then(setInvoices)
      .finally(() => setLoading(false));
  }, []);

  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter((i) => i.paid).reduce((s, i) => s + i.total, 0);
  const totalUnpaid = invoices.filter((i) => !i.paid).reduce((s, i) => s + i.total, 0);
  const todayStr = new Date().toISOString().split("T")[0];
  const overdueCount = invoices.filter(
    (i) => !i.paid && i.due_date < todayStr
  ).length;

  const recent = invoices.slice(0, 5);

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link
          href="/invoices/new"
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Invoice
        </Link>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Invoiced" value={fmt(totalInvoiced)} icon={FileText} color="blue" />
            <StatCard label="Total Paid" value={fmt(totalPaid)} icon={DollarSign} color="green" />
            <StatCard label="Outstanding" value={fmt(totalUnpaid)} icon={DollarSign} color="yellow" />
            <StatCard label="Overdue" value={String(overdueCount)} icon={AlertCircle} color="red" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Recent Invoices</h2>
              <Link href="/invoices" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">
                No invoices yet.{" "}
                <Link href="/invoices/new" className="text-blue-600 hover:underline">
                  Create one
                </Link>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-100">
                    <th className="text-left px-5 py-2 font-medium">Invoice</th>
                    <th className="text-left px-5 py-2 font-medium">Client</th>
                    <th className="text-left px-5 py-2 font-medium">Due</th>
                    <th className="text-right px-5 py-2 font-medium">Amount</th>
                    <th className="text-center px-5 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link href={`/invoices/${inv.id}`} className="text-blue-600 hover:underline font-medium">
                          #{inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{inv.client.name}</td>
                      <td className="px-5 py-3 text-gray-500">{inv.due_date}</td>
                      <td className="px-5 py-3 text-right font-medium">{fmt(inv.total)}</td>
                      <td className="px-5 py-3 text-center">
                        <StatusBadge paid={inv.paid} dueDate={inv.due_date} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: "blue" | "green" | "yellow" | "red";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className={`inline-flex p-2 rounded-lg mb-3 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

export function StatusBadge({ paid, dueDate }: { paid: boolean; dueDate: string }) {
  if (paid) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
        Paid
      </span>
    );
  }
  const overdue = dueDate < new Date().toISOString().split("T")[0];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        overdue ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
      }`}
    >
      {overdue ? "Overdue" : "Unpaid"}
    </span>
  );
}
