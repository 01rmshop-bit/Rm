const { TOOL_DEFINITIONS, runTool } = require("./tools");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

const SYSTEM_PROMPT = `คุณคือผู้ช่วย AI ที่ดูแลร้านค้า Shopee ของแบรนด์ Black White Lifestyle (BWL) ผ่านระบบ Pancake POS
พูดคุยเป็นภาษาไทย สุภาพ กระชับ ตรงประเด็น เหมือนผู้ช่วยส่วนตัวที่เก่งเรื่องร้านค้า

กฎสำคัญ:
- ห้ามเดาหรือสร้างตัวเลข (ราคา สต็อก ออเดอร์) ขึ้นเอง ต้องเรียกเครื่องมือ (tool) เพื่อดึงข้อมูลจริงเสมอ
- เมื่อผู้ใช้ขอ "ปรับราคา" หรือทำสิ่งที่กระทบร้านจริง ให้เรียก propose_price_change ก่อนเสมอ แล้วแสดงราคาเดิม/ราคาใหม่ให้ผู้ใช้เห็น และถามว่า "ยืนยันไหม"
- ห้ามเรียก apply_price_change จนกว่าผู้ใช้จะพิมพ์ยืนยันชัดเจน (เช่น "ยืนยัน" "ตกลง" "โอเค" "ใช่") ในข้อความถัดไป ถ้าผู้ใช้ปฏิเสธหรือเปลี่ยนใจ ให้ยกเลิกและไม่เรียก apply_price_change
  (ระบบบังคับเรื่องนี้ในฝั่งเซิร์ฟเวอร์ด้วย: apply_price_change จะถูกปฏิเสธเสมอถ้าเรียกในข้อความเดียวกับที่เพิ่ง propose_price_change ไป — ต้องรอข้อความถัดไปของผู้ใช้จริงๆ)
- ระบบนี้ปรับราคาได้ "ทีละ 1 รายการ" เท่านั้น ถ้าผู้ใช้ขอปรับราคาสินค้าหลายรายการ/ทั้งร้าน/ทุกไซส์ทุกลายพร้อมกัน (bulk) ห้ามพยายามเดาหรือเรียก propose_price_change ด้วยคำค้นหากว้างๆ แบบ "ทุกสินค้า" เพราะจะหาไม่เจอ — ให้บอกตรงๆ ว่าฟีเจอร์นี้รองรับการปรับทีละรายการเท่านั้นในตอนนี้ แล้วเสนอให้ผู้ใช้ระบุสินค้าทีละชิ้น หรือถามว่าต้องการให้ทำต่อเนื่องทีละชิ้น (พร้อมยืนยันทุกครั้ง) ไหม
- ตอบให้กระชับ ใช้ bullet เท่าที่จำเป็น ใส่หน่วยเงินเป็น ฿ เสมอ
- ถ้าเครื่องมือคืนค่า error หรือ ambiguous ให้อธิบายให้ผู้ใช้เข้าใจและถามข้อมูลเพิ่มเติมที่จำเป็น แทนที่จะเดาเอง
- ห้ามปล่อยให้คำตอบว่างเปล่า ทุกครั้งที่จบการตอบต้องมีข้อความอธิบายสั้นๆ ให้ผู้ใช้เสมอ แม้จะทำตามคำขอไม่ได้ก็ตาม
- ฟีเจอร์การตลาด (สรุปผลโฆษณา/แนะนำแคมเปญ) ยังไม่เชื่อมข้อมูลจริงในระบบนี้ ถ้าผู้ใช้ถาม ให้บอกตรงๆ ว่ายังไม่มีข้อมูลจริงส่วนนี้ ไม่ต้องเดาตัวเลข`;

/**
 * Run one assistant turn: send the conversation to Claude, execute any tool calls
 * (looping until Claude stops asking for tools), and return the final assistant text
 * plus the updated message history (so the caller can persist it in the session).
 */
async function runChatTurn({ apiKey, history, userMessage, session, turnId }) {
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  }

  const messages = [...history, { role: "user", content: userMessage }];

  // Tool-use loop: keep going until Claude returns a turn with no tool calls.
  for (let iterations = 0; iterations < 8; iterations++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1536,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 500)}`);
    }

    const data = await res.json();
    messages.push({ role: "assistant", content: data.content });

    const toolUses = (data.content || []).filter((b) => b.type === "tool_use");

    if (data.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      // The model should always leave a closing message (enforced in the system prompt),
      // but fall back to something actionable instead of a silent/blank reply if it doesn't.
      return {
        text: text || "ขอโทษครับ ไม่สามารถตอบคำถามนี้ได้ในตอนนี้ รบกวนลองพิมพ์คำสั่งใหม่อีกครั้ง หรือระบุให้ชัดเจนขึ้น (เช่น ชื่อสินค้าที่ต้องการ)",
        history: messages,
      };
    }

    const toolResults = [];
    for (const toolUse of toolUses) {
      let output;
      try {
        output = await runTool(toolUse.name, toolUse.input || {}, session, turnId);
      } catch (err) {
        output = { result: { error: String(err.message || err) } };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(output.result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { text: "ขออภัย ระบบประมวลผลนานเกินไป กรุณาลองใหม่อีกครั้ง", history: messages };
}

module.exports = { runChatTurn };
