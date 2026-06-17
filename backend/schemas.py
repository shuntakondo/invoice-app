from pydantic import BaseModel
from typing import Optional, List


# Line Items
class LineItemCreate(BaseModel):
    description: str
    quantity: float = 1
    unit_price: float
    gst_rate: float = 10.0


class LineItemOut(LineItemCreate):
    id: int
    invoice_id: int

    model_config = {"from_attributes": True}


# Clients
class ClientCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    abn: Optional[str] = None


class ClientUpdate(ClientCreate):
    pass


class ClientOut(ClientCreate):
    id: int

    model_config = {"from_attributes": True}


# Business Settings
class BusinessSettingsUpdate(BaseModel):
    name: str
    abn: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    invoice_prefix: Optional[str] = "INV"
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bsb: Optional[str] = None
    account_number: Optional[str] = None
    basiq_api_key: Optional[str] = None


class BusinessSettingsOut(BusinessSettingsUpdate):
    next_invoice_seq: int
    next_invoice_number: str  # computed preview, e.g. "INV-003"
    basiq_connected: bool       # true if a user_id is stored
    basiq_api_key: Optional[str] = None  # returned masked

    model_config = {"from_attributes": True}


# Bank reconciliation
class BankTransaction(BaseModel):
    id: str
    date: str
    description: str
    amount: float
    direction: str  # "credit" | "debit"
    account: Optional[str] = None


class ReconcileMatch(BaseModel):
    transaction: BankTransaction
    invoice_id: int
    invoice_number: str
    invoice_total: float
    confidence: str  # "amount+ref" | "amount"


# Invoices
class InvoiceCreate(BaseModel):
    client_id: int
    issue_date: str
    due_date: str
    notes: Optional[str] = None
    line_items: List[LineItemCreate]


class InvoiceUpdate(BaseModel):
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[List[LineItemCreate]] = None


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    client_id: int
    client: ClientOut
    issue_date: str
    due_date: str
    paid: bool
    paid_date: Optional[str]
    notes: Optional[str]
    sender_name: str
    sender_email: Optional[str]
    sender_address: Optional[str]
    sender_abn: Optional[str]
    line_items: List[LineItemOut]
    subtotal: float
    gst: float
    total: float

    model_config = {"from_attributes": True}


# Summary
class MonthlySummary(BaseModel):
    month: str
    total_invoiced: float
    total_paid: float
    total_unpaid: float
    gst_collected: float
    invoice_count: int


class TaxSummary(BaseModel):
    financial_year: str
    total_income: float
    total_gst: float
    paid_invoices: int
    unpaid_invoices: int
    monthly: List[MonthlySummary]


# AI assistant (local Ollama agent)
class AIStatusOut(BaseModel):
    configured: bool          # true if Ollama is reachable and the tool model is installed
    model: str                # the configured Ollama tool model
    detail: str               # human-readable status / setup hint
    available_models: List[str] = []
    provider: str = "ollama"
    vision_model: str = ""    # model used to read image/PDF attachments
    vision_available: bool = False


class ExtractResponse(BaseModel):
    text: str                 # extracted text from attachments, for the agent
    warnings: List[str] = []


class ChatMessage(BaseModel):
    role: str                 # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class Proposal(BaseModel):
    """A state-changing action the agent prepared for the user to confirm."""
    kind: str                 # "invoice" | "mark_paid"
    title: str
    summary: str              # human-readable line for the confirmation card
    payload: dict             # exact args the frontend uses to call the existing API


class ChatResponse(BaseModel):
    reply: str
    proposals: List[Proposal] = []
