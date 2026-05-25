from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routers import clients, invoices, summary, settings, bank

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Invoice Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings.router, prefix="/api")
app.include_router(clients.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(summary.router, prefix="/api")
app.include_router(bank.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
