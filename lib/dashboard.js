// Aggregates data from the Pancake client into the shapes the dashboard/overview/orders
// pages need. Kept separate from lib/pancake.js (raw API client) and lib/tools.js
// (chat tool-use definitions) so each file has one job.
const pancake = require("./pancake");

function formatBaht(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return "฿" + Math.round(n).toLocaleString("th-TH");
}

function variationLabel(v) {
  const name = v.product?.name || v.display_id || "สินค้า";
  const fields = (v.fields || []).map((f) => f.value).join(" / ");
  return fields ? `${name} (${fields})` : name;
}

function bangkokDateKey(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA gives YYYY-MM-DD, easy to compare as strings.
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function mapOrder(o) {
  return {
    order_id: o.id,
    status: o.status_name,
    customer_name: o.bill_full_name,
    phone: o.bill_phone_number,
    items_count: Array.isArray(o.items) ? o.items.length : undefined,
    cod_amount: o.cod,
    cod_display: formatBaht(o.cod),
    shipping_partner: o.partner?.partner_name,
    inserted_at: o.inserted_at,
  };
}

function mapVariation(v) {
  return {
    variation_id: v.id,
    product_id: v.product_id,
    name: variationLabel(v),
    price: v.retail_price,
    price_display: formatBaht(v.retail_price),
    remain_quantity: v.remain_quantity,
  };
}

/**
 * Dashboard summary: shop name, low-stock alert list, recent orders, and a best-effort
 * "today" count/revenue estimate computed from the most recent orders page (Pancake's
 * Open API doesn't expose a dedicated stats/summary endpoint, so this is an estimate,
 * labeled as such on the page — it will undercount if more than RECENT_SAMPLE orders
 * came in today).
 */
const RECENT_SAMPLE = 50;
const LOW_STOCK_THRESHOLD = 5;

async function getDashboardSummary() {
  const [shop, lowStock, recentSample] = await Promise.all([
    pancake.getShopInfo().catch(() => null),
    pancake.searchVariations({ lowStockMax: LOW_STOCK_THRESHOLD, pageSize: 10 }),
    pancake.listOrders({ pageSize: RECENT_SAMPLE }),
  ]);

  const todayKey = bangkokDateKey(new Date());
  const todaysOrders = recentSample.filter((o) => bangkokDateKey(o.inserted_at) === todayKey);
  const revenueToday = todaysOrders.reduce((sum, o) => sum + (Number(o.cod) || 0), 0);

  return {
    shop_name: shop?.name || "ร้านค้า",
    low_stock_threshold: LOW_STOCK_THRESHOLD,
    low_stock_count: lowStock.length,
    low_stock_items: lowStock.map(mapVariation),
    orders_today_count: todaysOrders.length,
    revenue_today: revenueToday,
    revenue_today_display: formatBaht(revenueToday),
    today_is_estimate: true,
    recent_orders: recentSample.slice(0, 10).map(mapOrder),
  };
}

async function getProductsPage({ search, lowStockMax, page = 1, pageSize = 20 }) {
  const list = await pancake.searchVariations({
    search,
    lowStockMax,
    pageSize,
    pageNumber: page,
  });
  return {
    items: list.map(mapVariation),
    page,
    pageSize,
    has_more: list.length === pageSize,
  };
}

async function getOrdersPage({ search, page = 1, pageSize = 20 }) {
  const list = await pancake.listOrders({ search, pageSize, pageNumber: page });
  return {
    items: list.map(mapOrder),
    page,
    pageSize,
    has_more: list.length === pageSize,
  };
}

module.exports = { getDashboardSummary, getProductsPage, getOrdersPage };
