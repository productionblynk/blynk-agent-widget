/* =====================================================
   B-lynk Agent Widget — Phase 1
   Vanilla JS | Auto-boot | Role-aware UI
===================================================== */

(function () {
  if (window.BLYNK_AGENT) {
    console.warn("[Blynk Agent] Already initialized.");
    return;
  }

  const scriptEl = document.currentScript || (() => {
    const scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  if (!scriptEl) {
    console.error("[Blynk Agent] Unable to locate script tag.");
    return;
  }

  const config = {
    clientId: scriptEl.getAttribute("data-client-id") || "blynk-default",
    apiUrl: scriptEl.getAttribute("data-api-url"),
    mode: scriptEl.getAttribute("data-mode") || "blynk_kb",
    debug: scriptEl.hasAttribute("data-debug"),
    title: scriptEl.getAttribute("data-title") || "Support",
    role: scriptEl.getAttribute("data-role") || "user", // UX role only
  };

  if (!config.apiUrl) {
    console.error("[Blynk Agent] Missing required data-api-url.");
    return;
  }

  const ROOT_ID = "blynk-agent-root";
  const STYLE_ID = "blynk-agent-style";

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} { all: initial; }
      #${ROOT_ID} * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .blynk-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 999999; }
      .blynk-panel { width: 360px; height: 520px; background: #fff; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
      .blynk-thread { flex: 1; padding: 14px; overflow: auto; background: #fafafa; }
      .blynk-row { display: flex; margin-bottom: 10px; }
      .blynk-row.user { justify-content: flex-end; }
      .blynk-bubble { max-width: 82%; padding: 10px 12px; border-radius: 16px; font-size: 13px; }
      .blynk-bubble.user { background: #111; color: #fff; }
      .blynk-bubble.assistant { background: #fff; border: 1px solid rgba(0,0,0,0.08); }
      .blynk-sources { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.06); display: flex; flex-direction: column; gap: 6px; }
      .blynk-source { font-size: 12px; color: #0b57d0; text-decoration: none; }
      .blynk-composer { padding: 12px; border-top: 1px solid rgba(0,0,0,0.08); display: flex; gap: 8px; }
      .blynk-input { flex: 1; padding: 10px; font-size: 13px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.18); }
      .blynk-send { border: none; height: 38px; padding: 0 14px; border-radius: 12px; background: #111; color: #fff; }
    `;
    document.head.appendChild(style);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(c));
    return node;
  }

  function safeLink(url) {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return null;
    }
  }

  function filterSourcesByRole(sources, role) {
    if (!Array.isArray(sources)) return [];
    if (role === "admin") return sources;
    return sources.filter((s) => (s.audience_role || "user") === "user");
  }

  const Agent = {
    init() {
      injectStylesOnce();

      const root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);

      const wrap = el("div", { class: "blynk-wrap" });
      const panel = el("div", { class: "blynk-panel" });
      const thread = el("div", { class: "blynk-thread" });
      const input = el("textarea", { class: "blynk-input", placeholder: "Ask a question…" });
      const send = el("button", { class: "blynk-send", text: "Send" });

      send.onclick = async () => {
        const q = input.value.trim();
        if (!q) return;
        input.value = "";

        thread.appendChild(el("div", { class: "blynk-row user" }, [
          el("div", { class: "blynk-bubble user", text: q }),
        ]));

        let data;
        try {
          const res = await fetch(config.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: q,
              clientId: config.clientId,
              mode: config.mode,
              role: config.role,
            }),
          });
          data = await res.json();
        } catch {
          data = { answer: "Sorry — something went wrong.", sources: [] };
        }

        const allSources = Array.isArray(data.sources) ? data.sources : [];
        const visibleSources = filterSourcesByRole(allSources, config.role);

        let answer = data.answer || "No answer returned.";

        // 🚨 ADMIN-ONLY BLOCK
        if (allSources.length > 0 && visibleSources.length === 0) {
          answer = "This action requires administrator access. Please contact your admin.";
        }

        const bubble = el("div", { class: "blynk-bubble assistant", text: answer });

        if (visibleSources.length) {
          const src = el("div", { class: "blynk-sources" });
          visibleSources.forEach((s) => {
            const href = safeLink(s.url);
            if (!href) return;
            src.appendChild(el("a", {
              class: "blynk-source",
              href,
              target: "_blank",
              rel: "noopener noreferrer",
              text: s.title,
            }));
          });
          bubble.appendChild(src);
        }

        thread.appendChild(el("div", { class: "blynk-row assistant" }, [bubble]));
        thread.scrollTop = thread.scrollHeight;
      };

      panel.appendChild(thread);
      panel.appendChild(el("div", { class: "blynk-composer" }, [input, send]));
      wrap.appendChild(panel);
      root.appendChild(wrap);
    },
  };

  Agent.init();
})();
