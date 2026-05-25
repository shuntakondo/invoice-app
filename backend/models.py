from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class BusinessSettings(Base):
    """Single-row table storing the user's business profile."""
    __tablename__ = "business_settings"

    id = Column(Integer, primary_key=True, default=1)
    name = Column(String, nullable=False, default="")
    abn = Column(String, default="")
    email = Column(String, default="")
    address = Column(Text, default="")
    # Monotonically increasing counter for auto-numbering invoices
    next_invoice_seq = Column(Integer, nullable=False, default=1)
    invoice_prefix = Column(String, nullable=False, default="INV")
    # Bank payment details (printed on invoices)
    bank_name = Column(String, default="")
    bank_account_name = Column(String, default="")
    bsb = Column(String, default="")
    account_number = Column(String, default="")
    # Basiq open banking
    basiq_api_key = Column(String, default="")
    basiq_user_id = Column(String, default="")


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String)
    phone = Column(String)
    address = Column(Text)
    abn = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    invoices = relationship("Invoice", back_populates="client")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    issue_date = Column(String, nullable=False)
    due_date = Column(String, nullable=False)
    paid = Column(Boolean, default=False)
    paid_date = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Sender (your business) info stored per invoice for historical accuracy
    sender_name = Column(String, nullable=False)
    sender_email = Column(String)
    sender_address = Column(Text)
    sender_abn = Column(String)

    client = relationship("Client", back_populates="invoices")
    line_items = relationship("LineItem", back_populates="invoice", cascade="all, delete-orphan")

    @property
    def subtotal(self):
        return sum(item.quantity * item.unit_price for item in self.line_items)

    @property
    def gst(self):
        return sum(item.quantity * item.unit_price * (item.gst_rate / 100) for item in self.line_items)

    @property
    def total(self):
        return self.subtotal + self.gst


class LineItem(Base):
    __tablename__ = "line_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=1)
    unit_price = Column(Float, nullable=False)
    gst_rate = Column(Float, nullable=False, default=10.0)  # GST % (0 or 10 for AU)

    invoice = relationship("Invoice", back_populates="line_items")
