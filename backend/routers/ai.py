import json
import os
from datetime import date, timedelta

import ollama
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
import models, schemas

router = APIRouter(prefix="/ai", tags=["ai"])

# Fully local — no API key, nothing leaves the machine. Configure via backend/.env.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5")
MAX_STEPS = 6  # cap the agent loop so a confused model can't spin forever

SYSTEM_PROMPT = """You are the assistant inside an Australian freelancer's invoicing app. You help \
the user by answering questions about their invoices, clients, and finances, and by preparing \
actions for them.

Tools:
- Read tools (list_clients, list_invoices, get_financial_summary) run immediately and return data. \
Use them to ground every factual answer — never guess numbers, look them up.
- Action tools (create_invoice, mark_invoice_paid) do NOT execute. They prepare a proposal that the \
user must confirm in the UI. Call them when the user asks to create an invoice or mark one paid. \
After proposing, tell the user briefly what you prepared and that they should confirm it.

Rules:
- Currency is AUD. GST in Australia is 10%: use gst_rate 10 for taxable items, 0 for GST-free.
- unit_price is GST-EXCLUSIVE per unit. Dates are YYYY-MM-DD.
- To act on a specific invoice (e.g. mark it paid), first look it up with list_invoices to get its id.
- Be concise and lead with the answer."""

TOOLS = [
    {"type": "function", "function": {
        "name": "list_clients",
        "description": "List all existing clients with their id, name, email, and ABN.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "list_invoices",
        "description": "List invoices with id, number, client, total, paid flag, dates, and overdue flag.",
        "parameters": {"type": "object", "properties": {
            "status": {"type": "string", "enum": ["all", "paid", "unpaid", "overdue"],
                       "description": "Filter; defaults to all"},
        }, "required": []},
    }},
    {"type": "function", "function": {
        "name": "get_financial_summary",
        "description": "Precomputed totals: invoiced, paid, unpaid, overdue amounts, GST collected, and counts.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "create_invoice",
        "description": "Prepare a NEW invoice for the user to confirm. Give client_id (existing) or client_name.",
        "parameters": {"type": "object", "properties": {
            "client_id": {"type": "integer", "description": "Existing client id, if known"},
            "client_name": {"type": "string", "description": "Client name; matched to an existing client or proposed as new"},
            "line_items": {"type": "array", "items": {"type": "object", "properties": {
                "description": {"type": "string"},
                "quantity": {"type": "number"},
                "unit_price": {"type": "number", "description": "GST-exclusive price per unit"},
                "gst_rate": {"type": "number", "description": "10 or 0"},
            }, "required": ["description", "unit_price"]}},
            "issue_date": {"type": "string", "description": "YYYY-MM-DD; defaults to today"},
            "due_date": {"type": "string", "description": "YYYY-MM-DD; defaults to issue date + 14 days"},
            "notes": {"type": "string"},
        }, "required": ["line_items"]},
    }},
    {"type": "function", "function": {
        "name": "mark_invoice_paid",
        "description": "Prepare to mark an existing invoice as paid for the user to confirm.",
        "parameters": {"type": "object", "properties": {
            "invoice_id": {"type": "integer"},
            "paid_date": {"type": "string", "description": "YYYY-MM-DD; defaults to today"},
        }, "required": ["invoice_id"]},
    }},
]


# --- Ollama connection / status ---------------------------------------------

def _client() -> ollama.Client:
    return ollama.Client(host=OLLAMA_HOST)


def _available_models() -> list:
    resp = _client().list()
    names = []
    for m in resp.models:
        name = getattr(m, "model", None) or getattr(m, "name", None)
        if name:
            names.append(name)
    return names


def _model_present(want: str, names: list) -> bool:
    base = want.split(":")[0]
    return any(n == want or n.split(":")[0] == base for n in names)


@router.get("/status", response_model=schemas.AIStatusOut)
def ai_status():
    try:
        names = _available_models()
    except Exception:
        return schemas.AIStatusOut(
            configured=False, model=OLLAMA_MODEL, available_models=[],
            detail=f"Ollama isn't reachable at {OLLAMA_HOST}. Install it from ollama.com, start it, "
                   f"then run: ollama pull {OLLAMA_MODEL}",
        )
    if not _model_present(OLLAMA_MODEL, names):
        return schemas.AIStatusOut(
            configured=False, model=OLLAMA_MODEL, available_models=names,
            detail=f"Model '{OLLAMA_MODEL}' isn't installed. Run: ollama pull {OLLAMA_MODEL} "
                   f"(or set OLLAMA_MODEL in backend/.env to one you have).",
        )
    return schemas.AIStatusOut(configured=True, model=OLLAMA_MODEL, available_models=names, detail="Ready")


# --- Read tools (executed immediately) --------------------------------------

def _client_dict(c) -> dict:
    return {"id": c.id, "name": c.name, "email": c.email or "", "abn": c.abn or ""}


def _invoice_row(inv, today: str) -> dict:
    return {
        "id": inv.id, "invoice_number": inv.invoice_number, "client": inv.client.name,
        "total": round(inv.total, 2), "paid": inv.paid,
        "issue_date": inv.issue_date, "due_date": inv.due_date,
        "overdue": (not inv.paid) and inv.due_date < today,
    }


def tool_list_clients(db: Session, args: dict) -> list:
    return [_client_dict(c) for c in db.query(models.Client).order_by(models.Client.name).all()]


def tool_list_invoices(db: Session, args: dict) -> list:
    today = date.today().isoformat()
    rows = [_invoice_row(i, today) for i in db.query(models.Invoice).order_by(models.Invoice.issue_date.desc()).all()]
    status = (args.get("status") or "all").lower()
    if status == "paid":
        rows = [r for r in rows if r["paid"]]
    elif status == "unpaid":
        rows = [r for r in rows if not r["paid"]]
    elif status == "overdue":
        rows = [r for r in rows if r["overdue"]]
    return rows


def tool_financial_summary(db: Session, args: dict) -> dict:
    today = date.today().isoformat()
    invoices = db.query(models.Invoice).all()
    totals = {"total_invoiced": 0.0, "total_paid": 0.0, "total_unpaid": 0.0,
              "overdue_amount": 0.0, "gst_collected_on_paid": 0.0}
    paid_count = unpaid_count = overdue_count = 0
    for inv in invoices:
        totals["total_invoiced"] += inv.total
        if inv.paid:
            totals["total_paid"] += inv.total
            totals["gst_collected_on_paid"] += inv.gst
            paid_count += 1
        else:
            totals["total_unpaid"] += inv.total
            unpaid_count += 1
            if inv.due_date < today:
                totals["overdue_amount"] += inv.total
                overdue_count += 1
    out = {k: round(v, 2) for k, v in totals.items()}
    out.update({"invoice_count": len(invoices), "paid_count": paid_count,
                "unpaid_count": unpaid_count, "overdue_count": overdue_count})
    return out


# --- Action tools (prepared as proposals, never executed here) --------------

def _safe_date(value, default: str) -> str:
    try:
        return date.fromisoformat(str(value)).isoformat()
    except (TypeError, ValueError):
        return default


def _coerce_line_items(raw) -> list:
    items = []
    for it in raw or []:
        if not isinstance(it, dict):
            continue
        desc = str(it.get("description") or "").strip()
        if not desc:
            continue
        try:
            qty = float(it.get("quantity", 1) or 1)
        except (TypeError, ValueError):
            qty = 1.0
        if qty <= 0:
            qty = 1.0
        try:
            price = float(it.get("unit_price", 0) or 0)
        except (TypeError, ValueError):
            price = 0.0
        # AU GST is binary: anything non-zero becomes 10%.
        gst = 0.0 if it.get("gst_rate") in (0, 0.0, "0") else 10.0
        items.append({"description": desc, "quantity": qty, "unit_price": price, "gst_rate": gst})
    return items


def build_invoice_proposal(db: Session, args: dict):
    items = _coerce_line_items(args.get("line_items"))
    if not items:
        return None

    today = date.today()
    issue = _safe_date(args.get("issue_date"), today.isoformat())
    due = _safe_date(args.get("due_date"), (date.fromisoformat(issue) + timedelta(days=14)).isoformat())

    client_id = args.get("client_id")
    new_client = None
    if client_id is not None and not db.query(models.Client).filter(models.Client.id == client_id).first():
        client_id = None
    name = str(args.get("client_name") or "").strip()
    if client_id is None and name:
        match = db.query(models.Client).filter(func.lower(models.Client.name) == name.lower()).first()
        if match:
            client_id = match.id
        else:
            new_client = {"name": name}

    if client_id is not None:
        display = db.query(models.Client).filter(models.Client.id == client_id).first().name
    elif new_client:
        display = f"{new_client['name']} (new client)"
    else:
        display = "(no client — pick one before confirming)"

    subtotal = sum(i["quantity"] * i["unit_price"] for i in items)
    gst = sum(i["quantity"] * i["unit_price"] * i["gst_rate"] / 100 for i in items)
    summary = (f"{display} · {len(items)} item(s) · subtotal ${subtotal:,.2f} "
               f"+ GST ${gst:,.2f} = ${subtotal + gst:,.2f} · due {due}")
    payload = {"client_id": client_id, "new_client": new_client, "issue_date": issue,
               "due_date": due, "notes": args.get("notes"), "line_items": items}
    return schemas.Proposal(kind="invoice", title="Create invoice", summary=summary, payload=payload)


def build_mark_paid_proposal(db: Session, args: dict):
    inv = db.query(models.Invoice).filter(models.Invoice.id == args.get("invoice_id")).first()
    if not inv or inv.paid:
        return None
    paid_date = _safe_date(args.get("paid_date"), date.today().isoformat())
    summary = f"{inv.invoice_number} · {inv.client.name} · ${inv.total:,.2f} → mark paid on {paid_date}"
    return schemas.Proposal(kind="mark_paid", title="Mark invoice paid", summary=summary,
                            payload={"invoice_id": inv.id, "paid_date": paid_date})


READ_TOOLS = {
    "list_clients": tool_list_clients,
    "list_invoices": tool_list_invoices,
    "get_financial_summary": tool_financial_summary,
}
ACTION_TOOLS = {
    "create_invoice": build_invoice_proposal,
    "mark_invoice_paid": build_mark_paid_proposal,
}


# --- Chat (agent loop) ------------------------------------------------------

@router.post("/chat", response_model=schemas.ChatResponse)
def chat(req: schemas.ChatRequest, db: Session = Depends(get_db)):
    status = ai_status()
    if not status.configured:
        raise HTTPException(status_code=400, detail=status.detail)

    history = [{"role": m.role, "content": m.content}
               for m in req.messages if m.role in ("user", "assistant") and m.content.strip()]
    if not history:
        raise HTTPException(status_code=400, detail="Send a message")

    sys = f"{SYSTEM_PROMPT}\n\nToday's date is {date.today().isoformat()}."
    messages = [{"role": "system", "content": sys}] + history

    client = _client()
    proposals: list = []
    reply = ""

    try:
        for _ in range(MAX_STEPS):
            resp = client.chat(model=OLLAMA_MODEL, messages=messages, tools=TOOLS, options={"temperature": 0})
            msg = resp.message
            messages.append(msg)  # preserve tool_calls for loop coherence
            calls = msg.tool_calls or []
            if not calls:
                reply = msg.content or ""
                break
            for tc in calls:
                name = tc.function.name
                args = dict(tc.function.arguments or {})
                if name in READ_TOOLS:
                    try:
                        result = READ_TOOLS[name](db, args)
                    except Exception as e:
                        result = {"error": str(e)}
                    messages.append({"role": "tool", "tool_name": name, "content": json.dumps(result, default=str)})
                elif name in ACTION_TOOLS:
                    proposal = ACTION_TOOLS[name](db, args)
                    if proposal is None:
                        messages.append({"role": "tool", "tool_name": name,
                                         "content": json.dumps({"error": "Could not prepare that action; recheck the details."})})
                    else:
                        proposals.append(proposal)
                        messages.append({"role": "tool", "tool_name": name,
                                         "content": json.dumps({"status": "prepared, awaiting user confirmation — do not call again"})})
                else:
                    messages.append({"role": "tool", "tool_name": name, "content": json.dumps({"error": "unknown tool"})})
        else:
            reply = reply or "I've prepared what I could — see below."
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama request failed: {e}")

    if not reply:
        reply = "I've prepared the action below — please review and confirm." if proposals else "(no response)"
    return schemas.ChatResponse(reply=reply, proposals=proposals)
