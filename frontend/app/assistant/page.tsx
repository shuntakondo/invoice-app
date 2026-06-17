"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getAIStatus, sendChat, createClient, createInvoice, markPaid,
  AIStatus, ChatMessageT, Proposal, InvoiceProposalPayload, MarkPaidProposalPayload,
} from "@/lib/api";
import { Sparkles, Send, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";

type PStatus = "pending" | "working" | "done" | "error";
interface PItem {
  proposal: Proposal;
  status: PStatus;
  resultText?: string;
  link?: string;
  error?: string;
}

const EXAMPLES = [
  "What's my total unpaid amount?",
  "Invoice Davide for 2 days of work at $800/day",
  "Which invoices are overdue?",
];

export default function AssistantPage() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessageT[]>([]);
  const [proposals, setProposals] = useState<PItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAIStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, proposals, loading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setProposals([]);
    setError("");
    setLoading(true);
    try {
      const res = await sendChat(next);
      setMessages([...next, { role: "assistant", content: res.reply }]);
      setProposals(res.proposals.map((p) => ({ proposal: p, status: "pending" as PStatus })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
      setMessages(next); // keep the user message; show the error below
    } finally {
      setLoading(false);
    }
  };

  const patch = (idx: number, p: Partial<PItem>) =>
    setProposals((prev) => prev.map((it, i) => (i === idx ? { ...it, ...p } : it)));

  const confirm = async (idx: number) => {
    const item = proposals[idx];
    patch(idx, { status: "working", error: undefined });
    try {
      if (item.proposal.kind === "invoice") {
        const pl = item.proposal.payload as InvoiceProposalPayload;
        let clientId = pl.client_id;
        if (!clientId && pl.new_client) {
          const c = await createClient({ name: pl.new_client.name });
          clientId = c.id;
        }
        if (!clientId) throw new Error("No client to bill — start over and name the client.");
        const inv = await createInvoice({
          client_id: clientId,
          issue_date: pl.issue_date,
          due_date: pl.due_date,
          notes: pl.notes || "",
          line_items: pl.line_items,
        });
        patch(idx, { status: "done", resultText: `Created ${inv.invoice_number}`, link: `/invoices/${inv.id}` });
      } else {
        const pl = item.proposal.payload as MarkPaidProposalPayload;
        const inv = await markPaid(pl.invoice_id, true, pl.paid_date);
        patch(idx, { status: "done", resultText: `Marked ${inv.invoice_number} paid` });
      }
    } catch (e: unknown) {
      patch(idx, { status: "error", error: e instanceof Error ? e.message : "Action failed" });
    }
  };

  const notReady = status && !status.configured;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={22} className="text-violet-600" />
        <h1 className="text-2xl font-bold text-gray-900">Assistant</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Ask about your invoices and finances, or have it prepare invoices and payments — runs locally on Ollama.
      </p>

      {notReady && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p>{status?.detail}</p>
            {status && status.available_models.length > 0 && (
              <p className="mt-1 text-amber-700">
                Installed models: <span className="font-mono">{status.available_models.join(", ")}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-[62vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 gap-4">
              <Sparkles size={28} className="text-violet-300" />
              <p className="text-sm">Ask me anything about your invoicing.</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    disabled={!!notReady || loading}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full px-3 py-1.5 disabled:opacity-40"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {/* Proposal cards (attached to the latest assistant turn) */}
          {proposals.map((it, idx) => (
            <div key={idx} className="border border-violet-200 bg-violet-50 rounded-xl p-3.5 text-sm">
              <div className="flex items-center gap-2 font-semibold text-violet-900">
                <Sparkles size={14} /> {it.proposal.title}
              </div>
              <p className="text-violet-800 mt-1">{it.proposal.summary}</p>

              {it.status === "done" ? (
                <div className="flex items-center gap-2 mt-2 text-green-700">
                  <CheckCircle2 size={15} />
                  {it.link ? (
                    <Link href={it.link} className="font-medium underline hover:text-green-800">
                      {it.resultText}
                    </Link>
                  ) : (
                    <span className="font-medium">{it.resultText}</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => confirm(idx)}
                    disabled={it.status === "working"}
                    className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {it.status === "working" ? <Loader2 size={13} className="animate-spin" /> : null}
                    Confirm
                  </button>
                  <button
                    onClick={() => setProposals((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={it.status === "working"}
                    className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg text-xs disabled:opacity-50"
                  >
                    <X size={13} /> Dismiss
                  </button>
                  {it.status === "error" && <span className="text-red-600 text-xs">{it.error}</span>}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 text-gray-500 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Thinking...
              </div>
            </div>
          )}
        </div>

        {error && <p className="px-4 text-red-600 text-sm pb-1">{error}</p>}

        <div className="border-t border-gray-100 p-3 flex items-end gap-2">
          <textarea
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            rows={1}
            placeholder={notReady ? "Set up Ollama to start chatting…" : "Ask a question or describe an invoice…"}
            value={input}
            disabled={!!notReady}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !!notReady || !input.trim()}
            className="bg-violet-600 hover:bg-violet-700 text-white p-2.5 rounded-lg disabled:opacity-50 transition-colors"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
