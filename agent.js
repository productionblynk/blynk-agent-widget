/* =====================================================
   B-lynk Agent Widget — Phase 1 (Refreshed UI Skin)
   Vanilla JS | Auto-boot | UI Renderer + Supabase Ask
   - Uses frosty "Blynky" UI
   - Scoped styles (no global :root/body/html selectors)
   - Supports tenant avatar via tenants.profile_icon (default fallback)
   - Supports optional tenant accent colors (if returned)
===================================================== */

(function () {
  if (window.BLYNK_AGENT) {
    console.warn("[Blynk Agent] Already initialized.");
    return;
  }

  const scriptEl =
    document.currentScript ||
    (function () {
      const scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  if (!scriptEl) {
    console.error("[Blynk Agent] Unable to locate script tag.");
    return;
  }

  const DEFAULT_PROFILE_ICON =
    "https://blynk-images.s3.us-west-2.amazonaws.com/ai-agent/profile-icons/smart-blynky.png";

  const ROOT_ID = "blynk-agent-root";
  const STYLE_ID = "blynk-agent-style";

  // -------------------------
  // CONFIG (from <script ...data-*>)
  // -------------------------
  const config = {
    clientId: scriptEl.getAttribute("data-client-id") || "blynk-default",
    apiUrl: scriptEl.getAttribute("data-api-url"), // full supabase function URL (ask)
    mode: scriptEl.getAttribute("data-mode") || "blynk_kb",
    debug: scriptEl.hasAttribute("data-debug"),

    // text
    title: scriptEl.getAttribute("data-title") || "Blynky",
    kicker: scriptEl.getAttribute("data-kicker") || "Ask",
    subcopy:
      scriptEl.getAttribute("data-subcopy") ||
      "Blynky will search articles and assist you with your questions.",

    // keys / role hints
    anonKey: scriptEl.getAttribute("data-anon-key") || "",
    role: (scriptEl.getAttribute("data-role") || "user").toLowerCase(),
    adminToken: scriptEl.getAttribute("data-admin-token") || "",

    // Optional: if you want to point directly to a tenant settings function
    // e.g. https://PROJECT.supabase.co/functions/v1/get_tenant_settings
    settingsUrl: scriptEl.getAttribute("data-settings-url") || "",

    // Optional UI quick actions (pipe-separated labels)
    // Example: data-quick-actions="Reset password|Track order|Contact support"
    quickActions:
      scriptEl.getAttribute("data-quick-actions") ||
      "Reset password|Track order|Contact support",

    // Optional explicit accent overrides
    accentCoral: scriptEl.getAttribute("data-accent-coral") || "",
    accentMint: scriptEl.getAttribute("data-accent-mint") || "",

    // Optional explicit profile icon override
    profileIcon: scriptEl.getAttribute("data-profile-icon") || "",
  };

  if (!config.apiUrl || !/^https?:\/\//i.test(config.apiUrl)) {
    console.error(
      "[Blynk Agent] Missing or invalid data-api-url. Must be a full URL like https://YOURPROJECT.supabase.co/functions/v1/ask"
    );
    return;
  }

  if (!config.anonKey) {
    console.warn(
      "[Blynk Agent] Missing data-anon-key. If your function requires Authorization, you will get 401 until you add it."
    );
  }

  function log(...args) {
    if (config.debug) console.log("[Blynk Agent]", ...args);
  }

  function safeLink(url) {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return null;
    }
  }

  // ✅ Source icons for links
  function sourceIcon(source) {
    if (source && source.type === "article") return "📘";

    const name = ((source && source.file_name) || (source && source.title) || "")
      .toString()
      .toLowerCase();

    if (name.endsWith(".pdf")) return "📄";
    if (name.endsWith(".gif")) return "🎞️";
    if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "🖼️";
    if (name.endsWith(".doc") || name.endsWith(".docx")) return "📝";
    if (name.endsWith(".xls") || name.endsWith(".xlsx")) return "📊";

    return "📎";
  }

  // UI-only source filtering (used only when backend is enforcing RBAC)
  function filterSourcesByRole(sources, role) {
    if (!Array.isArray(sources)) return [];
    if (role === "admin") return sources;

    return sources.filter((s) => {
      const ar = (s && (s.audience_role || s.audienceRole || "user"))
        .toString()
        .toLowerCase()
        .trim();
      return ar === "user";
    });
  }

  // -------------------------
  // TENANT SETTINGS (avatar/theme)
  // -------------------------
  function apiBaseFromAskUrl(askUrl) {
    // https://xxx.supabase.co/functions/v1/ask -> https://xxx.supabase.co/functions/v1
    try {
      const u = new URL(askUrl);
      const parts = u.pathname.split("/").filter(Boolean);
      // expects ["functions","v1","ask"]
      if (parts.length >= 2) {
        u.pathname = "/" + parts.slice(0, 2).join("/");
      }
      u.search = "";
      u.hash = "";
      return u.toString();
    } catch {
      return "";
    }
  }

  async function fetchTenantSettings() {
    const apiBase = apiBaseFromAskUrl(config.apiUrl);
    const candidates = [];

    // Prefer explicit settings URL if provided
    if (config.settingsUrl) candidates.push(config.settingsUrl);

    // Try common function names (safe fallback order)
    if (apiBase) {
      candidates.push(`${apiBase}/get_tenant_settings`);
      candidates.push(`${apiBase}/update_tenant_settings`); // your GET handler already returns settings
    }

    if (!candidates.length) return null;

    for (const baseUrl of candidates) {
      try {
        const url = `${baseUrl}?tenantId=${encodeURIComponent(config.clientId)}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${config.anonKey}`,
          },
        });

        if (!res.ok) continue;

        const data = await res.json().catch(() => null);
        if (data && (data.ok === true || data.tenantId || data.id)) {
          return data;
        }
      } catch (_e) {
        // ignore and keep trying
      }
    }

    return null;
  }

  // -------------------------
  // DOM helpers
  // -------------------------
  function createRoot() {
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);
    const root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.appendChild(root);
    return root;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(c));
    return node;
  }

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;

    // NOTE: Everything is scoped under #blynk-agent-root to avoid "gotchas"
    style.textContent = `
#${ROOT_ID}{all:initial}
#${ROOT_ID} *{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,"Helvetica Neue",sans-serif}

#${ROOT_ID} .blynk-wrap{
  position:fixed; bottom:24px; right:24px; z-index:999999;
  display:flex; flex-direction:column; gap:10px; align-items:flex-end;
}

#${ROOT_ID} .blynk-launcher{
  width:56px; height:56px; border-radius:999px; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 12px 30px rgba(0,0,0,0.18);
  background:#fff; color:#000;
}

#${ROOT_ID} .blynk-panel{
  width:360px; max-width:calc(100vw - 32px);
  height:720px; max-height:calc(100vh - 120px);
  border-radius:24px;
  overflow:hidden;
  display:none;
}
#${ROOT_ID} .blynk-panel.open{display:block}

/* ---- Scoped theme vars (no global :root) ---- */
#${ROOT_ID} .blynk-widget{
  --accent-coral: ${config.accentCoral || "#ed5b4e"};
  --accent-mint: ${config.accentMint || "#6ecace"};
  --ink:#504d61;
  --shadow: rgba(80, 77, 97, 0.08);
  --radius-xl: 24px;
  --blur: 18px;
  --ease: cubic-bezier(.2,.8,.2,1);
  --ease-soft: cubic-bezier(.22,.9,.2,1);

  position:relative;
  width:100%;
  height:100%;
  border-radius:var(--radius-xl);
  display:grid;
  grid-template-rows:auto 1fr auto;
}

/* frosty gradient behind everything (inside widget only) */
#${ROOT_ID} .blynk-widget::before{
  content:"";
  position:absolute;
  inset:-40px;
  z-index:0;
  background:
    radial-gradient(220px 220px at 18% 18%, rgba(110,202,206,.55), transparent 60%),
    radial-gradient(240px 240px at 82% 28%, rgba(237,91,78,.45), transparent 62%),
    radial-gradient(260px 260px at 55% 85%, rgba(110,202,206,.35), transparent 62%),
    linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,.35));
  filter: blur(22px) saturate(1.2);
  opacity:.9;
  pointer-events:none;
}
#${ROOT_ID} .blynk-widget::after{
  content:"";
  position:absolute;
  inset:0;
  z-index:1;
  background: linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.44));
  border: 1px solid rgba(80,77,97,.10);
  border-radius: var(--radius-xl);
  box-shadow: 0 26px 90px rgba(80,77,97,.08), inset 0 1px 0 rgba(255,255,255,.65);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  pointer-events:none;
}

/* make UI above layers */
#${ROOT_ID} .blynk-head,
#${ROOT_ID} .blynk-stage,
#${ROOT_ID} .blynk-composer{
  position:relative;
  z-index:2;
}

/* ---- Header ---- */
#${ROOT_ID} .blynk-head{
  position:sticky; top:0; z-index:5;
  background: linear-gradient(180deg, rgba(255,255,255,.82), rgba(255,255,255,.62));
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border-bottom: 1px solid rgba(80,77,97,.10);
}
#${ROOT_ID} .blynk-header{
  padding:18px 16px 12px;
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
}
#${ROOT_ID} .blynk-brand{
  display:flex; align-items:center; gap:12px; min-width:0;
}
#${ROOT_ID} .blynk-logo{
  width:46px; height:46px; border-radius:999px;
  border:1px solid rgba(80,77,97,.12);
  background:
    radial-gradient(circle at 30% 30%, rgba(237,91,78,.22), transparent 55%),
    radial-gradient(circle at 70% 70%, rgba(110,202,206,.18), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  box-shadow: 0 18px 55px var(--shadow);
  display:grid; place-items:center;
  overflow:hidden;
}
#${ROOT_ID} .blynk-logoImg{
  width:100%; height:100%; object-fit:cover; border-radius:999px; display:block;
}
#${ROOT_ID} .blynk-brandText{display:flex; flex-direction:column; gap:2px; min-width:0}
#${ROOT_ID} .blynk-kicker{font-size:13px; font-weight:650; color: rgba(80,77,97,.78); line-height:1.1}
#${ROOT_ID} .blynk-title{font-size:22px; font-weight:800; line-height:1.05; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
#${ROOT_ID} .blynk-close{
  width:36px; height:36px; border-radius:14px;
  border:1px solid rgba(80,77,97,.12);
  background: rgba(255,255,255,.58);
  box-shadow: 0 18px 55px var(--shadow);
  display:grid; place-items:center; cursor:pointer;
  transition: transform 220ms var(--ease), box-shadow 220ms var(--ease), border-color 220ms var(--ease);
}
#${ROOT_ID} .blynk-close:hover{
  transform: translateY(-1px);
  border-color: rgba(237,91,78,.28);
  box-shadow: 0 26px 90px var(--shadow);
}
#${ROOT_ID} .blynk-x{font-size:18px; line-height:1; color: rgba(237,91,78,.85)}

#${ROOT_ID} .blynk-subcopy{
  padding: 0 16px 10px;
  color: rgba(80,77,97,.72);
  font-size:14px;
  line-height:1.45;
}
#${ROOT_ID} .blynk-chips{display:flex; gap:8px; flex-wrap:wrap; padding: 0 16px 14px}
#${ROOT_ID} .blynk-chip{
  font-size:12px; padding:6px 10px; border-radius:999px;
  border:1px solid rgba(80,77,97,.10);
  background: rgba(255,255,255,.58);
  cursor:pointer;
  box-shadow: 0 18px 55px var(--shadow);
  transition: transform 220ms var(--ease), border-color 220ms var(--ease);
  user-select:none;
}
#${ROOT_ID} .blynk-chip:hover{transform: translateY(-1px); border-color: rgba(110,202,206,.28)}

/* ---- Messages ---- */
#${ROOT_ID} .blynk-stage{
  padding: 14px 14px 10px;
  overflow:auto;
  scroll-behavior:smooth;
  background: transparent;
}
#${ROOT_ID} .blynk-stage::-webkit-scrollbar{width:10px}
#${ROOT_ID} .blynk-stage::-webkit-scrollbar-thumb{
  background: rgba(80,77,97,.12);
  border-radius:999px;
  border: 2px solid rgba(255,255,255,.65);
}
#${ROOT_ID} .blynk-row{display:flex; gap:10px; align-items:flex-end; margin:10px 0}
#${ROOT_ID} .blynk-row.ai{justify-content:flex-start}
#${ROOT_ID} .blynk-row.user{justify-content:flex-end}
#${ROOT_ID} .blynk-avatar{
  width:30px; height:30px; border-radius:999px; overflow:hidden;
  border:1px solid rgba(80,77,97,.12);
  box-shadow: 0 18px 55px var(--shadow);
  background:
    radial-gradient(circle at 30% 30%, rgba(110,202,206,.40), transparent 55%),
    radial-gradient(circle at 70% 70%, rgba(237,91,78,.26), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  flex:0 0 auto;
}
#${ROOT_ID} .blynk-avatar.user{
  background:
    radial-gradient(circle at 30% 30%, rgba(237,91,78,.30), transparent 55%),
    radial-gradient(circle at 70% 70%, rgba(110,202,206,.18), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
}
#${ROOT_ID} .blynk-avatar img{width:100%; height:100%; object-fit:cover; display:block}

#${ROOT_ID} .blynk-bubble{
  max-width:74%;
  padding:12px 14px;
  border-radius:18px;
  border:1px solid rgba(80,77,97,.08);
  box-shadow: 0 18px 55px rgba(80,77,97,.06);
  background: rgba(255,255,255,.62);
  font-size:14px;
  line-height:1.45;
  position:relative;
  overflow:hidden;
  color: rgba(80,77,97,.92);
}
#${ROOT_ID} .blynk-bubble:before{
  content:"";
  position:absolute;
  inset:-60px;
  background: radial-gradient(circle at 20% 20%, rgba(255,255,255,.55), transparent 55%);
  opacity:.55;
  transform: rotate(10deg);
  pointer-events:none;
}
#${ROOT_ID} .blynk-bubble.user{
  background: linear-gradient(180deg, rgba(110,202,206,.30), rgba(110,202,206,.14));
  border-color: rgba(110,202,206,.28);
}
#${ROOT_ID} .blynk-bubble.ai:after{
  content:"";
  position:absolute;
  left:-6px; bottom:10px;
  width:14px; height:14px;
  background: rgba(255,255,255,.62);
  border-left: 1px solid rgba(80,77,97,.10);
  border-bottom: 1px solid rgba(80,77,97,.10);
  transform: rotate(45deg);
}
#${ROOT_ID} .blynk-bubble.user:after{
  content:"";
  position:absolute;
  right:-6px; bottom:10px;
  width:14px; height:14px;
  background: rgba(110,202,206,.16);
  border-right: 1px solid rgba(110,202,206,.22);
  border-top: 1px solid rgba(110,202,206,.10);
  transform: rotate(45deg);
}

#${ROOT_ID} .blynk-enter{animation: blynkPopIn 380ms var(--ease-soft) both}
@keyframes blynkPopIn{
  from{transform: translateY(10px) scale(.98); opacity:0}
  to{transform: translateY(0) scale(1); opacity:1}
}

#${ROOT_ID} .blynk-meta{
  font-size:12px;
  color: rgba(80,77,97,.52);
  margin-top:4px;
}
#${ROOT_ID} .blynk-meta.ai{margin-left:40px}
#${ROOT_ID} .blynk-meta.user{text-align:right; margin-right:40px}

#${ROOT_ID} .blynk-typing{
  display:inline-flex;
  gap:6px;
  align-items:center;
  padding:10px 12px;
  border-radius:999px;
  border:1px solid rgba(80,77,97,.10);
  background: rgba(255,255,255,.60);
  box-shadow: 0 18px 55px var(--shadow);
}
#${ROOT_ID} .blynk-dot{
  width:6px; height:6px; border-radius:999px;
  background: rgba(80,77,97,.55);
  animation: blynkBounce 900ms infinite;
}
#${ROOT_ID} .blynk-dot:nth-child(2){animation-delay:120ms}
#${ROOT_ID} .blynk-dot:nth-child(3){animation-delay:240ms}
@keyframes blynkBounce{
  0%, 80%, 100%{transform: translateY(0); opacity:.45}
  40%{transform: translateY(-4px); opacity:.85}
}

/* Sources (links) */
#${ROOT_ID} .blynk-sources{
  margin-top:10px;
  padding-top:10px;
  border-top: 1px solid rgba(80,77,97,.10);
  display:flex;
  flex-direction:column;
  gap:6px;
}
#${ROOT_ID} .blynk-source{
  font-size:12px;
  color: rgba(80,77,97,.78);
  text-decoration:none;
  display:inline-flex;
  gap:8px;
  align-items:center;
}
#${ROOT_ID} .blynk-source:hover{text-decoration:underline}

/* ---- Composer ---- */
#${ROOT_ID} .blynk-composer{
  padding:12px;
  border-top:1px solid rgba(80,77,97,.10);
  display:flex;
  gap:10px;
  align-items:center;
  background: linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.56));
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
}
#${ROOT_ID} .blynk-inputWrap{
  flex:1;
  height:44px;
  border-radius:16px;
  border:1px solid rgba(80,77,97,.12);
  background: rgba(255,255,255,.62);
  box-shadow: 0 18px 55px var(--shadow);
  display:flex;
  align-items:center;
  padding:0 12px;
  position:relative;
  overflow:hidden;
}
#${ROOT_ID} .blynk-inputWrap:before{
  content:"";
  position:absolute;
  left:-20%; right:-20%; bottom:-60%;
  height:130%;
  background: radial-gradient(closest-side, rgba(255,255,255,.80), transparent 60%);
  opacity:0;
  transform: translateY(10px);
  transition: opacity 220ms var(--ease), transform 220ms var(--ease);
  pointer-events:none;
}
#${ROOT_ID} .blynk-inputWrap:focus-within:before{
  opacity:.8;
  transform: translateY(0);
}
#${ROOT_ID} .blynk-input{
  width:100%;
  border:0;
  outline:0;
  font-size:14px;
  background:transparent;
  color: rgba(80,77,97,.92);
}
#${ROOT_ID} .blynk-input::placeholder{color: rgba(80,77,97,.45)}

#${ROOT_ID} .blynk-send{
  height:44px;
  min-width:78px;
  padding:0 14px;
  border-radius:14px;
  border:1px solid rgba(80,77,97,.12);
  background: linear-gradient(180deg, rgba(237,91,78,.22), rgba(237,91,78,.14));
  box-shadow: 0 18px 55px var(--shadow);
  cursor:pointer;
  font-weight:750;
  color: rgba(80,77,97,.92);
  transition: transform 220ms var(--ease), box-shadow 220ms var(--ease), filter 220ms var(--ease);
}
#${ROOT_ID} .blynk-send:hover{transform: translateY(-1px); box-shadow: 0 26px 90px var(--shadow); filter: brightness(1.02)}
#${ROOT_ID} .blynk-send:active{transform: translateY(0)}
#${ROOT_ID} .blynk-send:disabled{opacity:.55; cursor:not-allowed}

@media (prefers-reduced-motion: reduce){
  #${ROOT_ID} *{animation:none !important; transition:none !important; scroll-behavior:auto !important}
}
    `;

    document.head.appendChild(style);
  }

  // -------------------------
  // Widget
  // -------------------------
  const Agent = {
    config,
    root: null,
    isOpen: false,
    ui: {},
    tenant: {
      profile_icon: config.profileIcon || DEFAULT_PROFILE_ICON,
      accent_coral: config.accentCoral || "",
      accent_mint: config.accentMint || "",
      title: config.title,
    },
    _typingRow: null,

    async init() {
      injectStylesOnce();
      this.root = createRoot();

      // Try to load tenant settings (avatar/theme) without breaking if missing
      try {
        const t = await fetchTenantSettings();
        if (t) {
          // avatar column (you added profile_icon)
          const icon =
            t.profile_icon ||
            (t.tenant && t.tenant.profile_icon) ||
            t.profileIcon ||
            DEFAULT_PROFILE_ICON;

          this.tenant.profile_icon = (icon || "").toString().trim() || DEFAULT_PROFILE_ICON;

          // Optional theme support (if you add columns later)
          const coral =
            t.accent_coral ||
            t.accentCoral ||
            (t.theme && t.theme.accent_coral) ||
            "";
          const mint =
            t.accent_mint ||
            t.accentMint ||
            (t.theme && t.theme.accent_mint) ||
            "";

          if (coral) this.tenant.accent_coral = String(coral);
          if (mint) this.tenant.accent_mint = String(mint);

          // Optional tenant display name/title
          const tenantTitle = t.title || t.widget_title || t.tenant_title || "";
          if (tenantTitle) this.tenant.title = String(tenantTitle);

          log("Tenant settings loaded:", t);
        }
      } catch (e) {
        log("Tenant settings load skipped:", e);
      }

      this.mountUI();
      log("Initialized", { config: this.config, tenant: this.tenant });
    },

    mountUI() {
      // wrapper
      const wrap = el("div", { class: "blynk-wrap" });

      // panel
      const panel = el("div", {
        class: "blynk-panel",
        role: "dialog",
        "aria-label": "Support chat",
      });

      // widget (inside panel)
      const widget = el("div", {
        class: "blynk-widget",
        role: "application",
        "aria-label": "Ask Blynky chat widget",
      });

      // apply tenant accents if present
      if (this.tenant.accent_coral) widget.style.setProperty("--accent-coral", this.tenant.accent_coral);
      if (this.tenant.accent_mint) widget.style.setProperty("--accent-mint", this.tenant.accent_mint);

      // header block
      const head = el("div", { class: "blynk-head" });

      const headerRow = el("div", { class: "blynk-header" });

      const brand = el("div", { class: "blynk-brand" });

      // logo (image if available, otherwise fallback svg)
      const logo = el("div", { class: "blynk-logo", "aria-hidden": "true" });
      const logoImg = el("img", {
        class: "blynk-logoImg",
        alt: "",
        src: this.tenant.profile_icon || DEFAULT_PROFILE_ICON,
      });
      logo.appendChild(logoImg);

      const brandText = el("div", { class: "blynk-brandText" }, [
        el("div", { class: "blynk-kicker", text: this.config.kicker }),
        el("div", { class: "blynk-title", text: this.tenant.title || this.config.title }),
      ]);

      brand.appendChild(logo);
      brand.appendChild(brandText);

      const closeBtn = el("button", { class: "blynk-close", type: "button", "aria-label": "Close" }, [
        el("span", { class: "blynk-x", text: "×" }),
      ]);
      closeBtn.addEventListener("click", () => this.close());

      headerRow.appendChild(brand);
      headerRow.appendChild(closeBtn);

      const subcopy = el("div", { class: "blynk-subcopy", text: this.config.subcopy });

      const chips = el("div", { class: "blynk-chips", "aria-label": "Quick replies" });

      const actions = (this.config.quickActions || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);

      actions.forEach((label) => {
        const chip = el("div", { class: "blynk-chip", text: label });
        chip.setAttribute("data-chip", label);
        chip.addEventListener("click", () => {
          this.ui.input.value = label;
          this.ui.input.focus();
          chip.animate(
            [{ transform: "translateY(0)" }, { transform: "translateY(-2px)" }, { transform: "translateY(0)" }],
            { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }
          );
        });
        chips.appendChild(chip);
      });

      head.appendChild(headerRow);
      head.appendChild(subcopy);
      head.appendChild(chips);

      // stage
      const stage = el("div", { class: "blynk-stage" });
      stage.id = "blynkStage"; // scoped id but not relied upon

      // initial hello
      stage.appendChild(this._msgRow({ role: "ai", text: "Hi! How can I help today?", meta: "Blynky • just now" }));

      // typing row
      const typingRow = el("div", { class: "blynk-row ai" });
      const typingAvatar = el("div", { class: "blynk-avatar ai", "aria-hidden": "true" }, [
        el("img", { alt: "", src: this.tenant.profile_icon || DEFAULT_PROFILE_ICON }),
      ]);
      const typingBubble = el("div", { class: "blynk-typing", "aria-label": "Blynky typing" }, [
        el("div", { class: "blynk-dot" }),
        el("div", { class: "blynk-dot" }),
        el("div", { class: "blynk-dot" }),
      ]);
      typingRow.appendChild(typingAvatar);
      typingRow.appendChild(typingBubble);
      typingRow.style.display = "none";
      stage.appendChild(typingRow);

      this._typingRow = typingRow;

      // composer
      const composer = el("div", { class: "blynk-composer" });

      const inputWrap = el("div", { class: "blynk-inputWrap" });
      const input = el("input", {
        class: "blynk-input",
        id: "blynkInput",
        type: "text",
        placeholder: "Ask a question...",
        autocomplete: "off",
      });
      inputWrap.appendChild(input);

      const sendBtn = el("button", { class: "blynk-send", id: "blynkSendBtn", type: "button", text: "Send" });

      sendBtn.addEventListener("click", () => this.handleSend());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleSend();
        }
      });

      composer.appendChild(inputWrap);
      composer.appendChild(sendBtn);

      // assemble widget
      widget.appendChild(head);
      widget.appendChild(stage);
      widget.appendChild(composer);

      // panel content
      panel.appendChild(widget);

      // launcher button
      const launcher = el("button", {
        class: "blynk-launcher",
        type: "button",
        title: "Open support chat",
      });
      launcher.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5.5C4 4.67 4.67 4 5.5 4h13C19.33 4 20 4.67 20 5.5v9c0 .83-.67 1.5-1.5 1.5H9l-4.2 3.15c-.5.38-1.2.02-1.2-.6V5.5Z"
                stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `;
      launcher.addEventListener("click", () => this.toggle());

      wrap.appendChild(panel);
      wrap.appendChild(launcher);
      this.root.appendChild(wrap);

      this.ui = { wrap, panel, widget, head, stage, composer, input, sendBtn, launcher };

      // open/closed default: closed
      this.close();
    },

    open() {
      this.isOpen = true;
      this.ui.panel.classList.add("open");
      this.ui.input.focus();
      this.scrollToBottom();
    },

    close() {
      this.isOpen = false;
      this.ui.panel.classList.remove("open");
    },

    toggle() {
      this.isOpen ? this.close() : this.open();
    },

    scrollToBottom() {
      const t = this.ui.stage;
      t.scrollTop = t.scrollHeight;
    },

    setTyping(on) {
      if (!this._typingRow) return;
      this._typingRow.style.display = on ? "flex" : "none";
      if (on) this.scrollToBottom();
    },

    setSending(isSending) {
      this.ui.sendBtn.disabled = isSending;
      this.ui.input.disabled = isSending;
    },

    _msgRow({ role, text, meta, sources }) {
      const row = el("div", { class: `blynk-row ${role}` });

      const av = el("div", { class: `blynk-avatar ${role}`, "aria-hidden": "true" });
      if (role === "ai") {
        av.appendChild(el("img", { alt: "", src: this.tenant.profile_icon || DEFAULT_PROFILE_ICON }));
      }

      const wrap = el("div");

      const bubble = el("div", { class: `blynk-bubble ${role} blynk-enter` });
      bubble.textContent = text;

      if (Array.isArray(sources) && sources.length) {
        const sourcesEl = el("div", { class: "blynk-sources" });

        sources.slice(0, 5).forEach((s) => {
          const href = safeLink(s.url);
          if (!href) return;

          const a = el("a", {
            class: "blynk-source",
            href,
            target: "_blank",
            rel: "noopener noreferrer",
          });

          const icon = sourceIcon(s);
          a.textContent = `${icon} ${s.title || href}`;
          sourcesEl.appendChild(a);
        });

        bubble.appendChild(sourcesEl);
      }

      const m = el("div", { class: `blynk-meta ${role}`, text: meta });

      wrap.appendChild(bubble);
      wrap.appendChild(m);

      if (role === "user") {
        row.appendChild(wrap);
        row.appendChild(av);
      } else {
        row.appendChild(av);
        row.appendChild(wrap);
      }

      return row;
    },

    appendMessage(role, text, sources) {
      const meta = role === "user" ? "You • now" : "Blynky • now";
      this.ui.stage.insertBefore(
        this._msgRow({ role, text, meta, sources }),
        this._typingRow || null
      );
      this.scrollToBottom();
    },

    async handleSend(forcedText) {
      const text = (forcedText || this.ui.input.value || "").trim();
      if (!text) return;

      this.appendMessage("user", text);
      this.ui.input.value = "";

      this.setSending(true);
      this.setTyping(true);

      try {
        const payload = {
          question: text,
          clientId: this.config.clientId,
          mode: this.config.mode,
          role: this.config.role,
          debug: this.config.debug,
        };

        const headers = {
          "Content-Type": "application/json",
        };

        if (this.config.anonKey) {
          headers.apikey = this.config.anonKey;
          headers.Authorization = `Bearer ${this.config.anonKey}`;
        }

        if (this.config.adminToken) {
          payload.adminToken = this.config.adminToken;
          headers["x-admin-token"] = this.config.adminToken;
        }

        const res = await fetch(this.config.apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Ask failed (${res.status}): ${errText}`);
        }

        const data = await res.json();

        const bypassRoleFilter = Boolean(
          data && (data.disableRoleFilter || data.disable_role_filter)
        );

        const allSources = Array.isArray(data?.sources) ? data.sources : [];
        const visibleSources = bypassRoleFilter
          ? allSources
          : filterSourcesByRole(allSources, this.config.role);

        const answer = (data?.answer || "No answer returned.").toString();

        this.setTyping(false);
        this.appendMessage("ai", answer, visibleSources);
      } catch (err) {
        this.setTyping(false);
        this.appendMessage("ai", "Sorry — something went wrong. Please try again.");
        log("Error", err);
      } finally {
        this.setSending(false);
        if (this.isOpen) this.ui.input.focus();
      }
    },
  };

  window.BLYNK_AGENT = Agent;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Agent.init());
  } else {
    Agent.init();
  }
})();
