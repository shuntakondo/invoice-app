from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
import models, schemas

router = APIRouter(prefix="/settings", tags=["settings"])


def get_or_create_settings(db: Session) -> models.BusinessSettings:
    s = db.query(models.BusinessSettings).first()
    if not s:
        s = models.BusinessSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def format_invoice_number(prefix: str, seq: int) -> str:
    return f"{prefix}-{seq:03d}"


def _settings_out(s: models.BusinessSettings) -> dict:
    data = {c.name: getattr(s, c.name) for c in s.__table__.columns}
    data["next_invoice_number"] = format_invoice_number(s.invoice_prefix, s.next_invoice_seq)
    data["basiq_connected"] = bool(s.basiq_user_id)
    # Mask API key — only return whether it's set, not the value
    data["basiq_api_key"] = "••••••••" if s.basiq_api_key else ""
    return data


@router.get("/", response_model=schemas.BusinessSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _settings_out(get_or_create_settings(db))


@router.put("/", response_model=schemas.BusinessSettingsOut)
def update_settings(update: schemas.BusinessSettingsUpdate, db: Session = Depends(get_db)):
    s = get_or_create_settings(db)
    for field, value in update.model_dump(exclude_unset=True).items():
        # Don't overwrite the real API key when the masked placeholder is sent back
        if field == "basiq_api_key" and value and set(value) == {"•"}:
            continue
        if value is not None:
            setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return _settings_out(s)
