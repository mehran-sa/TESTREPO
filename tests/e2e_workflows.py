"""
End-to-end workflow checks for SA Invoice Generator in headless Chromium.

Optional tooling: needs Python 3 and Playwright
(pip install playwright && playwright install chromium). The app itself has no
dependencies. Run from the project folder:

    python3 tests/e2e_workflows.py

The script serves the folder on 127.0.0.1, drives the real UI, and fails if any
request leaves 127.0.0.1, if the page logs an error, or if a workflow check
fails. Screenshots are written to tests/output/.
"""

import json, os, subprocess, sys, time, tempfile, zipfile, io, struct, zlib, re

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tests", "output")
os.makedirs(OUT, exist_ok=True)
OUT_PREFIX = "single-" if os.environ.get("E2E_TARGET") == "single" else ""
PORT = int(os.environ.get("E2E_PORT", "8781"))
# E2E_TARGET=single tests the built SA-Invoice-Generator.html opened from disk
# (file://) instead of index.html served over HTTP.
SINGLE = os.environ.get("E2E_TARGET") == "single"
if SINGLE:
    ORIGIN = "file://"
    URL = "file://" + os.path.join(ROOT, "SA-Invoice-Generator.html")
else:
    ORIGIN = f"http://127.0.0.1:{PORT}"
    URL = ORIGIN + "/index.html"
FIX = tempfile.mkdtemp(prefix="sa-invoice-e2e-")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))


# ----------------------------------------------------------------- fixtures

def png_bytes(w=8, h=8):
    raw = b"".join(b"\x00" + b"\x22\x66\xcc" * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def write(name, data, mode="w"):
    path = os.path.join(FIX, name)
    with open(path, mode) as f:
        f.write(data)
    return path


def xlsx(rows):
    """Minimal valid .xlsx with inline strings, built without any library."""
    def cell(ref, v):
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"><v>{v}</v></c>'
        v = str(v).replace("&", "&amp;").replace("<", "&lt;")
        return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{v}</t></is></c>'
    sheet_rows = "".join(
        f'<row r="{r+1}">' + "".join(cell(f"{chr(65+c)}{r+1}", v) for c, v in enumerate(row)) + "</row>"
        for r, row in enumerate(rows))
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{sheet_rows}</sheetData></worksheet>',
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, d in files.items():
            z.writestr(n, d)
    return buf.getvalue()


LOGO = write("logo.png", png_bytes(), "wb")


def noise_png(w, h):
    raw = b"".join(b"\x00" + os.urandom(w * 3) for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 0)) + chunk(b"IEND", b""))


BIG_LOGO = write("big-logo.png", noise_png(1300, 700), "wb")
ITEMS_XLSX = write("items.xlsx", xlsx([
    ["Royalty statement"], [],
    ["SKU", "Name", "Net Qty", "Royalty"],
    ["S1", "Course one", 2, 30.5],
    ["S2", "Course two", 1, 9.99],
    [], ["Total royalty", "", "", 40.49]]), "wb")
BUNDLE_XLSX = write("bundles.xlsx", xlsx([
    ["SKU", "Name", "Net Qty", "Royalty"],
    ["1", "Alpha course\n in Mega Bundle", 3, 12.25],
    ["2", "Beta course\n in Mega Bundle", 1, 7.75],
    ["3", "Gamma course\n in Small Bundle", 2, 5]]), "wb")
CSV = write("items.csv", 'SKU,Description,Qty,Rate\nA1,"Widget, large",2,"1,234.50"\nA2,Gadget,1,£99.99\n')
NOT_INVOICE = write("package.json", json.dumps({"name": "something-else", "version": "1.0.0"}))
BROKEN = write("broken.json", "{oops")
HOSTILE = write("hostile.json", json.dumps({
    "fields": {"invoiceNumber": "HX-1", "template": "nope"},
    "logo": "https://example.com/track.png",
    "columns": [{"key": "d", "label": "<b>Desc</b>", "width": '"><img src=x onerror=window.__pwned=1>'}],
    "items": [{"d": "<script>window.__pwned=1</script>"}]}))


# ------------------------------------------------------------------- run

server = None if SINGLE else subprocess.Popen(
    [sys.executable, os.path.join(ROOT, "serve.py"), str(PORT), "--no-browser"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True,
                                  timezone_id="Europe/London")
        page = ctx.new_page()
        errors, external = [], []
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

        def on_request(r):
            if not (r.url.startswith(ORIGIN) or r.url.startswith("data:") or r.url.startswith("blob:")
                    or r.url.startswith("about:")):
                external.append(r.url)
        ctx.on("request", on_request)

        prompt_answers = []
        def on_dialog(d):
            if d.type == "prompt":
                d.accept(prompt_answers.pop(0) if prompt_answers else "")
            else:
                d.accept()
        page.on("dialog", on_dialog)

        S = "window.SAInvoiceGenerator"
        total = lambda: page.text_content("#pTotal")
        snapshot = lambda: page.evaluate(f"() => JSON.parse(JSON.stringify({S}.serialize()))")
        def confirm_dialog():
            page.wait_for_selector("#appConfirmDialog[open]")
            page.click("#appConfirmAccept")
            page.wait_for_timeout(150)

        # ---- start-up and branding
        page.goto(URL)
        page.wait_for_timeout(500)
        check("title is SA Invoice Generator", page.title() == "SA Invoice Generator")
        check("header shows SA Invoice Generator", page.text_content(".brand h1") == "SA Invoice Generator")
        check("start-up failure banner is removed once the app runs", page.locator("#bootError").count() == 0)
        check("content security policy blocks outbound connections",
              "connect-src 'none'" in (page.get_attribute('meta[http-equiv="Content-Security-Policy"]', "content") or ""))
        inv, due = page.input_value("#invoiceDate"), page.input_value("#dueDate")
        check("due date defaults to invoice date + 14 days",
              page.evaluate("([a, b]) => (new Date(b) - new Date(a)) / 864e5", [inv, due]) == 14)

        # ---- create an invoice through the UI
        page.fill("#invoiceNumber", "INV-2001")
        page.fill("#companyName", "SA Test Ltd")
        page.fill("#clientName", "Client One\nClient Two Ltd")
        page.fill("#reference", "PO-77")
        page.fill("#paymentDetails", "Account Name: SA Test\nSort Code: 00-00-00")
        page.click("[data-tab=items]")
        for desc, qty, rate in [("Consulting", "3", "19.99"), ("Support", "1", "0.125"), ("Support", "1", "0.125")]:
            page.click("#addItemBtn")
            card = page.locator(".itemcard").last
            card.locator('[data-key="sku"]').fill("X")
            card.locator('[data-key="description"]').fill(desc)
            card.locator('[data-key="quantity"]').fill(qty)
            card.locator('[data-key="rate"]').fill(rate)
        page.click("[data-tab=details]")
        page.fill("#discount", "10")
        page.fill("#tax", "20")
        page.fill("#shipping", "4.99")
        page.wait_for_timeout(100)
        # 59.97 + 0.13 + 0.13 = 60.23; disc 6.02; taxable 54.21; tax 10.84; +4.99 = 70.04
        figures = [page.text_content(s) for s in ["#pSubtotal", "#pDiscount", "#pTax", "#pShipping", "#pTotal"]]
        check("line items, discount, tax and shipping total correctly",
              figures == ["£60.23", "\u2212£6.02", "£10.84", "£4.99", "£70.04"], str(figures))
        check("balance due equals total", page.text_content("#pBalance") == "£70.04")
        check("preview shows invoice number and client lines",
              page.text_content("#pInvoiceNo") == "#INV-2001" and "Client Two Ltd" in page.text_content("#pClientName"))
        page.screenshot(path=os.path.join(OUT, OUT_PREFIX + "desktop-modern.png"), full_page=True)

        # ---- persistence across reload
        before = snapshot()
        page.reload(); page.wait_for_timeout(400)
        check("invoice persists after reload", snapshot()["fields"] == before["fields"] and snapshot()["items"] == before["items"])
        check("totals unchanged after reload", total() == "£70.04")

        # ---- edit and delete items
        page.click("[data-tab=items]")
        page.locator(".itemcard").first.locator('[data-key="quantity"]').fill("4")
        page.wait_for_timeout(50)
        check("editing a quantity updates totals", page.text_content("#pSubtotal") == "£80.22")
        page.locator(".itemcard").nth(2).locator("button").click()
        check("removing an item updates the list and totals",
              page.locator(".itemcard").count() == 2 and page.text_content("#pSubtotal") == "£80.09")

        # ---- undo / redo
        page.click("#undoBtn"); page.wait_for_timeout(100)
        check("undo restores the removed item", page.locator(".itemcard").count() == 3)
        page.keyboard.press("Control+y"); page.wait_for_timeout(100)
        check("redo (Ctrl+Y) removes it again", page.locator(".itemcard").count() == 2)

        # ---- columns
        page.click("[data-tab=columns]")
        page.click("#addColumnBtn")
        check("add column", page.locator(".columnrow").count() == 6)
        last = page.locator(".columnrow").last
        # Typed like a user. Playwright's fill() leaves a programmatic selection
        # that stops Chromium starting the row drag below (real typing does not).
        last.locator(".labelinput").click()
        page.keyboard.press("Control+a")
        page.keyboard.type("Notes col")
        last.locator(".labelinput").dispatch_event("change")
        page.wait_for_timeout(50)
        check("rename column shows in preview", "Notes col" in page.text_content("#pHeaders"))
        last.locator(".vis").uncheck()
        check("hide column removes it from preview", "Notes col" not in page.text_content("#pHeaders"))
        first_label = page.locator(".columnrow .labelinput").first.input_value()
        page.locator(".columnrow").nth(1).locator(".drag").drag_to(page.locator(".columnrow").first.locator(".drag"))
        page.wait_for_timeout(100)
        check("drag reorders columns", page.locator(".columnrow .labelinput").first.input_value() != first_label,
              str(page.eval_on_selector_all(".columnrow .labelinput", "els => els.map(e => e.value)"))
              + " scrollTop=" + str(page.evaluate("() => document.getElementById('sidebar').scrollTop")))
        order = page.eval_on_selector_all(".columnrow .labelinput", "els => els.map(e => e.value)")
        page.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'hello');
            document.querySelectorAll('.columnrow')[3].dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); }""")
        check("dropping outside text does not move a column",
              page.eval_on_selector_all(".columnrow .labelinput", "els => els.map(e => e.value)") == order)
        page.locator(".columnrow").last.locator("button").click()
        check("remove column", page.locator(".columnrow").count() == 5)
        page.click("#restoreColumnsBtn"); page.wait_for_timeout(100)
        heads = page.eval_on_selector_all("#pHeaders th", "els => els.map(e => e.textContent)")
        check("restore default columns", heads == ["SKU", "Description", "Qty", "Rate", "Amount"], str(heads))
        check("totals survive column changes", page.text_content("#pSubtotal") == "£80.09")

        # ---- design tab: templates, accent, logo, sections
        page.click("[data-tab=design]")
        for tpl in ["minimal", "classic", "royalty", "modern"]:
            page.select_option("#template", tpl)
            page.wait_for_timeout(80)
            ok = page.get_attribute("#invoice", "class") == "invoice template-" + tpl
            if tpl == "classic":
                ok = ok and "Total" in (page.text_content("#pClassicTotals") or "")
                page.screenshot(path=os.path.join(OUT, OUT_PREFIX + "desktop-classic.png"), full_page=True)
            check(f"template '{tpl}' renders", ok)
        page.fill("#accentHex", "")
        page.type("#accentHex", "#ff0000")
        page.wait_for_timeout(50)
        check("accent HEX can be typed character by character",
              page.input_value("#accentHex") == "#ff0000" and page.input_value("#accent") == "#ff0000")
        page.set_input_files("#logoFile", LOGO)
        page.wait_for_timeout(400)
        check("logo upload shows in preview", (page.get_attribute("#pLogo", "src") or "").startswith("data:image/png"))
        toggle = page.locator('.switch:has([data-section-toggle="client"])')
        toggle.scroll_into_view_if_needed(); toggle.click()
        check("section toggle hides client block",
              "section-hidden" in (page.get_attribute('#invoice [data-section="client"]', "class") or ""))
        toggle.click()

        # ---- template and brand library
        prompt_answers.append("Monthly")
        page.click("#saveTemplateBtn"); page.wait_for_timeout(150)
        check("save template", "Monthly" in page.text_content("#savedTemplates"))
        prompt_answers.append("monthly")
        page.click("#saveTemplateBtn")
        page.wait_for_selector("#templateOverwriteDialog[open]")
        page.click("#templateOverwriteConfirm"); page.wait_for_timeout(100)
        check("overwrite template keeps a single entry",
              page.locator("#savedTemplates .library-item").count() == 1)
        prompt_answers.append("SA Brand")
        page.click("#saveBrandBtn"); page.wait_for_timeout(100)
        check("save brand", "SA Brand" in page.text_content("#savedBrands"))
        page.click("[data-tab=details]")
        page.fill("#companyName", "Changed Co")
        page.fill("#clientName", "Keep This Client")
        page.click("[data-tab=design]")
        page.locator("#savedBrands .library-item button", has_text="Load").click(); page.wait_for_timeout(100)
        check("load brand restores seller but keeps client",
              page.input_value("#companyName") == "SA Test Ltd" and page.input_value("#clientName") == "Keep This Client")
        page.locator("#savedTemplates .library-item button", has_text="Load").click(); page.wait_for_timeout(150)
        check("load template restores the saved invoice", page.input_value("#clientName").startswith("Client One"))
        page.click("[data-tab=details]")

        # ---- export JSON, then import into a clean browser profile
        exported = snapshot()
        with page.expect_download() as dl:
            page.click("#exportBtn")
        json_path = os.path.join(FIX, dl.value.suggested_filename)
        dl.value.save_as(json_path)
        check("export JSON filename uses invoice number", dl.value.suggested_filename == "INV-2001.json")

        ctx2 = browser.new_context(viewport={"width": 1400, "height": 900})
        ctx2.on("request", on_request)
        p2 = ctx2.new_page()
        p2.on("pageerror", lambda e: errors.append("pageerror(2): " + str(e)))
        p2.goto(URL); p2.wait_for_timeout(300)
        p2.set_input_files("#jsonFile", json_path); p2.wait_for_timeout(300)
        imported = p2.evaluate(f"() => JSON.parse(JSON.stringify({S}.serialize()))")
        strip = lambda s: {k: v for k, v in s.items() if k != "zoom"}
        check("JSON import reproduces the exported invoice exactly", strip(imported) == strip(exported))
        check("imported totals match", p2.text_content("#pTotal") == total())
        for path, label in [(BROKEN, "broken JSON"), (NOT_INVOICE, "non-invoice JSON")]:
            p2.set_input_files("#jsonFile", path); p2.wait_for_timeout(200)
            after = p2.evaluate(f"() => JSON.parse(JSON.stringify({S}.serialize()))")
            check(f"{label} is rejected and leaves the invoice unchanged",
                  strip(after) == strip(imported), p2.text_content("#toast"))
        p2.set_input_files("#jsonFile", HOSTILE); p2.wait_for_timeout(300)
        check("hostile JSON: no script ran, no remote logo, markup shown as text",
              not p2.evaluate("() => window.__pwned") and p2.get_attribute("#pLogo", "src") is None
              and "<script>" in p2.text_content("#pItems"))
        ctx2.close()

        # ---- spreadsheet imports (CSV and bundled Excel reader)
        page.click("[data-tab=items]")
        page.set_input_files("#sheetFile", CSV); page.wait_for_timeout(300)
        check("CSV import with formatted amounts", page.text_content("#pSubtotal") == "£2,568.99", page.text_content("#pSubtotal"))
        page.set_input_files("#sheetFile", ITEMS_XLSX); page.wait_for_timeout(1200)
        check("Excel parser stays in its worker (no XLSX object in the page)",
              page.evaluate("() => typeof window.XLSX") == "undefined")
        check("XLSX import (local SheetJS) skips preamble and footer rows",
              page.locator(".itemcard").count() == 2 and page.text_content("#pSubtotal") == "£40.49",
              page.text_content("#pSubtotal"))

        # ---- bundle splitter
        page.click("[data-tab=bundles]")
        page.set_input_files("#bundleFile", BUNDLE_XLSX); page.wait_for_timeout(800)
        check("bundle sheet grouped", page.locator(".bundle-group").count() == 2)
        page.click("#bundleSummaryViewBtn")
        check("bundle summary total", "25.00" in page.text_content("#bundleResults"))
        with page.expect_download() as dl:
            page.click("#bundleDownloadBtn")
        csv_text = open(dl.value.path(), encoding="utf-8-sig").read()
        check("bundle CSV download", "Mega Bundle" in csv_text and "20.00" in csv_text and "25.00" in csv_text)
        page.click("#applyBundlesBtn"); confirm_dialog()
        check("apply bundles to invoice", page.text_content("#pSubtotal") == "£25.00")

        # ---- print / PDF
        page.click("[data-tab=details]")
        page.fill("#invoiceNumber", "INV-PDF")
        page.click("#printBtn")
        frame_html = None
        for _ in range(40):
            frame_html = page.evaluate("""() => { const f = document.getElementById('invoicePrintFrame');
                return f && f.contentDocument && f.contentDocument.querySelector('.invoice')
                  ? f.contentDocument.documentElement.outerHTML : null; }""")
            if frame_html:
                break
            page.wait_for_timeout(50)
        editor_in_print = page.evaluate("""() => { const f = document.getElementById('invoicePrintFrame');
            const d = f && f.contentDocument; return !d || !!d.querySelector('.sidebar, button, input'); }""") if frame_html else True
        check("print builds an invoice-only document", bool(frame_html) and not editor_in_print)
        pdf_page = ctx.new_page()
        pdf_page.goto(URL)
        pdf_page.evaluate("html => { document.open(); document.write(html); document.close(); }", frame_html)
        pdf_page.wait_for_timeout(500)
        pdf_path = os.path.join(OUT, OUT_PREFIX + "invoice.pdf")
        pdf_page.pdf(path=pdf_path, prefer_css_page_size=True, print_background=True)
        pdf_page.close()
        try:
            text = subprocess.run(["pdftotext", pdf_path, "-"], capture_output=True, text=True).stdout
            check("PDF contains invoice number and total", "INV-PDF" in text and "25.00" in text, text[:200])
        except FileNotFoundError:
            check("PDF generated (pdftotext unavailable for content check)", os.path.getsize(pdf_path) > 1000)

        # ---- validation hint
        page.fill("#dueDate", "2000-01-01")
        check("due date before invoice date shows a warning", page.is_visible("#dueDateWarning"))
        page.fill("#dueDate", "2099-01-01")
        check("warning clears when fixed", not page.is_visible("#dueDateWarning"))

        # ---- zoom and sidebar resize
        page.click("#zoomOut")
        check("zoom out", page.text_content("#zoomLabel") == "90%")
        page.click("#zoomIn")
        box = page.locator("#sidebarResizer").bounding_box()
        page.mouse.move(box["x"] + 4, 300); page.mouse.down(); page.mouse.move(560, 300, steps=5); page.mouse.up()
        width = page.evaluate("() => document.getElementById('sidebar').getBoundingClientRect().width")
        check("sidebar can be resized by dragging", abs(width - 560) <= 2, str(width))
        page.reload(); page.wait_for_timeout(300)
        width = page.evaluate("() => document.getElementById('sidebar').getBoundingClientRect().width")
        check("sidebar width persists", abs(width - 560) <= 2, str(width))
        page.locator("#sidebarResizer").dblclick()

        # ---- reset text, then full reset
        page.click("#resetTextBtn"); confirm_dialog()
        s = snapshot()
        check("reset text clears text but keeps amounts and invoice number",
              s["fields"]["companyName"] == "" and s["fields"]["invoiceNumber"] == "INV-PDF"
              and page.text_content("#pSubtotal") == "£25.00")
        page.click("#resetBtn"); page.wait_for_timeout(600)
        s = snapshot()
        check("full reset starts a blank invoice", s["items"] == [] and s["fields"]["invoiceNumber"] == "INV-1001")
        check("full reset keeps saved templates and brands",
              page.locator("#savedTemplates .library-item").count() == 1
              and page.locator("#savedBrands .library-item").count() == 1)

        # ---- library deletion
        page.click("[data-tab=design]")
        page.locator("#savedTemplates .library-item button", has_text="Delete").click(); page.wait_for_timeout(100)
        page.locator("#savedBrands .library-item button", has_text="Remove").click(); page.wait_for_timeout(100)
        check("delete template and brand",
              page.locator("#savedTemplates .library-item").count() == 0
              and page.locator("#savedBrands .library-item").count() == 0)

        # ---- responsive layouts
        for w, h in [(390, 844), (768, 1024), (1280, 800), (1920, 1080)]:
            page.set_viewport_size({"width": w, "height": h})
            page.wait_for_timeout(150)
            sw = page.evaluate("() => document.documentElement.scrollWidth")
            check(f"no page-level horizontal overflow at {w}px", sw <= w, f"scrollWidth={sw}")
            page.screenshot(path=os.path.join(OUT, OUT_PREFIX + f"viewport-{w}.png"))

        # ---- invoice numbering, typing flush, large logos
        page.set_viewport_size({"width": 1400, "height": 900})
        page.click("[data-tab=details]")
        page.fill("#invoiceNumber", "JF2026-09")
        page.click("#nextNumberBtn")
        check("Next number button increments with padding", page.input_value("#invoiceNumber") == "JF2026-10")
        page.fill("#reference", "typed just before reload")
        page.reload(); page.wait_for_timeout(400)
        check("typing saved just before a reload is not lost", page.input_value("#reference") == "typed just before reload")
        page.click("[data-tab=details]")
        page.set_input_files("#logoFile", BIG_LOGO); page.wait_for_timeout(1500)
        dims = page.evaluate("""() => new Promise(r => { const i = new Image();
            i.onload = () => r([i.naturalWidth, i.naturalHeight, window.SAInvoiceGenerator.state.logo.length]); i.src = window.SAInvoiceGenerator.state.logo; })""")
        check("large logo is scaled to at most 1200 px and stored smaller",
              max(dims[0], dims[1]) == 1200 and dims[2] < os.path.getsize(BIG_LOGO) * 4 / 3, str(dims))
        page.click("#removeLogoBtn")

        # ---- two tabs editing the same invoice
        tab_a, tab_b = page, ctx.new_page()
        tab_b.on("pageerror", lambda e: errors.append("pageerror(tab b): " + str(e)))
        tab_b.goto(URL); tab_b.wait_for_timeout(400)
        tab_a.fill("#invoiceNumber", "FROM-TAB-A"); tab_a.wait_for_timeout(600)
        tab_b.wait_for_selector("#appConfirmDialog[open]", timeout=3000)
        check("the other tab is asked which version to keep", "another tab" in tab_b.text_content("#appConfirmMessage"))
        tab_b.click("#appConfirmAccept"); tab_b.wait_for_timeout(200)
        check("loading the other tab's version", tab_b.input_value("#invoiceNumber") == "FROM-TAB-A")
        tab_b.fill("#invoiceNumber", "FROM-TAB-B"); tab_b.wait_for_timeout(600)
        tab_a.wait_for_selector("#appConfirmDialog[open]", timeout=3000)
        tab_a.click("#appConfirmCancel"); tab_a.wait_for_timeout(200)
        stored = tab_a.evaluate("() => JSON.parse(localStorage.getItem('invoiceStudioPro.v2')).fields.invoiceNumber")
        check("keeping this tab's version saves it over the other", stored == "FROM-TAB-A")
        tab_b.wait_for_selector("#appConfirmDialog[open]", timeout=3000)
        tab_b.click("#appConfirmAccept"); tab_b.wait_for_timeout(200)
        tab_b.close()

        # ---- storage failure handling (separate profile)
        ctx3 = browser.new_context(timezone_id="Asia/Dhaka")
        ctx3.on("request", on_request)
        p3 = ctx3.new_page()
        p3.goto(URL); p3.wait_for_timeout(300)
        d1, d2 = p3.input_value("#invoiceDate"), p3.input_value("#dueDate")
        check("due date is +14 days east of UTC (was 13)",
              p3.evaluate("([a, b]) => (new Date(b) - new Date(a)) / 864e5", [d1, d2]) == 14)
        p3.evaluate("() => localStorage.setItem('invoiceStudioPro.v2', '{corrupt')")
        p3.reload(); p3.wait_for_timeout(300)
        p3.fill("#reference", "after corruption"); p3.wait_for_timeout(100)
        check("unreadable autosave is kept as a backup, not overwritten",
              p3.evaluate("() => localStorage.getItem('invoiceStudioPro.v2.unreadableBackup')") == "{corrupt")
        p3.evaluate("() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; }")
        p3.fill("#reference", "storage full"); p3.wait_for_timeout(600)
        check("failed autosave is reported to the user", "Autosave failed" in p3.text_content("#toast"))
        ctx3.close()

        check("no console or page errors", not errors, "; ".join(errors[:5]))
        check("no requests left 127.0.0.1", not external, ", ".join(external[:5]))
        browser.close()
finally:
    if server:
        server.terminate()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)
