"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getInvoice } from "@/lib/api";
import InvoiceForm, { InvoiceFormInitial } from "@/components/InvoiceForm";

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

  // `initial` is undefined until the (optional) source invoice has loaded, so
  // InvoiceForm always mounts with its final pre-filled values.
  const [initial, setInitial] = useState<InvoiceFormInitial | undefined>(fromId ? undefined : {});
  const [duplicatedFrom, setDuplicatedFrom] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!fromId) return;
    getInvoice(parseInt(fromId)).then((inv) => {
      setInitial({
        client_id: String(inv.client_id),
        notes: inv.notes || "",
        items: inv.line_items.map((it) => ({
          description: it.description,
          quantity: String(it.quantity),
          unit_price: String(it.unit_price),
          gst_rate: String(it.gst_rate),
        })),
      });
      setDuplicatedFrom(inv.invoice_number);
    }).catch(() => {
      setLoadError("Could not load the source invoice to duplicate");
      setInitial({});
    });
  }, [fromId]);

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

      {loadError && <p className="text-red-600 text-sm mb-5">{loadError}</p>}

      {initial === undefined ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <InvoiceForm initial={initial} onCancel={() => router.back()} />
      )}
    </div>
  );
}
