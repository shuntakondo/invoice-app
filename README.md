# Invoice App

A self-hosted invoicing tool I built to handle my own freelance billing in Australia — auto-numbered invoices, GST handling, PDF export, and a roadmap toward bank-feed reconciliation via Open Banking.

![Dashboard](docs/screenshots/dashboard.png)

## Why I built this

Off-the-shelf invoicing SaaS (Xero, Rounded, Hnry) is either overkill or expensive for a one-person freelance operation. I wanted:

- **Total control over the PDF layout** my clients see
- **Auto-incrementing invoice numbers** I never have to think about
- **Split-payment / milestone invoicing** as a first-class action (duplicate an existing invoice, tweak the amount, send Part 2 of 2)
- **A place to grow into** — Open Banking integration scaffolding so reconciling payments to invoices becomes a one-click action once I have more than one client

The app runs entirely on my laptop. No subscription, no data leaving my machine.

## Features

### Invoice list with status at a glance
Paid / Unpaid / Overdue badges driven by due-date logic, with one-click filters and inline actions (mark paid, duplicate, download PDF, delete).

![Invoices list](docs/screenshots/invoices.png)

### Professional PDF invoices
Sender details, ABN, GST breakdown, line items, payment terms — all rendered to a downloadable PDF via reportlab.

![Invoice detail](docs/screenshots/invoice-detail.png)

### Duplicate for split payments
A common freelance pattern: one project, paid in two or three milestones. The Duplicate action pre-fills a new invoice from any existing one, so issuing "Part 2 of 2" takes seconds. Contextual `?` help tooltips explain non-obvious fields like Due Date.

![New invoice with help tip](docs/screenshots/new-invoice.png)

### Tax summary by financial year
Quarterly and monthly breakdown aligned to the Australian financial year (1 Jul – 30 Jun), with GST collected, paid vs. outstanding totals, and per-month invoice count.

![Tax summary](docs/screenshots/tax-summary.png)

### Lightweight client book
Just enough fields to render correct invoices — name, ABN, email, phone, address.

![Clients](docs/screenshots/clients.png)

### Local AI assistant
A chat assistant that runs **entirely on your machine** via [Ollama](https://ollama.com) — no API key, no data leaving the laptop, in keeping with the rest of the app. Ask questions grounded in your own data (*"what's my total unpaid?"*, *"which invoices are overdue?"*) and it answers by calling read tools, never guessing numbers. Ask it to *do* things (*"invoice Davide for 2 days at $800/day"*, *"mark INV-003 paid"*) and it prepares the action as a **confirmation card** — money-touching changes only execute after you click *Confirm*, reusing the same APIs as the manual flow.

**Drag & drop** a quote or receipt (image, PDF, or text) onto the chat and it'll invoice from it: images run through a local vision model (qwen2.5vl) to transcribe the billable lines, which the tool-using agent then turns into a draft invoice — a two-model pipeline that keeps both vision *and* tool-calling local. Opt-in: install Ollama and pull a tool-capable model to enable it; the rest of the app works without it.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite | Pydantic v2 schemas, single-file SQLite DB |
| PDF | reportlab | Hand-rolled layout for full control of the invoice template |
| Frontend | Next.js 16 (App Router) + React 19 | Turbopack dev server |
| Styling | Tailwind CSS v4 | Plus lucide-react for icons |
| AI | Ollama (local LLM, e.g. qwen2.5) | Agentic assistant — answers questions over your data and prepares invoices/payments via tool calls, fully offline. See `backend/routers/ai.py` |
| Future | Basiq (Open Banking) | Scaffolded — see `backend/routers/bank.py`; activated once client volume justifies the per-user pricing |

## Getting started

Requires Python 3.9+ and Node.js 20+.

```bash
./start.sh
```

This script:
1. Creates a Python venv in `backend/`, installs `requirements.txt`
2. Starts FastAPI on `:8001`
3. Starts Next.js dev server on `:3002`

**Optional — enable the AI assistant:** install [Ollama](https://ollama.com), run `ollama pull qwen2.5`, and keep Ollama running. The **Assistant** tab then works fully locally — no API key, no data leaving your machine. Host/model are configurable in `backend/.env` (see `.env.example`); without Ollama the tab shows a setup hint and the rest of the app is unaffected.

Then:
- App: <http://localhost:3002>
- API docs (Swagger): <http://localhost:8001/docs>

First-run setup:
1. Go to **Settings** and fill in your business profile (name, ABN, bank details) — without this, invoice creation is blocked
2. Add a **Client**
3. Create an **Invoice**

## Project layout

```
backend/
  main.py               FastAPI entrypoint, CORS, router registration
  models.py             SQLAlchemy models (BusinessSettings, Client, Invoice, LineItem)
  schemas.py            Pydantic schemas for request/response
  pdf_generator.py      reportlab-based invoice PDF renderer
  routers/
    invoices.py         Invoice CRUD, paid toggle, PDF download
    clients.py          Client CRUD
    settings.py         Business profile + auto-numbering counter
    summary.py          FY-aligned tax summary aggregations
    bank.py             Basiq integration (scaffolded)
    ai.py               Local AI assistant (Ollama agent: Q&A + invoice/payment actions)

frontend/
  app/                  Next.js App Router pages
    invoices/[id]       Invoice detail
    invoices/new        New invoice form (handles ?from=<id> for duplicate)
    invoices/page.tsx   Invoice list
    assistant           Local AI assistant chat (Ollama)
    clients, summary, settings, bank
  components/
    Nav.tsx
    HelpTip.tsx         Reusable ? popover for form-field hints
  lib/api.ts            Typed API client
```

## Status

Personal-use, single-tenant. Not designed for multi-user or production hosting. The SQLite DB lives at `backend/invoice_app.db` and is git-ignored — bring your own data.
