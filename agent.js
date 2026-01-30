/* =====================================================
   B-lynk Agent Widget — Phase 1
   Vanilla JS | Auto-boot | UI Renderer
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

  const config = {
    clientId: scriptEl.getAttribute("data-client-id") || "blynk-default",
    apiUrl: scriptEl.getAttribute("data-api-url"), // full supabase function URL
    mode: scriptEl.getAttribute("data-mode") || "blynk_kb",
    debug: scriptEl.hasAttribute("data-debug"),
    title: scriptEl.getAttribute("data-title") || "Support",

    // IMPORTANT: public anon key for calling the Edge Function (fixes 401)
    anonKey: scriptEl.getAttribute("data-anon-key") || "",

    // UX role hint (controls what links you show)
    role: (scriptEl.getAttribute("data-role") || "user").toLowerCase(),

    // Optional: only set this on admin pages for testing
    adminToken: scriptEl.getAttribute("data-admin-token") || "",
  };

  if (!config.apiUrl || !/^https?:\/\//i.test(config.apiUrl)) {
    console.error(
      "[Blynk Agent] Missing or invalid data-api-url. Must be a full URL like https://YOURPROJECT.supabase.co/functions/v1/ask"
    );
    return;
  }

  // If your function requires JWT verification, anonKey MUST be present.
  if (!config.anonKey) {
    console.warn(
      "[Blynk Agent] Missing data-anon-key. If your function requires Authorization, you will get 401 until you add it."
    );
  }

  const ROOT_ID = "blynk-agent-root";
  const STYLE_ID = "blynk-agent-style";

  function log(...args) {
    if (config.debug) console.log("[Blynk Agent]", ...args);
  }
   function sourceIcon(source) {
     if (source.type === "article") return "📘";
   
     const name = (source.file_name || "").toLowerCase();
   
     if (name.endsWith(".pdf")) return "📄";
     if (name.endsWith(".gif")) return "🎞️";
     if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "🖼️";
     if (name.endsWith(".doc") || name.endsWith(".docx")) return "📝";
     if (name.endsWith(".xls") || name.endsWith(".xlsx")) return "📊";
   
     return "📎"; // fallback for unknown files
   }

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} { all: initial; }
      #${ROOT_ID} * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }

      .blynk-wrap {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: flex-end;
      }

      .blynk-launcher {
        width: 56px; height: 56px; border-radius: 999px; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 12px 30px rgba(0,0,0,0.18);
        background: #111; color: #fff;
      }

      .blynk-panel {
        width: 360px; max-width: calc(100vw - 32px);
        height: 520px; max-height: calc(100vh - 120px);
        background: #fff; color: #111;
        border-radius: 18px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.20);
        overflow: hidden;
        display: none;
        flex-direction: column;
      }
      .blynk-panel.open { display: flex; }

      .blynk-header {
        padding: 14px 14px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
        display: flex; align-items: center; justify-content: space-between;
        background: #fff;
      }
      .blynk-title { font-size: 14px; font-weight: 600; }

      .blynk-close {
        border: none; background: transparent; cursor: pointer;
        font-size: 18px; line-height: 1; padding: 6px 8px; border-radius: 10px;
      }
      .blynk-close:hover { background: rgba(0,0,0,0.05); }

      .blynk-thread {
        flex: 1;
        padding: 14px;
        overflow: auto;
        background: #fafafa;
      }
      .blynk-row { display: flex; margin-bottom: 10px; }
      .blynk-row.user { justify-content: flex-end; }
      .blynk-row.assistant { justify-content: flex-start; }

      .blynk-bubble {
        max-width: 82%;
        border-radius: 16px;
        padding: 10px 12px;
        font-size: 13px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      .blynk-bubble.user {
        background: #111; color: #fff; border-bottom-right-radius: 6px;
      }
      .blynk-bubble.assistant {
        background: #fff; color: #111; border: 1px solid rgba(0,0,0,0.08);
        border-bottom-left-radius: 6px;
      }

      .blynk-sources {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(0,0,0,0.06);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .blynk-source {
        font-size: 12px;
        color: #0b57d0;
        text-decoration: none;
        display: inline-flex;
        gap: 6px;
        align-items: center;
      }
      .blynk-source:hover { text-decoration: underline; }

      .blynk-composer {
        padding: 12px;
        border-top: 1px solid rgba(0,0,0,0.08);
        background: #fff;
        display: flex;
        gap: 8px;
        align-items: flex-end;
      }
      .blynk-input {
        flex: 1;
        min-height: 38px;
        max-height: 120px;
        resize: none;
        padding: 10px 10px;
        font-size: 13px;
        line-height: 1.3;
        border-radius: 12px;
        border: 1px solid rgba(0,0,0,0.18);
        outline: none;
      }
      .blynk-send {
        border: none; cursor: pointer;
        height: 38px; padding: 0 14px;
        border-radius: 12px;
        background: #111; color: #fff;
        font-size: 13px; font-weight: 600;
      }
      .blynk-send:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  function createRoot() {
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.appendChild(root);
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

  // UI-only source filtering (used only when backend is enforcing RBAC)
  function filterSourcesByRole(sources, role) {
    if (!Array.isArray(sources)) return [];
    if (role === "admin") return sources;

    return sources.filter((s) => {
      const ar =
        (s && (s.audience_role || s.audienceRole || "user"))
          .toString()
          .toLowerCase()
          .trim();
      return ar === "user";
    });
  }

  const Agent = {
    config,
    root: null,
    isOpen: false,
    ui: {},
    _thinkingEl: null,

    init() {
      injectStylesOnce();
      createRoot();
      this.root = document.getElementById(ROOT_ID);
      this.mountUI();
      log("Initialized", { config: this.config });
    },

    mountUI() {
      const wrap = el("div", { class: "blynk-wrap" });

      const launcher = el("button", {
        class: "blynk-launcher",
        type: "button",
        title: "Open support chat",
      });
      launcher.addEventListener("click", () => this.toggle());
      launcher.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5.5C4 4.67 4.67 4 5.5 4h13C19.33 4 20 4.67 20 5.5v9c0 .83-.67 1.5-1.5 1.5H9l-4.2 3.15c-.5.38-1.2.02-1.2-.6V5.5Z"
                stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `;

      const panel = el("div", {
        class: "blynk-panel",
        role: "dialog",
        "aria-label": "Support chat",
      });

      const closeBtn = el("button", {
        class: "blynk-close",
        type: "button",
        "aria-label": "Close",
      });
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", () => this.close());

      const header = el("div", { class: "blynk-header" }, [
        el("div", { class: "blynk-title", text: this.config.title }),
        closeBtn,
      ]);

      const thread = el("div", { class: "blynk-thread" });

      const input = el("textarea", {
        class: "blynk-input",
        placeholder: "Ask a question…",
        rows: "1",
      });

      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
      });

      const sendBtn = el("button", {
        class: "blynk-send",
        type: "button",
        text: "Send",
      });
      sendBtn.addEventListener("click", () => this.handleSend());

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      });

      const composer = el("div", { class: "blynk-composer" }, [input, sendBtn]);

      panel.appendChild(header);
      panel.appendChild(thread);
      panel.appendChild(composer);

      wrap.appendChild(panel);
      wrap.appendChild(launcher);
      this.root.appendChild(wrap);

      this.ui = { wrap, launcher, panel, header, thread, input, sendBtn };

      this.appendAssistant("Hi! How can I help today?");
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

    appendUser(text) {
      const row = el("div", { class: "blynk-row user" });
      const bubble = el("div", { class: "blynk-bubble user", text });
      row.appendChild(bubble);
      this.ui.thread.appendChild(row);
      this.scrollToBottom();
    },

    appendAssistant(text, sources) {
      const row = el("div", { class: "blynk-row assistant" });
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
          });
          a.textContent = s.title || href;
          sourcesEl.appendChild(a);
        });
        bubble.appendChild(sourcesEl);
      }

      row.appendChild(bubble);
      this.ui.thread.appendChild(row);
      this.scrollToBottom();
    },

    showThinking() {
      this.removeThinking();
      const row = el("div", { class: "blynk-row assistant" });
      const bubble = el("div", {
        class: "blynk-bubble assistant",
        text: "Thinking…",
      });
      row.appendChild(bubble);
      this.ui.thread.appendChild(row);
      this._thinkingEl = row;
      this.scrollToBottom();
    },

    removeThinking() {
      if (this._thinkingEl && this._thinkingEl.parentNode) {
        this._thinkingEl.parentNode.removeChild(this._thinkingEl);
      }
      this._thinkingEl = null;
    },

    setSending(isSending) {
      this.ui.sendBtn.disabled = isSending;
      this.ui.input.disabled = isSending;
    },

    scrollToBottom() {
      const t = this.ui.thread;
      t.scrollTop = t.scrollHeight;
    },

    async handleSend() {
      const text = (this.ui.input.value || "").trim();
      if (!text) return;

      this.appendUser(text);
      this.ui.input.value = "";
      this.ui.input.style.height = "auto";

      this.setSending(true);
      this.showThinking();

      try {
        const payload = {
          question: text,
          clientId: this.config.clientId,
          mode: this.config.mode,
          role: this.config.role,
          debug: this.config.debug, // enables backend debug output
        };

        const headers = {
          "Content-Type": "application/json",
        };

        // Auth headers for Supabase Edge Functions when verify_jwt is enabled
        if (this.config.anonKey) {
          headers.apikey = this.config.anonKey;
          headers.Authorization = `Bearer ${this.config.anonKey}`;
        }

        // Optional admin role testing (backend still enforces)
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

        // If backend says role filtering is disabled, show everything (demo mode)
        const bypassRoleFilter = Boolean(data && (data.disableRoleFilter || data.disable_role_filter));

        const allSources = Array.isArray(data?.sources) ? data.sources : [];

        // If bypassing, do NOT hide admin sources for user demo.
        const visibleSources = bypassRoleFilter
          ? allSources
          : filterSourcesByRole(allSources, this.config.role);

        const answer = (data?.answer || "No answer returned.").toString();

        // CRITICAL: do NOT override the backend answer here.
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
