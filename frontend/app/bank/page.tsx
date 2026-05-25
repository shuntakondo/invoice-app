"use client";
import { useEffect, useState } from "react";
import { getReconcileMatches, markPaid, ReconcileMatch, getSettings } from "@/lib/api";
import { CheckCircle, RefreshCw, AlertCircle, ExternalLink, Landmark } from "lucide-react";
import Link from "next/link";

export default function BankPage() {
  const [matches, setMatches] = useState<ReconcileMatch[]>([]);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    getReconcileMatches()
      .then(setMatches)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getSettings().then((s) => {
      setConnected(s.basiq_connected);
      if (s.basiq_connected) load();
      else setLoading(false);
    });
  }, []);

  const confirmMatch = async (m: ReconcileMatch) => {
    const key = `${m.transaction.id}-${m.invoice_id}`;
    setConfirming(key);
    try {
      await markPaid(m.invoice_id, true, m.transaction.date);
      setConfirmedIds((prev) => new Set([...prev, key]));
    } catch (e: Error | unknown) {
      setError(e instanceof Error ? e.message : "Error marking paid");
    } finally {
      setConfirming(null);
    }
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

  const pending = matches.filter(
    (m) => !confirmedIds.has(`${m.transaction.id}-${m.invoice_id}`)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Landmark size={22} className="text-blue-700" />
          <h1 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h1>
        </div>
        {connected && (
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        )}
      </div>

      {/* Not connected state */}
      {connected === false && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
          <Landmark size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium mb-1">Bank not connected</p>
          <p className="text-gray-400 text-sm mb-4">
            Connect your bank via Basiq to automatically match incoming payments to invoices.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <ExternalLink size={14} /> Go to Settings to connect
          </Link>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {connected && loading && <p className="text-gray-400 text-sm">Fetching transactions…</p>}

      {/* Results */}
      {connected && !loading && (
        <>
          {confirmedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-700">
              <CheckCircle size={15} />
              {confirmedIds.size} invoice{confirmedIds.size > 1 ? "s" : ""} marked as paid this session.
            </div>
          )}

          {pending.length === 0 && !error ? (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
              {matches.length > 0
                ? "All matches confirmed."
                : "No matching transactions found. Try refreshing after a payment clears."}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">
                The following bank credits match unpaid invoices by amount. Confirm each one to mark the invoice paid.
              </p>
              <div className="space-y-3">
                {pending.map((m) => {
                  const key = `${m.transaction.id}-${m.invoice_id}`;
                  const isConfirming = confirming === key;
                  return (
                    <div
                      key={key}
                      className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex items-center gap-4"
                    >
                      {/* Confidence badge */}
                      <div className="shrink-0">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            m.confidence === "amount+ref"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {m.confidence === "amount+ref" ? "High" : "Possible"}
                        </span>
                      </div>

                      {/* Transaction */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{m.transaction.date}</span>
                          <span className="font-semibold text-gray-800">{fmt(m.transaction.amount)}</span>
                        </div>
                        <p className="text-sm text-gray-500 truncate">{m.transaction.description}</p>
                      </div>

                      {/* Arrow */}
                      <div className="text-gray-300 text-lg shrink-0">→</div>

                      {/* Invoice */}
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-blue-700">#{m.invoice_number}</div>
                        <div className="text-xs text-gray-500">{fmt(m.invoice_total)}</div>
                      </div>

                      {/* Confirm button */}
                      <button
                        onClick={() => confirmMatch(m)}
                        disabled={isConfirming}
                        className="shrink-0 flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle size={14} />
                        {isConfirming ? "Saving…" : "Confirm Paid"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
