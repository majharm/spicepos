/** Packed spices. Prices in paise. GST 5% (500 bps) for spices. */
export const CATALOG = [
  { sku: "TUR-100", name: "Turmeric powder", pack: "100 g", unitPaise: 4500, gstBps: 500, stock: 48 },
  { sku: "CUM-100", name: "Cumin seeds", pack: "100 g", unitPaise: 6200, gstBps: 500, stock: 36 },
  { sku: "COR-100", name: "Coriander powder", pack: "100 g", unitPaise: 3800, gstBps: 500, stock: 40 },
  { sku: "CHI-100", name: "Red chilli powder", pack: "100 g", unitPaise: 5500, gstBps: 500, stock: 32 },
  { sku: "GAR-050", name: "Garam masala", pack: "50 g", unitPaise: 7200, gstBps: 500, stock: 24 },
  { sku: "CAR-010", name: "Green cardamom", pack: "10 g", unitPaise: 18500, gstBps: 500, stock: 18 },
  { sku: "PEP-050", name: "Black pepper", pack: "50 g", unitPaise: 9800, gstBps: 500, stock: 22 },
  { sku: "MUS-100", name: "Mustard seeds", pack: "100 g", unitPaise: 3200, gstBps: 500, stock: 30 },
  { sku: "FEN-100", name: "Fenugreek seeds", pack: "100 g", unitPaise: 2800, gstBps: 500, stock: 28 },
  { sku: "ASA-050", name: "Asafoetida", pack: "50 g", unitPaise: 12500, gstBps: 500, stock: 12 },
  { sku: "CIN-050", name: "Cinnamon sticks", pack: "50 g", unitPaise: 8900, gstBps: 500, stock: 16 },
  { sku: "CLO-025", name: "Cloves", pack: "25 g", unitPaise: 7600, gstBps: 500, stock: 14 },
  { sku: "BAY-020", name: "Bay leaves", pack: "20 g", unitPaise: 2400, gstBps: 500, stock: 20 },
  { sku: "GIN-100", name: "Ginger powder", pack: "100 g", unitPaise: 5100, gstBps: 500, stock: 26 },
  { sku: "GARL-100", name: "Garlic powder", pack: "100 g", unitPaise: 4900, gstBps: 500, stock: 26 },
  { sku: "SAF-001", name: "Saffron", pack: "1 g", unitPaise: 45000, gstBps: 500, stock: 6 },
];

export function searchCatalog(products, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return products;
  return products.filter((p) => {
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.pack.toLowerCase().includes(q)
    );
  });
}
