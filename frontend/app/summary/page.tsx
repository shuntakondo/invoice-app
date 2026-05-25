"use client";
import { useEffect, useState } from "react";
import { getTaxSummary, TaxSummary, MonthlySummary } from "@/lib/api";

function currentFyStart() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export default function SummaryPage() {
  const [fyStart, setFyStart] = useState(currentFyStart());
  const [data, setData] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    getTaxSummary(fyStart)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fyStart]);

  const fmt = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  const years = Array.from({ length: 5 }, (_, i) => currentFyStart() - i);

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleString("en-AU", { month: "short", year: "numeric" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tax Summary</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Financial Year</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={fyStart}
            onChange={(e) => setFyStart(parseInt(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>FY {y}–{y + 1}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SumCard label="Total Income (paid)" value={fmt(data.total_income)} sub="excl. GST" color="green" />
            <SumCard label="GST Collected" value={fmt(data.total_gst)} sub="from paid invoices" color="blue" />
            <SumCard label="Paid Invoices" value={String(data.paid_invoices)} color="green" />
            <SumCard label="Outstanding" value={String(data.unpaid_invoices)} color="red" />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Monthly Breakdown — FY {data.financial_year}</h2>
              <p className="text-xs text-gray-500 mt-0.5">Australian financial year: 1 Jul – 30 Jun</p>
            </div>
            {data.monthly.length === 0 ? (
              <p className="px-5 py-8 text-center text-gray-400 text-sm">No invoices in this financial year.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium">Month</th>
                    <th className="text-right px-5 py-3 font-medium">Invoiced</th>
                    <th className="text-right px-5 py-3 font-medium">Paid</th>
                    <th className="text-right px-5 py-3 font-medium">Unpaid</th>
                    <th className="text-right px-5 py-3 font-medium">GST</th>
                    <th className="text-center px-5 py-3 font-medium"># Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((m: MonthlySummary) => (
                    <tr key={m.month} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-800">{monthLabel(m.month)}</td>
                      <td className="px-5 py-3 text-right">{fmt(m.total_invoiced)}</td>
                      <td className="px-5 py-3 text-right text-green-700">{fmt(m.total_paid)}</td>
                      <td className="px-5 py-3 text-right text-red-600">{fmt(m.total_unpaid)}</td>
                      <td className="px-5 py-3 text-right text-blue-700">{fmt(m.gst_collected)}</td>
                      <td className="px-5 py-3 text-center text-gray-500">{m.invoice_count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-semibold text-blue-800 text-sm">
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 text-right">
                      {fmt(data.monthly.reduce((s, m) => s + m.total_invoiced, 0))}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {fmt(data.monthly.reduce((s, m) => s + m.total_paid, 0))}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {fmt(data.monthly.reduce((s, m) => s + m.total_unpaid, 0))}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {fmt(data.monthly.reduce((s, m) => s + m.gst_collected, 0))}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {data.monthly.reduce((s, m) => s + m.invoice_count, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Tax time tip:</strong> Your total income for FY{data.financial_year} (paid invoices excl. GST) is{" "}
            <strong>{fmt(data.total_income)}</strong>. GST collected and remitted to the ATO:{" "}
            <strong>{fmt(data.total_gst)}</strong>. Always verify with your accountant.
          </div>
        </>
      ) : null}
    </div>
  );
}

function SumCard({
  label, value, sub, color,
}: {
  label: string; value: string; sub?: string; color: "green" | "blue" | "red" | "yellow";
}) {
  const colors = {
    green: "text-green-700",
    blue: "text-blue-700",
    red: "text-red-600",
    yellow: "text-yellow-600",
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-600 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
