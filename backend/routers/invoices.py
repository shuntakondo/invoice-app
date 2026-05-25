import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from io import BytesIO
from database import get_db
from pdf_generator import generate_invoice_pdf
from routers.settings import get_or_create_settings, format_invoice_number
import models, schemas

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("/", response_model=List[schemas.InvoiceOut])
def list_invoices(paid: Optional[bool] = None, db: Session = Depends(get_db)):
    q = db.query(models.Invoice)
    if paid is not None:
        q = q.filter(models.Invoice.paid == paid)
    return q.order_by(models.Invoice.issue_date.desc()).all()


@router.post("/", response_model=schemas.InvoiceOut)
def create_invoice(invoice: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    client = db.query(models.Client).filter(models.Client.id == invoice.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    settings = get_or_create_settings(db)
    if not settings.name:
        raise HTTPException(status_code=400, detail="Set up your business profile in Settings before creating invoices")

    # Assign the next sequential invoice number and increment the counter
    invoice_number = format_invoice_number(settings.invoice_prefix, settings.next_invoice_seq)
    settings.next_invoice_seq += 1

    line_items_data = invoice.line_items
    db_invoice = models.Invoice(
        invoice_number=invoice_number,
        client_id=invoice.client_id,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        notes=invoice.notes,
        sender_name=settings.name,
        sender_email=settings.email,
        sender_address=settings.address,
        sender_abn=settings.abn,
    )
    db.add(db_invoice)
    db.flush()

    for item in line_items_data:
        db_item = models.LineItem(invoice_id=db_invoice.id, **item.model_dump())
        db.add(db_item)

    db.commit()
    db.refresh(db_invoice)
    return db_invoice


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(invoice_id: int, update: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    data = update.model_dump(exclude_unset=True)
    line_items = data.pop("line_items", None)

    for field, value in data.items():
        setattr(invoice, field, value)

    if line_items is not None:
        for item in invoice.line_items:
            db.delete(item)
        db.flush()
        for item in line_items:
            db_item = models.LineItem(invoice_id=invoice.id, **item)
            db.add(db_item)

    db.commit()
    db.refresh(invoice)
    return invoice


@router.patch("/{invoice_id}/paid", response_model=schemas.InvoiceOut)
def toggle_paid(invoice_id: int, paid: bool, paid_date: Optional[str] = None, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice.paid = paid
    invoice.paid_date = paid_date if paid else None
    db.commit()
    db.refresh(invoice)
    return invoice


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    db.delete(invoice)
    db.commit()
    return {"ok": True}


@router.get("/{invoice_id}/pdf")
def download_pdf(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.Invoice).filter(models.Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    settings = db.query(models.BusinessSettings).first()
    pdf_bytes = generate_invoice_pdf(invoice, settings)
    sender_slug = re.sub(r"[^A-Za-z0-9]+", "-", invoice.sender_name or "").strip("-") or "invoice"
    filename = f"invoice_{invoice.issue_date}_{sender_slug}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
