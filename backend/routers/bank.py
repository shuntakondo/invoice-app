import base64
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import httpx
from database import get_db
from routers.settings import get_or_create_settings
from schemas import BankTransaction, ReconcileMatch
import models

router = APIRouter(prefix="/bank", tags=["bank"])

BASIQ_URL = "https://au-api.basiq.io"


def _token(api_key: str) -> str:
    """Exchange a Basiq API key for a short-lived bearer token."""
    credentials = base64.b64encode(f"{api_key}:".encode()).decode()
    resp = httpx.post(
        f"{BASIQ_URL}/token",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
            "basiq-version": "3.0",
        },
        data={"scope": "SERVER_ACCESS"},
        timeout=15,
    )
    if resp.status_code != 200:
        raise HTTPException(502, f"Basiq auth failed: {resp.text}")
    return resp.json()["access_token"]


def _basiq_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "basiq-version": "3.0",
    }


@router.post("/connect")
def connect_bank(db: Session = Depends(get_db)):
    """
    Create (or reuse) a Basiq user for this account and return a
    consent URL the user opens to link their bank.
    """
    s = get_or_create_settings(db)
    if not s.basiq_api_key:
        raise HTTPException(400, "Add your Basiq API key in Settings first")

    token = _token(s.basiq_api_key)

    # Create user if not yet done
    if not s.basiq_user_id:
        resp = httpx.post(
            f"{BASIQ_URL}/users",
            headers=_basiq_headers(token),
            json={"email": s.email or "invoiceapp@local"},
            timeout=15,
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(502, f"Basiq create user failed: {resp.text}")
        s.basiq_user_id = resp.json()["id"]
        db.commit()

    # Generate a consent / auth link
    resp = httpx.post(
        f"{BASIQ_URL}/users/{s.basiq_user_id}/auth_link",
        headers=_basiq_headers(token),
        json={},
        timeout=15,
    )
    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"Basiq auth link failed: {resp.text}")

    data = resp.json()
    # Basiq v3 returns the URL under links.public or directly as "url"
    url = data.get("links", {}).get("public") or data.get("url") or data.get("links", {}).get("self")
    return {"url": url, "user_id": s.basiq_user_id}


@router.get("/transactions", response_model=List[BankTransaction])
def get_transactions(db: Session = Depends(get_db)):
    """Fetch recent credit transactions from all connected accounts."""
    s = get_or_create_settings(db)
    if not s.basiq_api_key:
        raise HTTPException(400, "Add your Basiq API key in Settings first")
    if not s.basiq_user_id:
        raise HTTPException(400, "Connect your bank first")

    token = _token(s.basiq_api_key)
    resp = httpx.get(
        f"{BASIQ_URL}/users/{s.basiq_user_id}/transactions",
        headers=_basiq_headers(token),
        params={"filter": "transaction.direction==credit", "limit": "100"},
        timeout=20,
    )
    if resp.status_code != 200:
        raise HTTPException(502, f"Basiq transactions failed: {resp.text}")

    raw = resp.json().get("data", [])
    results: List[BankTransaction] = []
    for t in raw:
        try:
            results.append(BankTransaction(
                id=t["id"],
                date=t.get("postDate") or t.get("transactionDate", ""),
                description=t.get("description", ""),
                amount=abs(float(t.get("amount", 0))),
                direction=t.get("direction", "credit"),
                account=t.get("account", {}).get("id") if isinstance(t.get("account"), dict) else None,
            ))
        except Exception:
            continue
    return results


@router.get("/reconcile", response_model=List[ReconcileMatch])
def reconcile(db: Session = Depends(get_db)):
    """
    Match incoming bank transactions against unpaid invoices.
    Returns suggested matches; the client confirms each one.
    """
    unpaid = db.query(models.Invoice).filter(models.Invoice.paid == False).all()
    if not unpaid:
        return []

    transactions = get_transactions(db)

    matches: List[ReconcileMatch] = []
    for txn in transactions:
        for inv in unpaid:
            amount_match = abs(txn.amount - inv.total) < 0.02  # within 2 cents
            ref_match = inv.invoice_number.lower() in txn.description.lower()

            if amount_match:
                matches.append(ReconcileMatch(
                    transaction=txn,
                    invoice_id=inv.id,
                    invoice_number=inv.invoice_number,
                    invoice_total=inv.total,
                    confidence="amount+ref" if ref_match else "amount",
                ))

    # Sort: high-confidence matches first
    matches.sort(key=lambda m: (0 if m.confidence == "amount+ref" else 1, m.transaction.date), reverse=False)
    return matches
