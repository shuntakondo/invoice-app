import { test, expect, Page } from "@playwright/test";

// --- Mock backend responses (no Python/Ollama needed) ---

const STATUS_OK = {
  configured: true, model: "qwen2.5", detail: "Ready",
  available_models: ["qwen2.5", "qwen2.5vl:7b"], provider: "ollama",
  vision_model: "qwen2.5vl", vision_available: true,
};

const SETTINGS = {
  name: "Shunta Kondo", abn: "54 770 404 546", email: "shunta.kondo.dev@gmail.com",
  invoice_prefix: "INV", next_invoice_seq: 7, next_invoice_number: "INV-007", basiq_connected: false,
};

const CLIENTS = [{ id: 1, name: "Davide Soldati", email: "", abn: "" }];

const INVOICE_PROPOSAL = {
  kind: "invoice",
  title: "Create invoice",
  summary:
    "Davide Soldati · 1 item(s) · subtotal $300.00 + GST $30.00 = $330.00 · due 2026-07-01\nNote: Net 7 days; ref PROJ-42",
  payload: {
    client_id: 1, new_client: null, issue_date: "2026-06-17", due_date: "2026-07-01",
    notes: "Net 7 days; ref PROJ-42",
    line_items: [{ description: "Consulting", quantity: 2, unit_price: 150, gst_rate: 10 }],
  },
};

async function mockCommon(page: Page, status = STATUS_OK) {
  await page.route("**/api/ai/status", (r) => r.fulfill({ json: status }));
  await page.route("**/api/clients/", (r) => {
    if (r.request().method() === "POST") return r.fulfill({ json: { id: 9, name: "New Co" } });
    return r.fulfill({ json: CLIENTS });
  });
  await page.route("**/api/settings/", (r) => r.fulfill({ json: SETTINGS }));
}

async function mockChat(page: Page, reply: string, proposals: unknown[] = []) {
  await page.route("**/api/ai/chat", (r) => r.fulfill({ json: { reply, proposals } }));
}

test("shows the reply and an invoice proposal", async ({ page }) => {
  await mockCommon(page);
  await mockChat(page, "I've prepared an invoice for Davide — please review and confirm.", [INVOICE_PROPOSAL]);

  await page.goto("/assistant");
  await page.getByPlaceholder(/Ask a question/).fill("Invoice Davide for 2 hours at $150/hr");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/prepared an invoice for Davide/)).toBeVisible();
  await expect(page.getByText(/subtotal \$300\.00 \+ GST/)).toBeVisible();
  await expect(page.getByText(/Note: Net 7 days; ref PROJ-42/)).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/01-proposal.png", fullPage: true });
});

test("Review & edit opens a pre-filled editable drawer", async ({ page }) => {
  await mockCommon(page);
  await mockChat(page, "Prepared — review and confirm.", [INVOICE_PROPOSAL]);

  await page.goto("/assistant");
  await page.getByPlaceholder(/Ask a question/).fill("Invoice Davide");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: /Review & edit/ }).click();

  await expect(page.getByRole("heading", { name: "Review & edit invoice" })).toBeVisible();
  await expect(page.locator('input[placeholder="Description"]').first()).toHaveValue("Consulting");
  await expect(page.getByPlaceholder(/Payment terms/)).toHaveValue("Net 7 days; ref PROJ-42");
  // totals reflect the pre-filled line item (2 x $150 + 10% GST)
  await expect(page.getByText("$330.00").first()).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/02-drawer.png", fullPage: true });
});

test("creating from the drawer marks the proposal done", async ({ page }) => {
  await mockCommon(page);
  await mockChat(page, "Prepared.", [INVOICE_PROPOSAL]);
  await page.route("**/api/invoices/", (r) =>
    r.fulfill({ json: { id: 7, invoice_number: "INV-007" } })
  );

  await page.goto("/assistant");
  await page.getByPlaceholder(/Ask a question/).fill("Invoice Davide");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: /Review & edit/ }).click();
  await page.getByRole("button", { name: "Create invoice" }).click();

  await expect(page.getByText(/Created INV-007/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review & edit invoice" })).toBeHidden();
  await page.screenshot({ path: "e2e/screenshots/03-created.png", fullPage: true });
});

test("attaching a file extracts it and sends the text to the agent", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/ai/extract", (r) =>
    r.fulfill({ json: { text: "[Image: quote.png]\nWebsite audit $1200", warnings: [] } })
  );
  let chatBody = "";
  await page.route("**/api/ai/chat", async (r) => {
    chatBody = r.request().postData() || "";
    await r.fulfill({ json: { reply: "Got the quote.", proposals: [] } });
  });

  await page.goto("/assistant");
  await page.setInputFiles('input[type="file"]', {
    name: "quote.png", mimeType: "image/png", buffer: Buffer.from("fake-image-bytes"),
  });
  await expect(page.getByText("quote.png")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/04-attachment-chip.png", fullPage: true });

  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Got the quote.")).toBeVisible();
  expect(chatBody).toContain("Website audit $1200"); // extracted text was forwarded to the agent
});

test("the chat panel fills the viewport height", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/assistant");
  await expect(page.getByPlaceholder(/Ask a question/)).toBeVisible();
  // The composer should sit near the bottom of the viewport, not float mid-page.
  const composer = page.getByPlaceholder(/Ask a question/);
  const box = await composer.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y).toBeGreaterThan(viewport!.height * 0.7);
  await page.screenshot({ path: "e2e/screenshots/06-layout.png" }); // viewport-sized
});

test("shows a setup hint when Ollama is not configured", async ({ page }) => {
  await mockCommon(page, {
    ...STATUS_OK, configured: false, available_models: [],
    detail: "Ollama isn't reachable at http://localhost:11434. Install it from ollama.com.",
  });

  await page.goto("/assistant");
  await expect(page.getByText(/Ollama isn't reachable/)).toBeVisible();
  await expect(page.getByPlaceholder(/Set up Ollama/)).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/05-setup-hint.png", fullPage: true });
});
