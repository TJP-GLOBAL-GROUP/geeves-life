/**
 * Geeves Invoice Capture - Bridge Content Script
 * Injected on geeves.life and *.manus.space pages.
 * Enables the web app to detect the extension is installed.
 */

(function () {
  "use strict";

  // Signal to the web app that the extension is installed via DOM attribute
  // (Content scripts run in an isolated world, so window variables are NOT shared with the page)
  document.documentElement.setAttribute("data-geeves-extension", "true");

  // Inject a script tag into the page to set the window variable in the PAGE's world
  const script = document.createElement("script");
  script.textContent = `window.__GEEVES_EXTENSION_INSTALLED = true;`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  // Listen for capture requests from the web app
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (event.data?.type === "GEEVES_CAPTURE_REQUEST") {
      const { orderId, walmartUrl } = event.data.payload || {};
      if (orderId && walmartUrl) {
        // Open the Walmart order page in a new tab and trigger capture
        chrome.runtime.sendMessage({
          type: "OPEN_AND_CAPTURE",
          payload: { orderId, walmartUrl },
        });
      }
    }
  });

  // Respond to extension check polling from the page world
  const checkInterval = setInterval(() => {
    // Re-inject the window variable periodically in case the page loaded after us
    const reinject = document.createElement("script");
    reinject.textContent = `window.__GEEVES_EXTENSION_INSTALLED = true;`;
    (document.head || document.documentElement).appendChild(reinject);
    reinject.remove();
  }, 200);

  // Clean up after 3 seconds
  setTimeout(() => clearInterval(checkInterval), 3000);

  console.log("[Geeves] Bridge content script loaded - extension detected");
})();
