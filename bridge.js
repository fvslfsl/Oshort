/* OShort MAIN-world bridge.
 * Content scripts run in an isolated world and can't see OPERA's ADF page
 * objects. This script runs in the PAGE world (manifest "world":"MAIN") and
 * publishes ADF's busy/loading state to a DOM attribute on <html> that the
 * isolated content script can read: data-oshort-ready = "1" (idle) / "0" (busy).
 */
(function () {
  "use strict";

  function isReady() {
    try {
      var P = window.AdfPage && window.AdfPage.PAGE;
      if (!P) return true; // not an ADF page (or not initialised) -> don't block
      if (P._serverBusy === true) return false;
      try { if (typeof P.isPageFullyLoaded === "function" && !P.isPageFullyLoaded()) return false; } catch (e) {}
      try { if (typeof P._isUIBlocked === "function" && P._isUIBlocked()) return false; } catch (e) {}
      try { if (P._busyCounts && Object.keys(P._busyCounts).length > 0) return false; } catch (e) {}
      return true;
    } catch (e) {
      return true;
    }
  }

  function tick() {
    try {
      document.documentElement.setAttribute("data-oshort-ready", isReady() ? "1" : "0");
    } catch (e) {}
  }

  setInterval(tick, 100);
  tick();
})();
