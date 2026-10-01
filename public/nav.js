// Shared sidebar, injected into <div id="sidebar-root"></div> on every page.
// Usage: <script src="/nav.js"></script><script>renderSidebar('dashboard');</script>

const NAV_ITEMS = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    group: "ภาพรวมร้าน",
    icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  },
  {
    key: "overview",
    href: "/overview",
    label: "สินค้า & สต็อก",
    group: "ภาพรวมร้าน",
    icon: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  },
  {
    key: "orders",
    href: "/orders",
    label: "ออเดอร์",
    group: "ภาพรวมร้าน",
    icon: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  },
  {
    key: "chat",
    href: "/",
    label: "แชทสั่งงาน",
    group: "ภาพรวมร้าน",
    icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  },
  {
    key: "campaign-center",
    href: "/campaign-center",
    label: "Campaign Center",
    group: "เครื่องมือการตลาด",
    icon: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  },
  {
    key: "mega-sale-calendar",
    href: "/mega-sale-calendar",
    label: "Mega Sale Calendar",
    group: "เครื่องมือการตลาด",
    icon: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
  },
  {
    key: "competitor-watch",
    href: "/competitor-watch",
    label: "Competitor Watch",
    group: "เครื่องมือการตลาด",
    icon: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  },
];

function renderSidebar(activeKey) {
  const root = document.getElementById("sidebar-root");
  if (!root) return;

  const groups = [];
  for (const item of NAV_ITEMS) {
    let g = groups.find((g) => g.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push(item);
  }

  const navHtml = groups
    .map(
      (g) => `
      <div class="nav-label">${g.name}</div>
      <div class="navgroup">
        ${g.items
          .map(
            (item) => `
          <a class="nav-link${item.key === activeKey ? " active" : ""}" href="${item.href}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
            <span>${item.label}</span>
          </a>`
          )
          .join("")}
      </div>`
    )
    .join("");

  root.innerHTML = `
    <div class="sidebar">
      <div class="brand">
        <div class="logo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
        <div>
          <div class="name">BWL Store Auto</div>
          <div class="sub">Black White Lifestyle</div>
        </div>
      </div>
      ${navHtml}
      <div class="spacer"></div>
      <button class="logout" id="navLogoutBtn">ออกจากระบบ</button>
    </div>
  `;

  document.getElementById("navLogoutBtn").addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  });
}
