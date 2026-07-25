/**
 * Geeves Invoice Capture - Walmart Content Script
 * Injected on walmart.com/orders/* pages.
 * 
 * INTENDED FLOW:
 * 1. User navigates to a Walmart order detail page (walmart.com/orders/XXXXX)
 * 2. This script detects the page and injects a "📸 Capture for Geeves" button
 *    near the "Print invoice" link area.
 * 3. When clicked, the button:
 *    a. Opens the print invoice view in a hidden iframe
 *    b. Captures the invoice content as an image (using html2canvas approach)
 *    c. Sends the captured data to the background script
 *    d. Background script uploads to Geeves S3 and triggers LLM extraction
 * 4. Button shows success/failure state
 */

(function () {
  "use strict";

  // Avoid double-injection
  if (window.__GEEVES_WALMART_INJECTED) return;
  window.__GEEVES_WALMART_INJECTED = true;

  console.log("[Geeves] Walmart content script loaded on:", window.location.href);

  const GEEVES_BRAND_COLOR = "#2AAFA9";
  const GEEVES_BRAND_HOVER = "#239E99";

  /**
   * Extract the order ID from the current URL
   * Walmart URLs: /orders/200013827821993
   */
  function getOrderIdFromUrl() {
    const match = window.location.pathname.match(/\/orders\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Check if we're on an order detail page (not the orders list)
   */
  function isOrderDetailPage() {
    return /\/orders\/\d+/.test(window.location.pathname);
  }

  /**
   * Create the Geeves capture button element
   */
  function createCaptureButton(orderId) {
    const container = document.createElement("div");
    container.id = "geeves-capture-container";
    container.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const btn = document.createElement("button");
    btn.id = "geeves-capture-btn";
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <span>Capture Invoice for Geeves</span>
    `;
    btn.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      color: white;
      background: ${GEEVES_BRAND_COLOR};
      border: none;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(42, 175, 169, 0.35), 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.2s ease;
      white-space: nowrap;
    `;
    btn.onmouseenter = () => {
      btn.style.background = GEEVES_BRAND_HOVER;
      btn.style.transform = "translateY(-1px)";
      btn.style.boxShadow = "0 6px 16px rgba(42, 175, 169, 0.45), 0 3px 6px rgba(0,0,0,0.12)";
    };
    btn.onmouseleave = () => {
      btn.style.background = GEEVES_BRAND_COLOR;
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 4px 12px rgba(42, 175, 169, 0.35), 0 2px 4px rgba(0,0,0,0.1)";
    };

    btn.addEventListener("click", () => captureInvoice(orderId, btn));
    container.appendChild(btn);

    // Also inject an inline button near "Print invoice" if found
    injectInlineButton(orderId);

    return container;
  }

  /**
   * Find the "Print invoice" link/button on the page and inject a capture button next to it
   */
  function injectInlineButton(orderId) {
    // Walmart uses various patterns for the "Print invoice" link
    // Look for text content matching "Print invoice" or "print invoice"
    const allLinks = document.querySelectorAll("a, button, span, div");
    let printInvoiceEl = null;

    for (const el of allLinks) {
      const text = el.textContent?.trim().toLowerCase();
      if (text === "print invoice" || text === "print receipt") {
        // Make sure it's a leaf-level element (not a parent container)
        if (el.children.length <= 2) {
          printInvoiceEl = el;
          break;
        }
      }
    }

    if (!printInvoiceEl) {
      console.log("[Geeves] 'Print invoice' element not found, using floating button only");
      return;
    }

    // Don't inject twice
    if (printInvoiceEl.parentElement?.querySelector("#geeves-inline-capture")) return;

    console.log("[Geeves] Found 'Print invoice' element, injecting inline capture button");

    const inlineBtn = document.createElement("button");
    inlineBtn.id = "geeves-inline-capture";
    inlineBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      Capture for Geeves
    `;
    inlineBtn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: 12px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      color: ${GEEVES_BRAND_COLOR};
      background: rgba(42, 175, 169, 0.08);
      border: 1.5px solid ${GEEVES_BRAND_COLOR};
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      vertical-align: middle;
    `;
    inlineBtn.onmouseenter = () => {
      inlineBtn.style.background = GEEVES_BRAND_COLOR;
      inlineBtn.style.color = "white";
    };
    inlineBtn.onmouseleave = () => {
      inlineBtn.style.background = "rgba(42, 175, 169, 0.08)";
      inlineBtn.style.color = GEEVES_BRAND_COLOR;
    };

    inlineBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      captureInvoice(orderId, inlineBtn);
    });

    // Insert after the print invoice element
    printInvoiceEl.parentElement?.insertBefore(inlineBtn, printInvoiceEl.nextSibling);
  }

  /**
   * Main capture flow:
   * 1. Click "Print invoice" to open the print view
   * 2. Wait for the print dialog/view to render
   * 3. Capture the visible content as an image
   * 4. Send to background script for upload
   */
  async function captureInvoice(orderId, buttonEl) {
    const originalHTML = buttonEl.innerHTML;
    const originalStyle = buttonEl.style.cssText;

    // Update button state
    buttonEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="geeves-spinner">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      <span>Capturing...</span>
    `;
    buttonEl.disabled = true;
    buttonEl.style.opacity = "0.7";

    // Add spinner animation
    const style = document.createElement("style");
    style.id = "geeves-spinner-style";
    style.textContent = `
      @keyframes geeves-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .geeves-spinner { animation: geeves-spin 1s linear infinite; }
    `;
    if (!document.getElementById("geeves-spinner-style")) {
      document.head.appendChild(style);
    }

    try {
      // Strategy: Use the browser's tab capture API via background script
      // The content script sends a message to the background to capture the current tab
      // after we programmatically trigger the print invoice view
      
      // First, try to capture the current page content directly
      // We'll use the visible order details + payment info as the "invoice"
      const invoiceData = extractOrderDataFromPage(orderId);
      
      // Send capture request to background script
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "CAPTURE_INVOICE",
            payload: {
              orderId,
              captureMethod: "page_data",
              orderData: invoiceData,
              pageUrl: window.location.href,
              filename: `walmart-invoice-${orderId}.json`,
            },
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(resp);
            }
          }
        );
      });

      if (response?.success) {
        // Success state
        buttonEl.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Captured!</span>
        `;
        buttonEl.style.opacity = "1";
        if (buttonEl.id === "geeves-capture-btn") {
          buttonEl.style.background = "#16a34a";
          buttonEl.style.boxShadow = "0 4px 12px rgba(22, 163, 74, 0.35)";
        } else {
          buttonEl.style.background = "#f0fdf4";
          buttonEl.style.color = "#16a34a";
          buttonEl.style.borderColor = "#86efac";
        }

        // Reset after 5 seconds
        setTimeout(() => {
          buttonEl.innerHTML = originalHTML;
          buttonEl.style.cssText = originalStyle;
          buttonEl.disabled = false;
        }, 5000);
      } else {
        throw new Error(response?.error || "Capture failed");
      }
    } catch (err) {
      console.error("[Geeves] Capture failed:", err);
      buttonEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Failed — Click to retry</span>
      `;
      buttonEl.style.opacity = "1";
      if (buttonEl.id === "geeves-capture-btn") {
        buttonEl.style.background = "#dc2626";
        buttonEl.style.boxShadow = "0 4px 12px rgba(220, 38, 38, 0.35)";
      } else {
        buttonEl.style.background = "#fef2f2";
        buttonEl.style.color = "#dc2626";
        buttonEl.style.borderColor = "#fca5a5";
      }
      buttonEl.disabled = false;

      // Allow retry on click
      buttonEl.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        buttonEl.onclick = null;
        captureInvoice(orderId, buttonEl);
      };
    }
  }

  /**
   * Extract structured order data from the visible page content.
   * This captures the order details, items, totals, and payment info
   * that are visible on the Walmart order detail page.
   */
  function extractOrderDataFromPage(orderId) {
    const data = {
      orderId,
      url: window.location.href,
      capturedAt: new Date().toISOString(),
      pageTitle: document.title,
      items: [],
      totals: {},
      payment: {},
      delivery: {},
    };

    // Extract order items from the page
    // Walmart shows items in expandable sections
    try {
      // Look for item names and prices in the page
      const itemElements = document.querySelectorAll('[data-testid*="item"], [class*="item-info"], [class*="product"]');
      itemElements.forEach(el => {
        const name = el.querySelector('[class*="name"], [class*="title"], [data-testid*="name"]')?.textContent?.trim();
        const price = el.querySelector('[class*="price"], [data-testid*="price"]')?.textContent?.trim();
        const qty = el.querySelector('[class*="qty"], [class*="quantity"]')?.textContent?.trim();
        if (name) {
          data.items.push({ name, price: price || null, quantity: qty || "1" });
        }
      });

      // Extract totals section
      const totalElements = document.querySelectorAll('[class*="charge-summary"] [class*="row"], [class*="order-total"], [data-testid*="total"]');
      totalElements.forEach(el => {
        const label = el.querySelector('[class*="label"], span:first-child')?.textContent?.trim();
        const value = el.querySelector('[class*="value"], span:last-child')?.textContent?.trim();
        if (label && value) {
          data.totals[label] = value;
        }
      });

      // Extract payment method
      const paymentEl = document.querySelector('[class*="payment-method"], [data-testid*="payment"]');
      if (paymentEl) {
        data.payment.text = paymentEl.textContent?.trim();
        // Try to find last 4 digits
        const last4Match = paymentEl.textContent?.match(/(\d{4})\s*$/);
        if (last4Match) data.payment.last4 = last4Match[1];
      }

      // Also capture the full page text as fallback for LLM extraction
      const mainContent = document.querySelector('main, [role="main"], #maincontent, .order-details');
      if (mainContent) {
        data.fullText = mainContent.innerText?.substring(0, 10000); // Cap at 10k chars
      } else {
        data.fullText = document.body.innerText?.substring(0, 10000);
      }
    } catch (err) {
      console.warn("[Geeves] Error extracting page data:", err);
      // Fallback: just capture the full page text
      data.fullText = document.body.innerText?.substring(0, 10000);
    }

    return data;
  }

  /**
   * Main initialization
   */
  function init() {
    if (!isOrderDetailPage()) {
      console.log("[Geeves] Not an order detail page, skipping injection");
      return;
    }

    const orderId = getOrderIdFromUrl();
    if (!orderId) {
      console.log("[Geeves] Could not extract order ID from URL");
      return;
    }

    // Don't inject if already present
    if (document.getElementById("geeves-capture-container")) return;

    console.log("[Geeves] Order detail page detected. Order ID:", orderId);

    // Inject the floating capture button
    const captureContainer = createCaptureButton(orderId);
    document.body.appendChild(captureContainer);

    // Check if there's a pending auto-capture from Geeves
    checkPendingCapture(orderId);
  }

  /**
   * Check if there's a pending auto-capture request from Geeves
   * (triggered when user clicks "Capture Invoice" from the Geeves web app)
   */
  function checkPendingCapture(orderId) {
    chrome.storage.local.get(["pendingCapture"], (result) => {
      const pending = result.pendingCapture;
      if (!pending) return;

      // Check if this is a recent request (within 60 seconds) and matches our URL
      const isRecent = (Date.now() - pending.timestamp) < 60000;
      const urlMatches = window.location.href.includes(pending.orderId) || pending.orderId === orderId;

      if (isRecent && urlMatches) {
        console.log("[Geeves] Auto-capture triggered from Geeves web app");
        // Clear the pending request
        chrome.storage.local.remove("pendingCapture");
        // Wait for page to fully load, then auto-capture
        setTimeout(() => {
          const btn = document.getElementById("geeves-capture-btn");
          if (btn) {
            btn.click();
          } else {
            // Button not injected yet, try capture directly
            captureInvoice(orderId, document.createElement("button"));
          }
        }, 2000);
      }
    });
  }

  // Run on page load
  // Walmart uses SPA navigation, so we need to watch for URL changes
  init();

  // Watch for SPA navigation (URL changes without full page reload)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log("[Geeves] URL changed to:", lastUrl);
      // Remove old button if present
      const existing = document.getElementById("geeves-capture-container");
      if (existing) existing.remove();
      const existingInline = document.getElementById("geeves-inline-capture");
      if (existingInline) existingInline.remove();
      // Re-initialize after a short delay for page content to load
      setTimeout(init, 1500);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Also retry injection after a delay (for slow-loading pages)
  setTimeout(init, 2000);
  setTimeout(init, 5000);
})();
