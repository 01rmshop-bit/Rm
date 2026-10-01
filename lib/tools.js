const pancake = require("./pancake");

// Tool (function) definitions in Anthropic Messages API tool-use format.
const TOOL_DEFINITIONS = [
  {
    name: "search_products",
    description:
      "ค้นหาสินค้า/ตัวเลือกสินค้า (variation) ในร้าน พร้อมราคาและจำนวนคงเหลือ ใช้เพื่อตอบคำถามเรื่องสต็อก ราคา หรือค้นหาสินค้าที่ต้องการ",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "คำค้นหา เช่น ชื่อสินค้า สี ไซส์ (ปล่อยว่างเพื่อดูสินค้าทั้งหมด)" },
        low_stock_max: {
          type: "integer",
          description: "ถ้าระบุ จะกรองเฉพาะสินค้าที่เหลือน้อยกว่าหรือเท่ากับจำนวนนี้ (ใช้สำหรับคำถามแบบ 'สินค้าใกล้หมดสต็อก')",
        },
        limit: { type: "integer", description: "จำนวนรายการสูงสุดที่ต้องการ (ค่าเริ่มต้น 10)" },
      },
    },
  },
  {
    name: "list_orders",
    description: "ดึงรายการออเดอร์ล่าสุดของร้าน เรียงจากใหม่ไปเก่า ใช้ตอบคำถามเรื่องออเดอร์/ยอดขาย",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "จำนวนออเดอร์สูงสุดที่ต้องการ (ค่าเริ่มต้น 10)" },
        search: { type: "string", description: "ค้นหาด้วยเบอร์โทร/ชื่อลูกค้า/หมายเหตุ (ไม่บังคับ)" },
      },
    },
  },
  {
    name: "propose_price_change",
    description:
      "คำนวณและเสนอการเปลี่ยนราคาสินค้า 1 ตัวเลือก (ยังไม่บันทึกจริง) ต้องเรียกเครื่องมือนี้ก่อนเสมอเมื่อผู้ใช้ขอปรับราคา แล้วแสดงตัวเลขให้ผู้ใช้ยืนยันก่อนเรียก apply_price_change",
    input_schema: {
      type: "object",
      properties: {
        product_query: {
          type: "string",
          description: "คำค้นหาเพื่อระบุสินค้า/ตัวเลือกสินค้าที่ต้องการเปลี่ยนราคา เช่น 'เสื้อ Oversize สีดำ ไซส์ L'",
        },
        new_price: { type: "number", description: "ราคาใหม่ที่ต้องการตั้ง (ระบุอย่างใดอย่างหนึ่งระหว่าง new_price กับ percent_off)" },
        percent_off: { type: "number", description: "เปอร์เซ็นต์ที่ต้องการลดจากราคาปัจจุบัน เช่น 10 แปลว่าลด 10%" },
      },
      required: ["product_query"],
    },
  },
  {
    name: "apply_price_change",
    description:
      "บันทึกการเปลี่ยนราคาจริงลงร้านค้า ใช้ได้เฉพาะหลังจากที่ผู้ใช้ยืนยันข้อเสนอจาก propose_price_change แล้วเท่านั้น ต้องส่งค่า variation_id, product_id, new_price ให้ตรงกับที่เสนอไปก่อนหน้านี้ในบทสนทนา",
    input_schema: {
      type: "object",
      properties: {
        variation_id: { type: "string" },
        product_id: { type: "string" },
        new_price: { type: "number" },
      },
      required: ["variation_id", "product_id", "new_price"],
    },
  },
];

function formatBaht(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return "฿" + Math.round(n).toLocaleString("th-TH");
}

function variationLabel(v) {
  const name = v.product?.name || v.display_id || "สินค้า";
  const fields = (v.fields || []).map((f) => f.value).join(" / ");
  return fields ? `${name} (${fields})` : name;
}

async function runTool(name, input, session) {
  switch (name) {
    case "search_products": {
      const list = await pancake.searchVariations({
        search: input.query,
        lowStockMax: input.low_stock_max,
        pageSize: input.limit || 10,
      });
      if (!list.length) return { result: "ไม่พบสินค้าที่ตรงกับเงื่อนไขนี้" };
      const items = list.map((v) => ({
        variation_id: v.id,
        product_id: v.product_id,
        name: variationLabel(v),
        price: v.retail_price,
        price_display: formatBaht(v.retail_price),
        remain_quantity: v.remain_quantity,
      }));
      return { result: items };
    }

    case "list_orders": {
      const orders = await pancake.listOrders({
        pageSize: input.limit || 10,
        search: input.search,
      });
      if (!orders.length) return { result: "ไม่พบออเดอร์" };
      const items = orders.map((o) => ({
        order_id: o.id,
        status: o.status_name,
        customer_name: o.bill_full_name,
        phone: o.bill_phone_number,
        items_count: Array.isArray(o.items) ? o.items.length : undefined,
        cod_amount: o.cod,
        shipping_partner: o.partner?.partner_name,
        inserted_at: o.inserted_at,
      }));
      return { result: items };
    }

    case "propose_price_change": {
      const matches = await pancake.searchVariations({ search: input.product_query, pageSize: 5 });
      if (!matches.length) {
        return { result: { error: `ไม่พบสินค้าที่ตรงกับ "${input.product_query}" กรุณาลองค้นหาด้วยคำอื่น` } };
      }
      if (matches.length > 1) {
        return {
          result: {
            ambiguous: true,
            message: "พบสินค้าหลายรายการที่ตรงกับคำค้นหา กรุณาระบุให้ชัดเจนขึ้น (เช่น ใส่สีหรือไซส์)",
            candidates: matches.map((v) => ({ name: variationLabel(v), price: formatBaht(v.retail_price), remain: v.remain_quantity })),
          },
        };
      }
      const v = matches[0];
      const oldPrice = v.retail_price;
      let newPrice;
      if (typeof input.new_price === "number") {
        newPrice = Math.round(input.new_price);
      } else if (typeof input.percent_off === "number") {
        newPrice = Math.round(oldPrice * (1 - input.percent_off / 100));
      } else {
        return { result: { error: "กรุณาระบุ new_price หรือ percent_off อย่างใดอย่างหนึ่ง" } };
      }

      const proposal = {
        variation_id: v.id,
        product_id: v.product_id,
        name: variationLabel(v),
        old_price: oldPrice,
        new_price: newPrice,
      };
      // Stash on the session so apply_price_change can verify it isn't fabricated.
      session.pendingPriceChange = proposal;

      return {
        result: {
          product_name: proposal.name,
          old_price: formatBaht(oldPrice),
          new_price: formatBaht(newPrice),
          variation_id: v.id,
          product_id: v.product_id,
          note: "ยังไม่บันทึก ให้ถามผู้ใช้เพื่อยืนยันก่อนเรียก apply_price_change",
        },
      };
    }

    case "apply_price_change": {
      const pending = session.pendingPriceChange;
      if (
        !pending ||
        pending.variation_id !== input.variation_id ||
        pending.product_id !== input.product_id ||
        Math.round(pending.new_price) !== Math.round(input.new_price)
      ) {
        return {
          result: {
            error:
              "ไม่พบข้อเสนอราคานี้ค้างอยู่ หรือข้อมูลไม่ตรงกับที่เสนอไว้ กรุณาเรียก propose_price_change ใหม่อีกครั้งก่อนบันทึกจริง",
          },
        };
      }
      const fullProduct = await pancake.getProductBySku(input.product_id);
      await pancake.updateVariationPrice({
        productId: input.product_id,
        variationId: input.variation_id,
        newPrice: Math.round(input.new_price),
        fullProduct,
      });
      session.pendingPriceChange = null;
      return {
        result: {
          success: true,
          message: `ปรับราคา "${pending.name}" เป็น ${formatBaht(input.new_price)} เรียบร้อยแล้ว`,
        },
      };
    }

    default:
      return { result: { error: `ไม่รู้จักเครื่องมือชื่อ ${name}` } };
  }
}

module.exports = { TOOL_DEFINITIONS, runTool };
