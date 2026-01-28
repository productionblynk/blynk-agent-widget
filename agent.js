/* =====================================================
   B-lynk Agent Widget — Phase 1
   Vanilla JS | Auto-boot | UI Renderer
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
    role: scriptEl.getAttribute("data-role") || "user", // <-- role hint (UX only)
  };

  if (!config.apiUrl) {
    console.error("[Blynk Agent] Missing required data-api-url.");
    return;
  }

  const ROOT_ID = "blynk-agent-root";
  const STYLE_ID = "blynk-agent-style";

  function log(...args) {
    if (config.debug) console.log("[Blynk Agent]", ...args);
  }

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} { all: initial; }
      #${ROOT_ID} * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .blynk-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
      .blynk-launcher { width: 56px; height: 56px; border-radius: 999px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 30px rgba(0,0,0,0.18); background: #111; color: #fff; }
      .blynk-panel { width: 360px; max-width: calc(100vw - 32px); height: 520px; background: #fff; border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.20); overflow: hidden; display: none; flex-direction: column; }
      .blynk-panel.open { display: flex; }
      .blynk-header { padding: 14px; border-bottom: 1px solid rgba(0,0,0,0.08); display: flex; justify-content: space-between; }
      .blynk-title { font-size: 14px; font-weight: 600; }
      .blynk-thread { flex: 1; padding: 14px; overflow: auto; background: #fafafa; }
      .blynk-row { display: flex; margin-bottom: 10px; }
      .blynk-row.user { justify-content: flex-end; }
      .blynk-bubble { max-width: 82%; border-radius: 16px; padding: 10px 12px; font-size: 13px; }
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

  const Agent = {
    init() {
      injectStylesOnce();
      const root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);

      const wrap = el("div", { class: "blynk-wrap" });
      const panel = el("div", { class: "blynk-panel open" });
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

        const res = await fetch(config.apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            clientId: config.clientId,
            mode: config.mode,
          }),
        });

        const data = await res.json();

        // ----------------------------
        // SOURCE VISIBILITY FILTER
        // ----------------------------
        const visibleSources = (data.sources || []).filter((s) => {
          const role = (s.audience_role || "user").toLowerCase();
          return config.role === "admin" || role === "user";
        });

        let answer = data.answer || "No answer returned.";

        if ((data.sources || []).length > 0 && visibleSources.length === 0) {
          answer = "This action requires administrator access. Please contact your admin.";
        }

        const bubble = el("div", { class: "blynk-bubble assistant", text: answer });

        if (visibleSources.length) {
          const src = el("div", { class: "blynk-sources" });
          visibleSources.forEach((s) => {
            const href = safeLink(s.url);
            if (!href) return;
            src.appendChild(el("a", { class: "blynk-source", href, target: "_blank", text: s.title }));
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
