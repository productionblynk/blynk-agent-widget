/* =====================================================
   B-lynk Agent Widget — Grouped Sources UI (Articles / Docs / Media)
   - Frosty UI + tenant theme/profile
   - Supports ask response shapes:
       1) sources_grouped: { articles, docs, media }   (preferred)
       2) sources (array)                              (back-compat)
       3) sources_flat (array)                         (older)
       4) sources: { primary, assets }                 (older grouped)
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
    apiUrl: scriptEl.getAttribute("data-api-url"),
    mode: scriptEl.getAttribute("data-mode") || "blynk_kb",
    debug: scriptEl.hasAttribute("data-debug"),

    title: scriptEl.getAttribute("data-title") || "Blynky",
    kicker: scriptEl.getAttribute("data-kicker") || "Ask",
    subcopy:
      scriptEl.getAttribute("data-subcopy") ||
      "Blynky assist you with your questions.",

    anonKey: scriptEl.getAttribute("data-anon-key") || "",
    role: (scriptEl.getAttribute("data-role") || "user").toLowerCase(),
    adminToken: scriptEl.getAttribute("data-admin-token") || "",

    settingsUrl: scriptEl.getAttribute("data-settings-url") || "",

    quickActions:
      scriptEl.getAttribute("data-quick-actions") ||
      "Reset password|Sequential ring|Priority alert",

    accentCoral: scriptEl.getAttribute("data-accent-coral") || "",
    accentMint: scriptEl.getAttribute("data-accent-mint") || "",

    profileIcon: scriptEl.getAttribute("data-profile-icon") || "",
  };

  if (!config.apiUrl || !/^https?:\/\//i.test(config.apiUrl)) {
    console.error(
      "[Blynk Agent] Missing or invalid data-api-url. Must be a full URL like https://YOURPROJECT.supabase.co/functions/v1/ask"
    );
    return;
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

  function extOf(nameOrUrl) {
    const s = String(nameOrUrl || "").toLowerCase().trim();
    const clean = s.split("?")[0].split("#")[0];
    const m = clean.match(/\.([a-z0-9]+)$/i);
    return m ? m[1] : "";
  }

  function isMediaExt(ext) {
    return (
      ext === "gif" ||
      ["png", "jpg", "jpeg", "webp", "svg", "bmp", "tiff"].includes(ext) ||
      ["mp4", "mov", "webm", "m4v"].includes(ext)
    );
  }

  // -------------------------
  // ✅ Safe AI formatting helpers (no HTML injection)
  // -------------------------
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Turns plain text into simple HTML:
  // - paragraphs via blank lines
  // - ordered lists via "1. ..."
  // - bullet lists via "- ..." or "* ..."
  // - **bold** -> <strong>
  function formatAiTextToHtml(text) {
    const raw = String(text || "");
    const safe = escapeHtml(raw);

    // Normalize newlines
    const lines = safe.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    let html = "";
    let inUL = false;
    let inOL = false;
    let inP = false;

    const closeP = () => {
      if (inP) {
        html += "</p>";
        inP = false;
      }
    };
    const closeUL = () => {
      if (inUL) {
        html += "</ul>";
        inUL = false;
      }
    };
    const closeOL = () => {
      if (inOL) {
        html += "</ol>";
        inOL = false;
      }
    };

    const inlineFormat = (s) => {
      // **bold**
      return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Blank line -> paragraph break
      if (!line.trim()) {
        closeP();
        closeUL();
        closeOL();
        continue;
      }

      const olMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
      const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);

      if (olMatch) {
        closeP();
        closeUL();
        if (!inOL) {
          html += "<ol>";
          inOL = true;
        }
        html += `<li>${inlineFormat(olMatch[2])}</li>`;
        continue;
      }

      if (ulMatch) {
        closeP();
        closeOL();
        if (!inUL) {
          html += "<ul>";
          inUL = true;
        }
        html += `<li>${inlineFormat(ulMatch[1])}</li>`;
        continue;
      }

      // Normal line -> paragraph content (soft break inside paragraph)
      closeUL();
      closeOL();
      if (!inP) {
        html += "<p>";
        inP = true;
        html += inlineFormat(line.trim());
      } else {
        html += "<br/>" + inlineFormat(line.trim());
      }
    }

    closeP();
    closeUL();
    closeOL();

    return html || "<p></p>";
  }

  // -------------------------
  // Debug intent helpers
  // -------------------------
  function prettyIntent(intent) {
    const v = String(intent || "").toLowerCase().trim();
    if (!v) return "";
    if (v === "media_request") return "MEDIA REQUEST";
    if (v === "how_to") return "HOW TO";
    if (v === "small_talk") return "SMALL TALK";
    if (v === "generic") return "GENERIC";
    return v.toUpperCase();
  }

  // -------------------------
  // Color helpers
  // -------------------------
  function hexToRgb(hex) {
    const s = String(hex || "").trim();
    const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return { r, g, b, css: `${r}, ${g}, ${b}` };
  }

  function setThemeVars(el, theme) {
    if (!el || !theme) return;

    if (theme.primary) {
      el.style.setProperty("--blynk-primary", theme.primary);
      const rgb = hexToRgb(theme.primary);
      if (rgb) el.style.setProperty("--blynk-primary-rgb", rgb.css);
    }

    if (theme.accent) {
      el.style.setProperty("--blynk-accent", theme.accent);
      const rgb = hexToRgb(theme.accent);
      if (rgb) el.style.setProperty("--blynk-accent-rgb", rgb.css);
    }

    if (theme.launcher) {
      el.style.setProperty("--blynk-launcher", theme.launcher);
      const rgb = hexToRgb(theme.launcher);
      if (rgb) el.style.setProperty("--blynk-launcher-rgb", rgb.css);
    }
  }

  // -------------------------
  // Icon for sources
  // -------------------------
  function sourceIcon(s) {
    if (!s) return "📎";
    if (s.kind === "article" || s.type === "article") return "📘";

    const name = String(s.file_name || s.title || s.url || "").toLowerCase();
    const ext = extOf(name);

    if (ext === "pdf") return "📄";
    if (ext === "gif") return "🎞️";
    if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "🎬";
    if (["png", "jpg", "jpeg", "webp", "svg", "bmp", "tiff"].includes(ext))
      return "🖼️";
    if (["doc", "docx"].includes(ext)) return "📝";
    if (["xls", "xlsx"].includes(ext)) return "📊";

    return "📎";
  }

  // UI-only source filtering (belt + suspenders)
  function filterSourcesByRole(list, role) {
    if (!Array.isArray(list)) return [];
    if (role === "admin") return list;

    return list.filter((s) => {
      const ar = String(s.audience_role || s.audienceRole || "user")
        .toLowerCase()
        .trim();
      return ar === "user";
    });
  }

  // -------------------------
  // TENANT SETTINGS
  // -------------------------
  function apiBaseFromAskUrl(askUrl) {
    try {
      const u = new URL(askUrl);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) u.pathname = "/" + parts.slice(0, 2).join("/");
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

    if (config.settingsUrl) candidates.push(config.settingsUrl);
    if (apiBase) candidates.push(`${apiBase}/update_tenant_settings`);

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
        if (data && (data.ok === true || data.tenantId || data.id)) return data;
      } catch (_e) {}
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

    style.textContent = `
#${ROOT_ID}{all:initial}
#${ROOT_ID} *{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,"Helvetica Neue",sans-serif}

#${ROOT_ID} .blynk-wrap{
  position:fixed; bottom:24px; right:24px; z-index:999999;
  display:flex; flex-direction:column; gap:10px; align-items:flex-end;
  --blynk-primary: ${config.accentMint || "#6ecace"};
  --blynk-accent: ${config.accentCoral || "#ed5b4e"};
  --blynk-launcher: ${config.accentMint || "#6ecace"};
  --blynk-primary-rgb: 110, 202, 206;
  --blynk-accent-rgb: 237, 91, 78;
  --blynk-launcher-rgb: 110, 202, 206;
}

#${ROOT_ID} .blynk-launcher{
  width:56px; height:56px; border-radius:999px; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 12px 30px rgba(0,0,0,0.18);
  background: var(--blynk-launcher);
  color:#fff;
  border: 1px solid rgba(var(--blynk-launcher-rgb), .35);
}

#${ROOT_ID} .blynk-panel{
  width:360px; max-width:calc(100vw - 32px);
  height:720px; max-height:calc(100vh - 120px);
  border-radius:24px;
  overflow:hidden;
  display:none;
}
#${ROOT_ID} .blynk-panel.open{display:block}

#${ROOT_ID} .blynk-widget{
  --blynk-primary: var(--blynk-primary);
  --blynk-accent: var(--blynk-accent);
  --blynk-primary-rgb: var(--blynk-primary-rgb);
  --blynk-accent-rgb: var(--blynk-accent-rgb);
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

#${ROOT_ID} .blynk-widget::before{
  content:"";
  position:absolute;
  inset:-40px;
  z-index:0;
  background:
    radial-gradient(220px 220px at 18% 18%, rgba(var(--blynk-primary-rgb), .55), transparent 60%),
    radial-gradient(240px 240px at 82% 28%, rgba(var(--blynk-accent-rgb), .45), transparent 62%),
    radial-gradient(260px 260px at 55% 85%, rgba(var(--blynk-primary-rgb), .35), transparent 62%),
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

#${ROOT_ID} .blynk-head,
#${ROOT_ID} .blynk-stage,
#${ROOT_ID} .blynk-composer{
  position:relative;
  z-index:2;
}

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
    radial-gradient(circle at 30% 30%, rgba(var(--blynk-accent-rgb), .22), transparent 55%),
    radial-gradient(circle at 70% 70%, rgba(var(--blynk-primary-rgb), .18), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  box-shadow: 0 18px 55px var(--shadow);
  display:grid; place-items:center;
  overflow:hidden;
}
#${ROOT_ID} .blynk-logoImg{width:80%; height:100%; object-fit:contain; border-radius:999px; display:block;}
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
  border-color: rgba(var(--blynk-accent-rgb), .28);
  box-shadow: 0 26px 90px var(--shadow);
}
#${ROOT_ID} .blynk-x{font-size:18px; line-height:1; color: rgba(var(--blynk-accent-rgb), .85)}

#${ROOT_ID} .blynk-subcopy{
  padding: 0 16px 10px;
  color: rgba(80,77,97,.80);
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
#${ROOT_ID} .blynk-chip:hover{transform: translateY(-1px); border-color: rgba(var(--blynk-primary-rgb), .28)}

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
    radial-gradient(circle at 30% 30%, rgba(var(--blynk-primary-rgb), .40), transparent 55%),
    radial-gradient(circle at 70% 70%, rgba(var(--blynk-accent-rgb), .26), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  flex:0 0 auto;
}
#${ROOT_ID} .blynk-avatar.user{
  background:
    radial-gradient(circle at 30% 30%, rgba(var(--blynk-accent-rgb), .30), transparent 55%),
    radial-gradient(circle at 70% 70%, rgba(var(--blynk-primary-rgb), .18), transparent 60%),
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
  color: rgba(0,0,0,1);
}
#${ROOT_ID} .blynk-bubble.user{
  background: rgba(170, 170, 178, 0.75);
  border-color: rgba(80, 77, 97, 0.4);
}

/* ✅ AI formatted text inside bubble */
#${ROOT_ID} .blynk-msg p{
  margin: 0 0 10px 0;
}
#${ROOT_ID} .blynk-msg p:last-child{
  margin-bottom: 0;
}
#${ROOT_ID} .blynk-msg ul,
#${ROOT_ID} .blynk-msg ol{
  margin: 6px 0 10px 18px;
  padding: 0;
}
#${ROOT_ID} .blynk-msg li{
  margin: 4px 0;
}
#${ROOT_ID} .blynk-msg strong{
  font-weight: 850;
}

/* ✅ Debug intent pill */
#${ROOT_ID} .blynk-intent{
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:11px;
  font-weight:850;
  letter-spacing:.02em;
  text-transform:uppercase;
  padding:5px 9px;
  border-radius:999px;
  border:1px solid rgba(var(--blynk-primary-rgb), .22);
  background: rgba(255,255,255,.52);
  color: rgba(80,77,97,.78);
  margin-bottom:8px;
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

/* Sources block */
#${ROOT_ID} .blynk-sources{
  margin-top:10px;
  padding-top:10px;
  border-top: 1px solid rgba(80,77,97,.10);
  display:flex;
  flex-direction:column;
  gap:8px;
}
#${ROOT_ID} .blynk-sourcesTitle{
  font-size:12px;
  font-weight:900;
  letter-spacing:.02em;
  color: rgba(80,77,97,.72);
  text-transform: uppercase;
}
#${ROOT_ID} .blynk-sourcesGroupTitle{
  font-size:11px;
  font-weight:900;
  letter-spacing:.02em;
  color: rgba(var(--blynk-primary-rgb), .85);
  text-transform: uppercase;
  margin-top:4px;
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
#${ROOT_ID} .blynk-inputWrap:focus-within{
  border-color: rgba(var(--blynk-primary-rgb), .32);
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
  border:1px solid rgba(var(--blynk-accent-rgb), .28);
  background: linear-gradient(180deg, rgba(var(--blynk-accent-rgb), .22), rgba(var(--blynk-accent-rgb), .14));
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
  // Grouped sources normalization (Articles / Docs / Media)
  // -------------------------
  function normalizeSourcesToADM(data) {
    // 1) Preferred: sources_grouped
    if (data && data.sources_grouped && typeof data.sources_grouped === "object") {
      const sg = data.sources_grouped;
      const articles = Array.isArray(sg.articles) ? sg.articles : [];
      const docs = Array.isArray(sg.docs) ? sg.docs : [];
      const media = Array.isArray(sg.media) ? sg.media : [];
      return { articles, docs, media };
    }

    // 2) Older grouped: sources: { primary, assets }
    if (data && data.sources && typeof data.sources === "object" && !Array.isArray(data.sources)) {
      const primary = Array.isArray(data.sources.primary) ? data.sources.primary : [];
      const assets = Array.isArray(data.sources.assets) ? data.sources.assets : [];

      const articles = primary.filter((s) => s && (s.type === "article" || s.kind === "article"));
      const docs = primary.filter((s) => !(s && (s.type === "article" || s.kind === "article")));
      const media = assets;

      return { articles, docs, media };
    }

    // 3) Flat fallback
    const flat =
      (data && Array.isArray(data.sources_flat) && data.sources_flat) ||
      (data && Array.isArray(data.sources) && data.sources) ||
      [];

    const articles = [];
    const docs = [];
    const media = [];

    flat.forEach((s) => {
      if (!s) return;

      const isArticle = s.type === "article" || s.kind === "article";
      if (isArticle) {
        articles.push(s);
        return;
      }

      const fileName = String(s.file_name || s.title || s.url || "");
      const ext = extOf(fileName);
      const isMedia =
        s.kind === "media" ||
        (s.asset_type && s.asset_type !== null) ||
        isMediaExt(ext);

      if (isMedia) media.push(s);
      else docs.push(s);
    });

    return { articles, docs, media };
  }

  function renderSourcesADM(container, adm, bypassRoleFilter) {
    const rawArticles = Array.isArray(adm.articles) ? adm.articles : [];
    const rawDocs = Array.isArray(adm.docs) ? adm.docs : [];
    const rawMedia = Array.isArray(adm.media) ? adm.media : [];

    const articles = bypassRoleFilter ? rawArticles : filterSourcesByRole(rawArticles, config.role);
    const docs = bypassRoleFilter ? rawDocs : filterSourcesByRole(rawDocs, config.role);
    const media = bypassRoleFilter ? rawMedia : filterSourcesByRole(rawMedia, config.role);

    if (!articles.length && !docs.length && !media.length) return;

    const wrap = el("div", { class: "blynk-sources" });
    wrap.appendChild(el("div", { class: "blynk-sourcesTitle", text: "SOURCES" }));

    function addGroup(titleText, list) {
      if (!list.length) return;

      wrap.appendChild(el("div", { class: "blynk-sourcesGroupTitle", text: titleText }));

      const seen = new Set();
      const uniq = [];

      list.forEach((s) => {
        const href = safeLink(s && s.url);
        const key = href || `${s.type || ""}|${s.title || ""}|${s.file_name || ""}`;
        if (seen.has(key)) return;
        seen.add(key);
        uniq.push(s);
      });

      uniq.slice(0, 7).forEach((s) => {
        const href = safeLink(s.url);
        if (!href) return;

        const fileName = String(s.file_name || s.title || s.url || "");
        const ext = extOf(fileName);

        const mediaWrap = el("div", {
          style: "display:flex;flex-direction:column;gap:6px;margin-bottom:6px;"
        });

        // IMAGE / GIF PREVIEW
        if (["png","jpg","jpeg","webp","gif"].includes(ext)) {
          const img = el("img", {
            src: href,
            style: "max-width:100%;max-height:180px;border-radius:12px;"
          });
          mediaWrap.appendChild(img);
        }

        // VIDEO PREVIEW
        else if (["mp4","webm","mov","m4v"].includes(ext)) {
          const vid = el("video", {
            src: href,
            controls: "true",
            style: "max-width:100%;max-height:220px;border-radius:12px;"
          });
          mediaWrap.appendChild(vid);
        }

        // Always include clickable source link
        const link = el("a", {
          class: "blynk-source",
          href,
          target: "_blank",
          rel: "noopener noreferrer",
        });

        link.textContent = `${sourceIcon(s)} ${s.title || s.file_name || href}`;

        mediaWrap.appendChild(link);
        wrap.appendChild(mediaWrap);
      });
    }

    addGroup("ARTICLES", articles);
    addGroup("DOCS", docs);
    addGroup("MEDIA", media);

    container.appendChild(wrap);
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
      title: config.title,
      theme_primary: "",
      theme_accent: "",
      theme_launcher: "",
    },
    _typingRow: null,

    async init() {
      injectStylesOnce();
      this.root = createRoot();

      try {
        const t = await fetchTenantSettings();
        if (t) {
          const icon =
            t.profile_icon ||
            (t.tenant && t.tenant.profile_icon) ||
            t.profileIcon ||
            DEFAULT_PROFILE_ICON;

          this.tenant.profile_icon = String(icon || "").trim() || DEFAULT_PROFILE_ICON;

          const theme = t.theme || (t.tenant && t.tenant.theme) || {};
          const primary = t.theme_primary || theme.primary || "";
          const accent = t.theme_accent || theme.accent || "";
          const launcher = t.theme_launcher || theme.launcher || "";

          if (primary) this.tenant.theme_primary = String(primary).trim();
          if (accent) this.tenant.theme_accent = String(accent).trim();
          if (launcher) this.tenant.theme_launcher = String(launcher).trim();

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
      const wrap = el("div", { class: "blynk-wrap" });

      setThemeVars(wrap, {
        primary: this.tenant.theme_primary || (config.accentMint || ""),
        accent: this.tenant.theme_accent || (config.accentCoral || ""),
        launcher: this.tenant.theme_launcher || (config.accentMint || ""),
      });

      const panel = el("div", {
        class: "blynk-panel",
        role: "dialog",
        "aria-label": "Support chat",
      });

      const widget = el("div", {
        class: "blynk-widget",
        role: "application",
        "aria-label": "Ask Blynky chat widget",
      });

      setThemeVars(widget, {
        primary: this.tenant.theme_primary || "",
        accent: this.tenant.theme_accent || "",
        launcher: this.tenant.theme_launcher || "",
      });

      const head = el("div", { class: "blynk-head" });
      const headerRow = el("div", { class: "blynk-header" });

      const brand = el("div", { class: "blynk-brand" });
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

      const stage = el("div", { class: "blynk-stage" });
      stage.appendChild(this._msgRow({ role: "ai", text: "Hi! How can I help today?", meta: "Blynky • just now" }));

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

      const composer = el("div", { class: "blynk-composer" });
      const inputWrap = el("div", { class: "blynk-inputWrap" });
      const input = el("input", {
        class: "blynk-input",
        type: "text",
        placeholder: "Ask a question...",
        autocomplete: "off",
      });
      inputWrap.appendChild(input);

      const sendBtn = el("button", { class: "blynk-send", type: "button", text: "Send" });
      sendBtn.addEventListener("click", () => this.handleSend());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleSend();
        }
      });

      composer.appendChild(inputWrap);
      composer.appendChild(sendBtn);

      widget.appendChild(head);
      widget.appendChild(stage);
      widget.appendChild(composer);

      panel.appendChild(widget);

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

      this.ui = { wrap, panel, widget, stage, input, sendBtn, launcher };
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

    _msgRow({ role, text, meta, sourcesData }) {
      const row = el("div", { class: `blynk-row ${role}` });

      const av = el("div", { class: `blynk-avatar ${role}`, "aria-hidden": "true" });
      if (role === "ai") {
        av.appendChild(el("img", { alt: "", src: this.tenant.profile_icon || DEFAULT_PROFILE_ICON }));
      }

      const wrap = el("div");
      const bubble = el("div", { class: `blynk-bubble ${role} blynk-enter` });

      // ✅ Debug-only intent pill (only for AI messages)
      if (role === "ai" && config.debug && sourcesData && sourcesData.intent) {
        const label = prettyIntent(sourcesData.intent);
        if (label) {
          bubble.appendChild(el("div", { class: "blynk-intent", text: label }));
        }
      }

      // ✅ AI formatting (user stays plain text)
      const textNode = document.createElement("div");
      if (role === "ai") {
        textNode.className = "blynk-msg";
        textNode.innerHTML = formatAiTextToHtml(text);
      } else {
        textNode.textContent = text;
      }
      bubble.appendChild(textNode);

      if (sourcesData && sourcesData.adm) {
        renderSourcesADM(bubble, sourcesData.adm, sourcesData.bypassRoleFilter);
      }

      const m = el("div", { class: `blynk-meta ${role}`, text: meta });

      // ✅ Debug-only meta suffix
      if (role === "ai" && config.debug && sourcesData && sourcesData.intent) {
        const label = String(sourcesData.intent || "").trim();
        if (label) m.textContent = `${meta} • intent: ${label}`;
      }

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

    appendMessage(role, text, sourcesData) {
      const meta = role === "user" ? "You • now" : "Blynky • now";
      this.ui.stage.insertBefore(
        this._msgRow({ role, text, meta, sourcesData }),
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

        const headers = { "Content-Type": "application/json" };

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

        // Normalize to Articles / Docs / Media
        const adm = normalizeSourcesToADM(data);

        // ✅ pull intent from backend response
        const intent = data && data.intent ? String(data.intent) : "";

        if (config.debug) {
          log("Ask response intent:", intent || "(none)", data);
        }

        this.setTyping(false);

        const answer = String((data && data.answer) || "No answer returned.").trim();
        this.appendMessage("ai", answer, { adm, bypassRoleFilter, intent });
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
