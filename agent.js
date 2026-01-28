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
    role: (scriptEl.getAttribute("data-role") || "user").toLowerCase(), // "user" | "admin"
    adminToken: scriptEl.getAttribute("data-admin-token") || "", // optional
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
      .blynk-header { padding: 14px; border-bottom: 1px solid rgba(0,0,0,0.08); display: flex; justify-content: space-between; align-items: center; }
      .blynk-title { font-size: 14px; font-weight: 600; }
      .blynk-close { border: none; background: transparent; cursor: pointer; font-size: 18px; line-height: 1; padding: 6px 8px; border-radius: 10px; }
      .blynk-close:hover { background: rgba(0,0,0,0.05); }
      .blynk-thread { flex: 1; padding: 14px; overflow: auto; background: #fafafa; }
      .blynk-row { display: flex; margin-bottom: 10px; }
      .blynk-row.user { justify-content: flex-end; }
      .blynk-row.assistant { justify-content: flex-start; }
      .blynk-bubble { max-width: 82%; border-radius: 16px; padding: 10px 12px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word; }
      .blynk-bubble.user { background: #111; color: #fff; border-bottom-right-radius: 6px; }
      .blynk-bubble.assistant { background: #fff; color: #111; border: 1px solid rgba(0,0,0,0.08); border-bottom-left-radius: 6px; }
      .blynk-sources { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.06); display: flex; flex-direction: column; gap: 6px; }
      .blynk-source { font-size: 12px; color: #0b57d0; text-decoration: none; }
      .blynk-source:hover { text-decoration: underline; }
      .blynk-composer { padding: 12px; border-top: 1px solid rgba(0,0,0,0.08); display: flex; gap: 8px; }
      .blynk-input { flex: 1; padding: 10px; font-size: 13px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.18); resize: none; min-height: 38px; max-height: 120px; }
      .blynk-send { border: none; height: 38px; padding: 0 14px; border-radius: 12px; background: #111; color: #fff; font-weight: 600; cursor: pointer; }
      .blynk-send:disabled { opacity: 0.5; cursor: not-allowed; }
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

  function normalizeRole(r) {
    const x = String(r || "user").toLowerCase();
    return x === "admin" ? "admin" : "user";
  }

  function dedupeSources(sources) {
    const seen = new Set();
    const out = [];
    for (const s of sources || []) {
      const key = (s.slug || "") + "|" + (s.url || "") + "|" + (s.title || "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out;
  }

  function filterSourcesByRole(sources, viewerRole) {
    const vr = normalizeRole(viewerRole);
    const list = Array.isArray(sources) ? sources : [];
    const deduped = dedupeSources(list);

    if (vr === "admin") return deduped;

    // user: only show sources marked user
    return deduped.filter((s) => normalizeRole(s.audience_role) === "user");
  }

  const Agent = {
    root: null,
    ui: {},
    isOpen: false,
    thinkingEl: null,

    init() {
      injectStylesOnce();

      const root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
      this.root = root;

      const wrap = el("div", { class: "blynk-wrap" });

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

      const panel = el("div", { class: "blynk-panel", role: "dialog", "aria-label": "Support chat" });

      const closeBtn = el("button", { class: "blynk-close", type: "button", "aria-label": "Close" });
      closeBtn.textContent = "×";

      const header = el("div", { class: "blynk-header" }, [
        el("div", { class: "blynk-title", text: `B-lynk ${config.title}` }),
        closeBtn,
      ]);

      const thread = el("div", { class: "blynk-thread" });

      const input = el("textarea", { class: "blynk-input", placeholder: "Ask a question…", rows: "1" });
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      });

      const send = el("button", { class: "blynk-send", text: "Send" });

      const composer = el("div", { class: "blynk-composer" }, [input, send]);

      panel.appendChild(header);
      panel.appendChild(thread);
      panel.appendChild(composer);

      wrap.appendChild(panel);
      wrap.appendChild(launcher);
      root.appendChild(wrap);

      this.ui = { wrap, launcher, panel, header, thread, input, send, closeBtn };

      launcher.addEventListener("click", () => this.toggle());
      closeBtn.addEventListener("click", () => this.close());

      send.addEventListener("click", () => this.handleSend());
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      });

      // Welcome
      this.appendAssistant("Hi! How can I help today?");

      log("Initialized", { config });
    },

    open() {
      this.isOpen = true;
      this.ui.panel.classList.add("open");
      this.ui.input.focus();
      this.scroll();
    },

    close() {
      this.isOpen = false;
      this.ui.panel.classList.remove("open");
    },

    toggle() {
      this.isOpen ? this.close() : this.open();
    },

    scroll() {
      const t = this.ui.thread;
      t.scrollTop = t.scrollHeight;
    },

    appendUser(text) {
      const row = el("div", { class: "blynk-row user" }, [
        el("div", { class: "blynk-bubble user", text }),
      ]);
      this.ui.thread.appendChild(row);
      this.scroll();
    },

    appendAssistant(text, sources) {
      const bubble = el("div", { class: "blynk-bubble assistant" });
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
            text: s.title || href,
          });
          sourcesEl.appendChild(a);
        });
        bubble.appendChild(sourcesEl);
      }

      const row = el("div", { class: "blynk-row assistant" }, [bubble]);
      this.ui.thread.appendChild(row);
      this.scroll();
    },

    showThinking() {
      this.removeThinking();
      const row = el("div", { class: "blynk-row assistant" }, [
        el("div", { class: "blynk-bubble assistant", text: "Thinking…" }),
      ]);
      this.ui.thread.appendChild(row);
      this.thinkingEl = row;
      this.scroll();
    },

    removeThinking() {
      if (this.thinkingEl && this.thinkingEl.parentNode) {
        this.thinkingEl.parentNode.removeChild(this.thinkingEl);
      }
      this.thinkingEl = null;
    },

    setSending(on) {
      this.ui.send.disabled = on;
      this.ui.input.disabled = on;
    },

    async handleSend() {
      const q = (this.ui.input.value || "").trim();
      if (!q) return;

      this.appendUser(q);
      this.ui.input.value = "";
      this.ui.input.style.height = "auto";

      this.setSending(true);
      this.showThinking();

      try {
        const headers = { "Content-Type": "application/json" };

        // Optional admin header for real admin pages
        if (normalizeRole(config.role) === "admin" && config.adminToken) {
          headers["x-admin-token"] = config.adminToken;
        }

        const res = await fetch(config.apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            question: q,
            clientId: config.clientId,
            mode: config.mode,
            role: normalizeRole(config.role), // UX hint; server still enforces
          }),
        });

        const raw = await res.text();
        if (!res.ok) throw new Error(`Ask failed (${res.status}): ${raw}`);

        const data = raw ? JSON.parse(raw) : {};
        const allSources = Array.isArray(data.sources) ? data.sources : [];

        // ✅ FILTER SOURCES HERE (this is what stops admin links showing to users)
        const visibleSources = filterSourcesByRole(allSources, config.role);

        let answer = (data.answer || "No answer returned.").toString();

        // If server returned sources but user can't see any of them -> show admin access message
        if (allSources.length > 0 && visibleSources.length === 0) {
          answer = "This action requires administrator access. Please contact your admin.";
        }

        this.removeThinking();
        this.appendAssistant(answer, visibleSources);
      } catch (err) {
        this.removeThinking();
        this.appendAssistant("Sorry — something went wrong. Please try again.");
        log("Error", err);
      } finally {
        this.setSending(false);
        this.ui.input.focus();
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
