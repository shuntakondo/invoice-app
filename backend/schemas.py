from pydantic import BaseModel, Field
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


# AI invoice drafting
class AIStatusOut(BaseModel):
    configured: bool  # true if an Anthropic API key is available


class AIDraftLineItem(BaseModel):
    description: str = Field(description="What the line item is for")
    quantity: float = Field(default=1, description="Number of units / hours / days")
    unit_price: float = Field(description="GST-EXCLUSIVE price per unit, in AUD")
    gst_rate: float = Field(default=10.0, description="GST percentage: 10 for taxable, 0 for GST-free")


class AIInvoiceDraft(BaseModel):
    """Structured invoice draft extracted by the AI from free text and/or attachments."""
    matched_client_id: Optional[int] = Field(
        default=None,
        description="id of an existing client that clearly matches the input, else null",
    )
    suggested_client_name: Optional[str] = Field(
        default=None, description="Proposed client name when no existing client matches"
    )
    suggested_client_email: Optional[str] = Field(default=None, description="Proposed client email, if known")
    suggested_client_abn: Optional[str] = Field(default=None, description="Proposed client ABN, if known")
    issue_date: Optional[str] = Field(default=None, description="Issue date as YYYY-MM-DD")
    due_date: Optional[str] = Field(default=None, description="Due date as YYYY-MM-DD")
    line_items: List[AIDraftLineItem] = Field(description="The billable line items (empty if none found)")
    notes: Optional[str] = Field(default=None, description="Optional note to print on the invoice")
    summary: str = Field(description="1-3 sentence plain-English summary of what was extracted and any assumptions")
