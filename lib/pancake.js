// Thin client for the Pancake POS Open API (https://docs.pancake.biz/pos/api/)
// Docs confirmed live during integration:
//   GET  /shops/{SHOP_ID}/products/variations   - search products/variations w/ stock + price
//   GET  /shops/{SHOP_ID}/products/{PRODUCT_SKU} - full product (needed before a price update)
//   PUT  /shops/{SHOP_ID}/products/{PRODUCT_ID}  - update product (send full "product" payload)
//   GET  /shops/{SHOP_ID}/orders                 - list orders

const BASE = process.env.PANCAKE_API_BASE || "https://pos.pages.fm/api/v1";
const SHOP_ID = process.env.PANCAKE_SHOP_ID;
const API_KEY = process.env.PANCAKE_API_KEY;

function assertConfigured() {
  if (!SHOP_ID || !API_KEY) {
    throw new Error(
      "Pancake is not configured: missing PANCAKE_SHOP_ID or PANCAKE_API_KEY environment variables."
    );
  }
}

async function pancakeRequest(path, { method = "GET", query = {}, body } = {}) {
  assertConfigured();
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, v);
    } else if (typeof value === "object") {
      url.searchParams.set(key, JSON.stringify(value));
    } else {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(`Pancake API returned non-JSON response (status ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(`Pancake API error ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}

/**
 * Search products/variations. Supports free-text search and a "low stock" filter.
 */
async function searchVariations({ search, lowStockMax, pageSize = 20, pageNumber = 1 } = {}) {
  const query = { page_size: pageSize, page_number: pageNumber };
  if (search) query.search = search;
  if (lowStockMax !== undefined && lowStockMax !== null) {
    query.remainQuantity = { type: "smallerOrEqual", value: lowStockMax, warehouseId: "all" };
  }
  const json = await pancakeRequest(`/shops/${SHOP_ID}/products/variations`, { query });
  return json.data || [];
}

/**
 * Fetch a single product by SKU/ID (needed before mutating it, so we don't drop other variations).
 */
async function getProductBySku(productSku) {
  return pancakeRequest(`/shops/${SHOP_ID}/products/${encodeURIComponent(productSku)}`);
}

/**
 * Update one or more variations' retail_price on a single product in one PUT call,
 * preserving all other variations/fields. `fullProduct` must be the full object
 * returned by getProductBySku (needed so we don't drop sibling variations).
 */
async function updateProductVariationPrices({ productId, variationIds, newPrice, fullProduct }) {
  if (!fullProduct || !Array.isArray(fullProduct.variations)) {
    throw new Error("updateProductVariationPrices requires the full product payload (variations array) to avoid dropping other variations.");
  }
  const idSet = new Set(variationIds);
  const variations = fullProduct.variations.map((v) =>
    idSet.has(v.id) ? { ...v, retail_price: newPrice } : v
  );
  const payload = { product: { ...fullProduct, variations } };
  delete payload.product.variations_warehouses; // read-only aggregate field, not accepted on write
  return pancakeRequest(`/shops/${SHOP_ID}/products/${encodeURIComponent(productId)}`, {
    method: "PUT",
    body: payload,
  });
}

/**
 * Update a single variation's retail_price. Thin wrapper around updateProductVariationPrices
 * kept for the single-item propose/apply_price_change tool flow.
 */
async function updateVariationPrice({ productId, variationId, newPrice, fullProduct }) {
  return updateProductVariationPrices({ productId, variationIds: [variationId], newPrice, fullProduct });
}

/**
 * Page through ALL variations matching a (optional) search/filter, not just one page.
 * Used by the bulk price-change flow, which needs the full matching set up front so it
 * can show the user exactly what will change before anything is written.
 * Capped at maxPages as a guard against a runaway loop on an unexpectedly huge catalog.
 */
async function listAllVariations({ search, lowStockMax, pageSize = 100, maxPages = 20 } = {}) {
  const all = [];
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const batch = await searchVariations({ search, lowStockMax, pageSize, pageNumber: page });
    all.push(...batch);
    if (batch.length < pageSize) break; // last page reached
    if (page === maxPages) truncated = true;
  }
  return { items: all, truncated };
}

/**
 * List recent orders, newest first.
 */
async function listOrders({ pageSize = 20, pageNumber = 1, search, statusFilter } = {}) {
  const query = {
    page_size: pageSize,
    page_number: pageNumber,
    option_sort: "inserted_at_desc",
  };
  if (search) query.search = search;
  if (statusFilter !== undefined) query["filter_status[]"] = statusFilter;
  const json = await pancakeRequest(`/shops/${SHOP_ID}/orders`, { query });
  return json.data || [];
}

async function getShopInfo() {
  const json = await pancakeRequest("/shops");
  return (json.shops || []).find((s) => String(s.id) === String(SHOP_ID)) || json.shops?.[0];
}

module.exports = {
  searchVariations,
  listAllVariations,
  getProductBySku,
  updateVariationPrice,
  updateProductVariationPrices,
  listOrders,
  getShopInfo,
};
