const BASE = "http://localhost:8001/api";

export interface BusinessSettings {
  name: string;
  abn?: string;
  email?: string;
  address?: string;
  invoice_prefix: string;
  bank_name?: string;
  bank_account_name?: string;
  bsb?: string;
  account_number?: string;
  basiq_api_key?: string;
  next_invoice_seq: number;
  next_invoice_number: string;
  basiq_connected: boolean;
}

export interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: string;
  account?: string;
}

export interface ReconcileMatch {
  transaction: BankTransaction;
  invoice_id: number;
  invoice_number: string;
  invoice_total: number;
  confidence: string;
}

export interface LineItem {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
}

export interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  abn?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  client_id: number;
  client: Client;
  issue_date: string;
  due_date: string;
  paid: boolean;
  paid_date?: string;
  notes?: string;
  sender_name: string;
  sender_email?: string;
  sender_address?: string;
  sender_abn?: string;
  line_items: LineItem[];
  subtotal: number;
  gst: number;
  total: number;
}

export interface MonthlySummary {
  month: string;
  total_invoiced: number;
  total_paid: number;
  total_unpaid: number;
  gst_collected: number;
  invoice_count: number;
}

export interface TaxSummary {
  financial_year: string;
  total_income: number;
  total_gst: number;
  paid_invoices: number;
  unpaid_invoices: number;
  monthly: MonthlySummary[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// Clients
export const getClients = () => request<Client[]>("/clients/");
export const getClient = (id: number) => request<Client>(`/clients/${id}`);
export const createClient = (data: Omit<Client, "id">) =>
  request<Client>("/clients/", { method: "POST", body: JSON.stringify(data) });
export const updateClient = (id: number, data: Omit<Client, "id">) =>
  request<Client>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteClient = (id: number) =>
  request<{ ok: boolean }>(`/clients/${id}`, { method: "DELETE" });

// Invoices
export const getInvoices = (paid?: boolean) => {
  const q = paid !== undefined ? `?paid=${paid}` : "";
  return request<Invoice[]>(`/invoices/${q}`);
};
export const getInvoice = (id: number) => request<Invoice>(`/invoices/${id}`);
export const createInvoice = (data: unknown) =>
  request<Invoice>("/invoices/", { method: "POST", body: JSON.stringify(data) });
export const updateInvoice = (id: number, data: unknown) =>
  request<Invoice>(`/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteInvoice = (id: number) =>
  request<{ ok: boolean }>(`/invoices/${id}`, { method: "DELETE" });
export const markPaid = (id: number, paid: boolean, paid_date?: string) => {
  const params = new URLSearchParams({ paid: String(paid) });
  if (paid_date) params.append("paid_date", paid_date);
  return request<Invoice>(`/invoices/${id}/paid?${params}`, { method: "PATCH" });
};
export const pdfUrl = (id: number) => `${BASE}/invoices/${id}/pdf`;

// Summary
export const getTaxSummary = (fy_start: number) =>
  request<TaxSummary>(`/summary/tax?fy_start=${fy_start}`);

// Business Settings
export const getSettings = () => request<BusinessSettings>("/settings/");
export const updateSettings = (data: Omit<BusinessSettings, "next_invoice_seq" | "next_invoice_number" | "basiq_connected">) =>
  request<BusinessSettings>("/settings/", { method: "PUT", body: JSON.stringify(data) });

// Bank / Basiq
export const connectBank = () => request<{ url: string; user_id: string }>("/bank/connect", { method: "POST" });
export const getBankTransactions = () => request<BankTransaction[]>("/bank/transactions");
export const getReconcileMatches = () => request<ReconcileMatch[]>("/bank/reconcile");

// AI assistant (local Ollama agent)
export interface AIStatus {
  configured: boolean;
  model: string;
  detail: string;
  available_models: string[];
  provider: string;
  vision_model: string;
  vision_available: boolean;
}

export interface ExtractResponse {
  text: string;
  warnings: string[];
}

export interface ChatMessageT {
  role: "user" | "assistant";
  content: string;
}

export interface InvoiceProposalPayload {
  client_id: number | null;
  new_client: { name: string } | null;
  issue_date: string;
  due_date: string;
  notes: string | null;
  line_items: { description: string; quantity: number; unit_price: number; gst_rate: number }[];
}
export interface MarkPaidProposalPayload {
  invoice_id: number;
  paid_date: string;
}
export interface Proposal {
  kind: "invoice" | "mark_paid";
  title: string;
  summary: string;
  payload: InvoiceProposalPayload | MarkPaidProposalPayload;
}
export interface ChatResponse {
  reply: string;
  proposals: Proposal[];
}

export const getAIStatus = () => request<AIStatus>("/ai/status");
export const sendChat = (messages: ChatMessageT[]) =>
  request<ChatResponse>("/ai/chat", { method: "POST", body: JSON.stringify({ messages }) });

export const extractFromFiles = async (files: File[]): Promise<ExtractResponse> => {
  // Multipart — images go through the local vision model, PDFs/text are read directly.
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const res = await fetch(`${BASE}/ai/extract`, { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
};
