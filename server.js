require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");
const { runChatTurn } = require("./lib/claude");
const { getDashboardSummary, getProductsPage, getOrdersPage } = require("./lib/dashboard");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.set("trust proxy", 1);
app.use(
  session({
    secret: process.env.SESSION_SECRET || "bwl-dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "unauthorized" });
  return res.redirect("/login");
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/login", (req, res) => {
  if (req.session?.loggedIn) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: "ยังไม่ได้ตั้งค่า ADMIN_PASSWORD บนเซิร์ฟเวอร์" });
  }
  if (password && password === expected) {
    req.session.loggedIn = true;
    req.session.chatHistory = [];
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.use(
  "/",
  requireAuth,
  express.static(path.join(__dirname, "public"), { extensions: ["html"] })
);

app.get("/api/dashboard", requireAuth, async (req, res) => {
  try {
    const summary = await getDashboardSummary();
    res.json(summary);
  } catch (err) {
    console.error("dashboard error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/products", requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const data = await getProductsPage({
      search: req.query.search || undefined,
      lowStockMax: req.query.lowStockMax !== undefined ? Number(req.query.lowStockMax) : undefined,
      page,
      pageSize,
    });
    res.json(data);
  } catch (err) {
    console.error("products error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const data = await getOrdersPage({
      search: req.query.search || undefined,
      page,
      pageSize,
    });
    res.json(data);
  } catch (err) {
    console.error("orders error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/api/chat", requireAuth, async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "ต้องระบุข้อความ" });
  }

  if (!req.session.chatHistory) req.session.chatHistory = [];

  try {
    const { text, history } = await runChatTurn({
      apiKey: process.env.ANTHROPIC_API_KEY,
      history: req.session.chatHistory,
      userMessage: message,
      session: req.session,
    });
    // Cap stored history so the session object / token usage doesn't grow unbounded.
    req.session.chatHistory = history.slice(-40);
    res.json({ reply: text });
  } catch (err) {
    console.error("chat error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`BWL Store Auto listening on port ${PORT}`);
});
