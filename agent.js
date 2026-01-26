/* =====================================================
   B-lynk Agent Widget — Phase 1
   Vanilla JS | Auto-boot | No build step
===================================================== */

(function () {
  // Prevent double-mounting
  if (window.BLYNK_AGENT) {
    console.warn("[Blynk Agent] Already initialized.");
    return;
  }

  /* -------------------------------------
     Locate this script tag
  ------------------------------------- */
  const scriptEl = document.currentScript || (function () {
    const scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  if (!scriptEl) {
    console.error("[Blynk Agent] Unable to locate script tag.");
    return;
  }

  /* -------------------------------------
     Parse config from data attributes
  ------------------------------------- */
  const config = {
    clientId: scriptEl.getAttribute("data-client-id") || "blynk-default",
    apiUrl: scriptEl.getAttribute("data-api-url"),
    mode: scriptEl.getAttribute("data-mode") || "blynk_kb",
    debug: scriptEl.hasAttribute("data-debug"),
  };

  if (!config.apiUrl) {
    console.error("[Blynk Agent] Missing required data-api-url.");
    return;
  }

  /* -------------------------------------
     Create root container
  ------------------------------------- */
  const ROOT_ID = "blynk-agent-root";

  function createRoot() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-client-id", config.clientId);

    // Minimal, non-opinionated base styles
    root.style.position = "fixed";
    root.style.bottom = "24px";
    root.style.right = "24px";
    root.style.zIndex = "999999";
    root.style.fontFamily = "system-ui, sans-serif";

    document.body.appendChild(root);
  }

  /* -------------------------------------
     Public API (future-proofed)
  ------------------------------------- */
  const Agent = {
    config,
    root: null,

    init() {
      createRoot();
      this.root = document.getElementById(ROOT_ID);

      if (config.debug) {
        console.log("[Blynk Agent] Initialized", {
          config: this.config,
          root: this.root,
        });
      }

      // UI + chat logic will mount here next
    },
  };

  /* -------------------------------------
     Boot
  ------------------------------------- */
  window.BLYNK_AGENT = Agent;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Agent.init());
  } else {
    Agent.init();
  }
})();
