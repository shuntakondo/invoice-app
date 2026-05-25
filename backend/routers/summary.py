from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from schemas import TaxSummary, MonthlySummary
import models
from collections import defaultdict

router = APIRouter(prefix="/summary", tags=["summary"])


def get_financial_year(year: int):
    """AU financial year: 1 Jul – 30 Jun"""
    return f"{year}-{year+1}"


@router.get("/tax", response_model=TaxSummary)
def tax_summary(fy_start: int = Query(..., description="Financial year start (e.g. 2024 for FY2024-25)"), db: Session = Depends(get_db)):
    start_date = f"{fy_start}-07-01"
    end_date = f"{fy_start+1}-06-30"

    invoices = (
        db.query(models.Invoice)
        .filter(models.Invoice.issue_date >= start_date)
        .filter(models.Invoice.issue_date <= end_date)
        .all()
    )

    monthly: dict[str, dict] = defaultdict(lambda: {
        "total_invoiced": 0.0,
        "total_paid": 0.0,
        "total_unpaid": 0.0,
        "gst_collected": 0.0,
        "invoice_count": 0,
    })

    total_income = 0.0
    total_gst = 0.0
    paid_count = 0
    unpaid_count = 0

    for inv in invoices:
        month_key = inv.issue_date[:7]  # "YYYY-MM"
        total = inv.total
        gst = inv.gst

        monthly[month_key]["invoice_count"] += 1
        monthly[month_key]["total_invoiced"] += total
        monthly[month_key]["gst_collected"] += gst

        if inv.paid:
            monthly[month_key]["total_paid"] += total
            total_income += total
            total_gst += gst
            paid_count += 1
        else:
            monthly[month_key]["total_unpaid"] += total
            unpaid_count += 1

    monthly_list = sorted(
        [MonthlySummary(month=k, **v) for k, v in monthly.items()],
        key=lambda x: x.month,
    )

    return TaxSummary(
        financial_year=get_financial_year(fy_start),
        total_income=total_income,
        total_gst=total_gst,
        paid_invoices=paid_count,
        unpaid_invoices=unpaid_count,
        monthly=monthly_list,
    )
