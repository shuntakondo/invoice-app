import base64
import os
from datetime import date
from typing import List, Optional

import anthropic
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
import models, schemas

router = APIRouter(prefix="/ai", tags=["ai"])

# Latest, most capable Claude model — strong at vision + structured extraction.
MODEL = "claude-opus-4-8"
SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAX_FILES = 8
MAX_FILE_BYTES = 8 * 1024 * 1024  # 8 MB per file

SYSTEM_PROMPT = """You are an assistant inside an Australian freelancer's invoicing app. \
Turn raw project information — emails, chat messages, quotes, scope notes, or photos/PDFs of \
receipts and estimates — into a structured invoice draft.

Rules:
- Currency is AUD. GST (goods & services tax) in Australia is 10%. Use gst_rate 10 for normal \
taxable services/goods, and 0 only when the source clearly indicates GST-free or no GST.
- unit_price is the GST-EXCLUSIVE price per unit. The app adds GST on top using gst_rate. If the \
source gives a GST-inclusive amount, convert it to the ex-GST value (divide by 1.1 for 10% GST) \
and say so in the summary.
- Dates must be ISO format YYYY-MM-DD. If an issue date is not stated, use today's date. If a due \
date is not stated, use 14 days after the issue date (Net 14 is standard in Australia).
- Match the client against the provided existing-clients list by name (allow minor spelling or \
formatting differences). On a clear match, set matched_client_id to that client's id and leave the \
suggested_client_* fields null. With no clear match, leave matched_client_id null and fill the \
suggested_client_* fields so the user can create the client.
- Break the work into clear line items with sensible descriptions, quantities, and unit prices. If \
only a total is given, use a single line item with quantity 1.
- In summary, briefly explain what you extracted and any assumptions (GST handling, inferred dates, \
ambiguous amounts). Keep it to 1-3 sentences.
- Never invent a client, amount, or date with no basis in the input. If the input contains no \
billable information, return an empty line_items list and say so in the summary."""


def _api_key() -> Optional[str]:
    key = os.environ.get("ANTHROPIC_API_KEY")
    return key or None


@router.get("/status", response_model=schemas.AIStatusOut)
def ai_status():
    return {"configured": bool(_api_key())}


def _build_content(text: str, files: List[UploadFile]) -> list:
    """Turn the user's text + uploads into Claude message content blocks."""
    blocks: list = []
    for f in files:
        raw = f.file.read()
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"File '{f.filename}' exceeds the 8 MB limit")
        ctype = (f.content_type or "").lower()
        b64 = base64.standard_b64encode(raw).decode("utf-8")
        if ctype in SUPPORTED_IMAGE_TYPES:
            blocks.append({
                "type": "image",
                "source": {"type": "base64", "media_type": ctype, "data": b64},
            })
        elif ctype == "application/pdf":
            blocks.append({
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
            })
        else:
            # Best effort: treat unknown/text uploads as plain text
            try:
                blocks.append({"type": "text", "text": f"[Attached file: {f.filename}]\n{raw.decode('utf-8')}"})
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type '{ctype or 'unknown'}' for '{f.filename}'. Use an image, PDF, or text file.",
                )

    if text.strip():
        blocks.append({"type": "text", "text": text.strip()})

    if not blocks:
        raise HTTPException(status_code=400, detail="Provide some text or attach a file for the AI to work from")
    return blocks


@router.post("/draft-invoice", response_model=schemas.AIInvoiceDraft)
def draft_invoice(
    text: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    key = _api_key()
    if not key:
        raise HTTPException(
            status_code=400,
            detail="AI is not configured. Set ANTHROPIC_API_KEY in the backend environment (see backend/.env.example).",
        )
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Attach at most {MAX_FILES} files")

    content = _build_content(text, files)

    clients = db.query(models.Client).order_by(models.Client.name).all()
    client_lines = "\n".join(
        f"- id={c.id}: {c.name}"
        + (f" (ABN {c.abn})" if c.abn else "")
        + (f" <{c.email}>" if c.email else "")
        for c in clients
    ) or "(no existing clients yet)"

    context = (
        f"Today's date is {date.today().isoformat()}.\n\n"
        f"Existing clients:\n{client_lines}\n\n"
        "Extract an invoice draft from the following information:"
    )
    content = [{"type": "text", "text": context}] + content

    client = anthropic.Anthropic(api_key=key)
    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            output_format=schemas.AIInvoiceDraft,
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"AI request failed: {getattr(e, 'message', str(e))}")
    except Exception as e:  # network / validation / unexpected
        raise HTTPException(status_code=502, detail=f"AI request failed: {e}")

    if getattr(response, "stop_reason", None) == "refusal":
        raise HTTPException(status_code=400, detail="The AI declined this request. Try different input.")

    draft = response.parsed_output
    if draft is None:
        raise HTTPException(
            status_code=502,
            detail="The AI could not produce a valid invoice draft. Try rephrasing or adding more detail.",
        )

    # Guard against a hallucinated client id that no longer exists.
    if draft.matched_client_id is not None and not any(c.id == draft.matched_client_id for c in clients):
        draft.matched_client_id = None

    return draft
