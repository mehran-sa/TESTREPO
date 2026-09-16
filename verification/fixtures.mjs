// Deterministic fixtures used to drive the app and capture rendered output.
// These mirror the shape produced by the app's own serialize().

const cols = (over = {}) => {
  const base = [
    { id: "c1", key: "sku", label: "SKU", type: "text", width: 14, align: "left", visible: true, role: "none" },
    { id: "c2", key: "description", label: "Description", type: "text", width: 44, align: "left", visible: true, role: "none" },
    { id: "c3", key: "quantity", label: "Qty", type: "number", width: 11, align: "right", visible: true, role: "quantity" },
    { id: "c4", key: "rate", label: "Rate", type: "currency", width: 14, align: "right", visible: true, role: "rate" },
    { id: "c5", key: "amount", label: "Amount", type: "currency", width: 17, align: "right", visible: true, role: "amount" }
  ];
  return over.columns || base;
};

const SECTION_KEYS = ["logo", "company", "client", "status", "invoiceDate", "dueDate", "reference",
  "balance", "notes", "discount", "tax", "shipping", "payment", "terms", "footer"];
const allSections = (over = {}) => Object.fromEntries(SECTION_KEYS.map(k => [k, over[k] ?? true]));

const baseFields = {
  logoWidth: "120", logoHeight: "54", logoFit: "contain", logoAlign: "left",
  invoiceNumber: "INV-1001", status: "Due", invoiceDate: "2026-02-28", dueDate: "2026-03-14",
  currency: "GBP", reference: "PO-99",
  companyName: "Your Company Ltd.", companyReg: "12345678", companyVat: "GB999 9999 73",
  companyAddress: "1 Example Street\nLondon\nE1 1AA", companyPhone: "+44 20 7946 0000",
  companyEmail: "billing@example.com", companyWebsite: "www.example.com",
  clientName: "Fanatical\nFocus Multimedia Ltd", clientContact: "A. Buyer", clientTax: "GB111 1111 11",
  clientAddress: "2 Client Road\nManchester\nM1 2AB", clientEmail: "ap@client.com",
  discount: "0", tax: "0", shipping: "0",
  notes: "", paymentDetails: "", terms: "",
  template: "modern", accent: "#2563eb", accentHex: "#2563eb"
};

const items5 = [
  { sku: "SKU-001", description: "Standard course licence", quantity: 3, rate: 12.5, amount: 0 },
  { sku: "SKU-002", description: "Bundle pack\nwith second line", quantity: 10, rate: 4.99, amount: 0 },
  { sku: "SKU-003", description: "Zero quantity row", quantity: 0, rate: 99.95, amount: 0 },
  { sku: "SKU-004", description: "Fractional", quantity: 2.5, rate: 0.333, amount: 0 },
  { sku: "SKU-005", description: "Large", quantity: 1200, rate: 1.05, amount: 0 }
];

const snapshot = (over = {}) => ({
  version: 2,
  logo: over.logo ?? "",
  zoom: over.zoom ?? 1,
  columns: cols(over),
  items: over.items ?? items5,
  sections: allSections(over.sections || {}),
  fields: { ...baseFields, ...(over.fields || {}) }
});

// 1x1 transparent PNG, used to exercise the logo path.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const TEMPLATES = ["modern", "minimal", "classic", "royalty"];

export const CASES = [];

for (const template of TEMPLATES) {
  CASES.push({
    name: `${template}__basic`,
    data: snapshot({ fields: { template } })
  });
  CASES.push({
    name: `${template}__full`,
    data: snapshot({
      logo: TINY_PNG,
      fields: {
        template,
        discount: "12.5", tax: "20", shipping: "9.99", currency: "USD",
        status: "Partially Paid",
        notes: "Please quote the bank detailsfor payment reference.",
        paymentDetails: "Account Name: Example Ltd\nAccount Number: 12345678\nSort Code: 01-02-03\nIBAN: GB00EXMP00000012345678\nPlain free text line",
        terms: "Payment due within 14 days."
      }
    })
  });
  CASES.push({
    name: `${template}__empty_items`,
    data: snapshot({ items: [], fields: { template, reference: "" } })
  });
  CASES.push({
    name: `${template}__sections_off`,
    data: snapshot({
      fields: { template },
      sections: { logo: false, status: false, reference: false, notes: false, terms: false, footer: false, balance: false }
    })
  });
  CASES.push({
    name: `${template}__four_cols`,
    data: snapshot({
      fields: { template, currency: "EUR" },
      columns: [
        { id: "c1", key: "sku", label: "SKU", type: "text", width: 20, align: "left", visible: true, role: "none" },
        { id: "c2", key: "description", label: "Description", type: "text", width: 50, align: "left", visible: true, role: "none" },
        { id: "c3", key: "quantity", label: "Qty", type: "number", width: 12, align: "right", visible: true, role: "quantity" },
        { id: "c5", key: "amount", label: "Amount", type: "currency", width: 18, align: "right", visible: true, role: "amount" }
      ],
      items: [
        { sku: "A1", description: "Royalty line one", quantity: 120, amount: 340.55 },
        { sku: "A2", description: "Royalty line two", quantity: 5, amount: 12.1 }
      ]
    })
  });
  CASES.push({
    name: `${template}__custom_cols`,
    data: snapshot({
      fields: { template, currency: "BDT", status: "Overdue" },
      columns: [
        { id: "d1", key: "description", label: "Item & <b>detail</b>", type: "text", width: 40, align: "left", visible: true, role: "none" },
        { id: "d2", key: "when", label: "Date", type: "date", width: 15, align: "center", visible: true, role: "none" },
        { id: "d3", key: "pct", label: "Share", type: "percentage", width: 12, align: "right", visible: true, role: "none" },
        { id: "d4", key: "quantity", label: "Units", type: "number", width: 13, align: "right", visible: true, role: "quantity" },
        { id: "d5", key: "rate", label: "Unit", type: "currency", width: 10, align: "right", visible: true, role: "rate" },
        { id: "d6", key: "hidden", label: "Hidden", type: "text", width: 10, align: "left", visible: false, role: "none" }
      ],
      items: [
        { description: "Smith & Co \"special\"", when: "2026-01-09", pct: 12.5, quantity: 4, rate: 3.5, hidden: "x" },
        { description: "No amount role here", when: "", pct: 0, quantity: 1, rate: 100, hidden: "" }
      ]
    })
  });
}

export const CALC_CASES = [
  { discount: "0", tax: "0", shipping: "0" },
  { discount: "10", tax: "20", shipping: "5" },
  { discount: "-5", tax: "150", shipping: "-3" },
  { discount: "100", tax: "0", shipping: "0" },
  { discount: "33.333", tax: "17.5", shipping: "0.005" },
  { discount: "abc", tax: "", shipping: "1e3" }
];

export const CSV_SAMPLES = [
  'SKU,Description,Quantity,Rate,Amount\nA1,"Line, one",2,3.50,7.00\nA2,"He said ""hi""",1,10,10\n',
  'Supplier ID,X\n\nSKU,Name,Net Qty,Royalty\nB1,Course A,10,25.50\nB2,Course B,3,7.25\n\nTotal Royalty,,,32.75\n',
  'sku,name,net qty,royalty\r\nC1,Alpha,5,1.20\r\nC2,Beta,,4.80\r\nRoyalties are converted at the exchange rate\r\n',
  'random,header,row\n1,2,3\n',
  ''
];
