from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_RIGHT, TA_LEFT, TA_CENTER
from io import BytesIO
from datetime import date
from typing import Optional
from models import Invoice, BusinessSettings


BRAND_BLUE = colors.HexColor("#1e40af")
BRAND_LIGHT = colors.HexColor("#eff6ff")
GRAY = colors.HexColor("#6b7280")
DARK = colors.HexColor("#111827")
LIGHT_GRAY = colors.HexColor("#f3f4f6")
BORDER_GRAY = colors.HexColor("#e5e7eb")


def generate_invoice_pdf(invoice: Invoice, settings: Optional[BusinessSettings] = None) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
    )

    styles = getSampleStyleSheet()
    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph(
                f"<font size='22' color='#1e40af'><b>{invoice.sender_name}</b></font>",
                styles["Normal"],
            ),
            Paragraph(
                "<font size='28' color='#1e40af'><b>INVOICE</b></font>",
                ParagraphStyle("right", alignment=TA_RIGHT),
            ),
        ]
    ]
    header_table = Table(header_data, colWidths=["60%", "40%"])
    header_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(header_table)
    story.append(Spacer(1, 4 * mm))

    # Sender details + Invoice meta
    sender_lines = []
    if invoice.sender_abn:
        sender_lines.append(f"ABN: {invoice.sender_abn}")
    if invoice.sender_email:
        sender_lines.append(invoice.sender_email)
    if invoice.sender_address:
        for line in invoice.sender_address.split("\n"):
            sender_lines.append(line)

    def fmt_date(s: Optional[str]) -> Optional[str]:
        if not s:
            return None
        try:
            return date.fromisoformat(s).strftime("%d %b %Y")
        except (TypeError, ValueError):
            return s

    meta_lines = [
        f"<b>Invoice #:</b> {invoice.invoice_number}",
        f"<b>Issue Date:</b> {fmt_date(invoice.issue_date)}",
        f"<b>Due Date:</b> {fmt_date(invoice.due_date)}",
    ]
    if invoice.paid:
        meta_lines.append(f"<b>Status:</b> <font color='green'>PAID</font>")
        if invoice.paid_date:
            meta_lines.append(f"<b>Paid Date:</b> {fmt_date(invoice.paid_date)}")
    else:
        try:
            overdue = date.fromisoformat(invoice.due_date) < date.today()
        except (TypeError, ValueError):
            overdue = False
        if overdue:
            meta_lines.append("<b>Status:</b> <font color='red'>OVERDUE</font>")

    sender_text = "<br/>".join(sender_lines) or ""
    meta_text = "<br/>".join(meta_lines)

    details_data = [
        [
            Paragraph(sender_text, ParagraphStyle("sender", fontSize=9, textColor=GRAY, leading=14)),
            Paragraph(meta_text, ParagraphStyle("meta", alignment=TA_RIGHT, fontSize=9, leading=14)),
        ]
    ]
    details_table = Table(details_data, colWidths=["60%", "40%"])
    story.append(details_table)
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=BRAND_BLUE))
    story.append(Spacer(1, 5 * mm))

    # ── Bill To ──────────────────────────────────────────────────────────────
    story.append(
        Paragraph("<b>BILL TO</b>", ParagraphStyle("label", fontSize=8, textColor=GRAY, spaceAfter=2))
    )
    client = invoice.client
    bill_lines = [f"<b>{client.name}</b>"]
    if client.abn:
        bill_lines.append(f"ABN: {client.abn}")
    if client.email:
        bill_lines.append(client.email)
    if client.phone:
        bill_lines.append(client.phone)
    if client.address:
        for line in client.address.split("\n"):
            bill_lines.append(line)

    story.append(
        Paragraph(
            "<br/>".join(bill_lines),
            ParagraphStyle("billto", fontSize=10, leading=15),
        )
    )
    story.append(Spacer(1, 8 * mm))

    # ── Line Items Table ─────────────────────────────────────────────────────
    has_gst = invoice.gst > 0
    if has_gst:
        col_widths = ["45%", "12%", "18%", "12%", "13%"]
        header_row = [
            Paragraph("<b>Description</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white)),
            Paragraph("<b>Qty</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white, alignment=TA_CENTER)),
            Paragraph("<b>Unit Price</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white, alignment=TA_RIGHT)),
            Paragraph("<b>GST</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white, alignment=TA_CENTER)),
            Paragraph("<b>Amount</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white, alignment=TA_RIGHT)),
        ]
    else:
        col_widths = ["57%", "12%", "18%", "13%"]
        header_row = [
            Paragraph("<b>Description</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white)),
            Paragraph("<b>Qty</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white, alignment=TA_CENTER)),
            Paragraph("<b>Unit Price</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white, alignment=TA_RIGHT)),
            Paragraph("<b>Amount</b>", ParagraphStyle("th", fontSize=9, textColor=colors.white, alignment=TA_RIGHT)),
        ]

    table_data = [header_row]

    for i, item in enumerate(invoice.line_items):
        amount = item.quantity * item.unit_price
        row = [
            Paragraph(item.description, ParagraphStyle("td", fontSize=9)),
            Paragraph(f"{item.quantity:g}", ParagraphStyle("td_c", fontSize=9, alignment=TA_CENTER)),
            Paragraph(f"${item.unit_price:,.2f}", ParagraphStyle("td_r", fontSize=9, alignment=TA_RIGHT)),
        ]
        if has_gst:
            row.append(Paragraph(f"{item.gst_rate:g}%", ParagraphStyle("td_c", fontSize=9, alignment=TA_CENTER)))
        row.append(Paragraph(f"${amount:,.2f}", ParagraphStyle("td_r", fontSize=9, alignment=TA_RIGHT)))
        table_data.append(row)

    page_width = A4[0] - 30 * mm
    col_px = [page_width * float(w.rstrip("%")) / 100 for w in col_widths]

    items_table = Table(table_data, colWidths=col_px)
    item_style = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GRAY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    items_table.setStyle(TableStyle(item_style))
    story.append(items_table)
    story.append(Spacer(1, 6 * mm))

    # ── Totals ───────────────────────────────────────────────────────────────
    if has_gst:
        totals = [
            ["Subtotal (excl. GST)", f"${invoice.subtotal:,.2f}"],
            ["GST (10%)", f"${invoice.gst:,.2f}"],
            ["TOTAL", f"AUD ${invoice.total:,.2f}"],
        ]
    else:
        totals = [
            ["Subtotal", f"${invoice.subtotal:,.2f}"],
            ["TOTAL", f"AUD ${invoice.total:,.2f}"],
        ]
    total_row = len(totals) - 1
    totals_table = Table(totals, colWidths=["75%", "25%"])
    totals_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (0, total_row), (-1, total_row), 1.5, BRAND_BLUE),
        ("FONTNAME", (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ("FONTSIZE", (0, total_row), (-1, total_row), 11),
        ("TEXTCOLOR", (0, total_row), (-1, total_row), BRAND_BLUE),
        ("BACKGROUND", (0, total_row), (-1, total_row), BRAND_LIGHT),
        ("RIGHTPADDING", (1, 0), (1, -1), 4),
    ]))
    story.append(totals_table)

    # ── Payment Details ───────────────────────────────────────────────────────
    has_bank = settings and (settings.bsb or settings.account_number)
    if has_bank:
        story.append(Spacer(1, 8 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY))
        story.append(Spacer(1, 4 * mm))
        story.append(
            Paragraph("<b>Payment Details</b>", ParagraphStyle("bank_h", fontSize=9, textColor=GRAY, spaceAfter=4))
        )
        bank_lines = []
        if settings.bank_name:
            bank_lines.append(f"<b>Bank:</b> {settings.bank_name}")
        if settings.bank_account_name:
            bank_lines.append(f"<b>Account Name:</b> {settings.bank_account_name}")
        if settings.bsb:
            bank_lines.append(f"<b>BSB:</b> {settings.bsb}")
        if settings.account_number:
            bank_lines.append(f"<b>Account Number:</b> {settings.account_number}")
        bank_lines.append(f"<b>Reference:</b> {invoice.invoice_number}")

        bank_box_data = [[
            Paragraph("<br/>".join(bank_lines), ParagraphStyle("bank_body", fontSize=9, leading=14))
        ]]
        bank_box = Table(bank_box_data, colWidths=["100%"])
        bank_box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BRAND_LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.5, BRAND_BLUE),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(bank_box)

    # ── Notes ────────────────────────────────────────────────────────────────
    if invoice.notes:
        story.append(Spacer(1, 8 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY))
        story.append(Spacer(1, 4 * mm))
        story.append(
            Paragraph("<b>Notes</b>", ParagraphStyle("notes_h", fontSize=9, textColor=GRAY, spaceAfter=3))
        )
        story.append(
            Paragraph(invoice.notes.replace("\n", "<br/>"), ParagraphStyle("notes", fontSize=9, leading=13))
        )

    doc.build(story)
    return buffer.getvalue()
