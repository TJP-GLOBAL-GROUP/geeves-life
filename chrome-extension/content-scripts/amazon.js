/**
 * Geeves Invoice Capture - Amazon Content Script
 * Injected on amazon.com order detail pages.
 * 
 * INTENDED FLOW:
 * 1. User navigates to an Amazon order detail page
 * 2. This script detects the page and injects a "Capture Invoice for Geeves" button
 * 3. When clicked, the button:
 *    a. Extracts order data from the page (order number, items, totals, payment)
 *    b. Sends the captured data to the background script
 *    c. Background script uploads to Geeves S3 and triggers LLM extraction
 * 4. Button shows success/failure state
 */
(function () {
  "use strict";

  // Avoid double-injection
  if (window.__GEEVES_AMAZON_INJECTED) return;
  window.__GEEVES_AMAZON_INJECTED = true;

  console.log("[Geeves] Amazon content script loaded on:", window.location.href);

  const GEEVES_BRAND_COLOR = "#2AAFA9";
  const GEEVES_BRAND_HOVER = "#239E99";

  /**
   * Extract the order ID from the current URL or page content
   * Amazon URLs: /gp/your-account/order-details?orderID=XXX or /your-orders/XXX
   */
  function getOrderIdFromPage() {
    // Try URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdParam = urlParams.get("orderID") || urlParams.get("orderId");
    if (orderIdParam) return orderIdParam;

    // Try from URL path
    const pathMatch = window.location.pathname.match(/\/your-orders\/([\w-]+)/);
    if (pathMatch) return pathMatch[1];

    // Try from page content
    const orderIdEl = document.querySelector('[data-test-id="order-id"], .order-id, #orderDetails .a-color-secondary');
    if (orderIdEl) {
      const match = orderIdEl.textContent.match(/(\d{3}-\d{7}-\d{7})/);
      if (match) return match[1];
    }

    // Try broader search
    const bodyText = document.body.innerText;
    const orderMatch = bodyText.match(/Order\s*#?\s*(\d{3}-\d{7}-\d{7})/i);
    if (orderMatch) return orderMatch[1];

    return null;
  }

  /**
   * Check if we're on an order detail page (not the orders list)
   */
  function isOrderDetailPage() {
    const url = window.location.href;
    return (
      url.includes("/gp/your-account/order-details") ||
      url.includes("/gp/css/summary/print.html") ||
      (url.includes("/your-orders/") && document.querySelector('[data-test-id="order-details"]'))
    );
  }

  /**
   * Create the floating Geeves capture button
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

    // Also inject an inline button near "Print invoice" or "Invoice" links
    injectInlineButton(orderId);

    return container;
  }

  /**
   * Find the "Invoice" or "Print" link on the page and inject a capture button next to it
   */
  function injectInlineButton(orderId) {
    const allLinks = document.querySelectorAll("a, button, span");
    let invoiceEl = null;
    for (const el of allLinks) {
      const text = el.textContent?.trim().toLowerCase();
      if (text === "invoice" || text === "print invoice" || text === "view invoice" || text === "view or print invoice") {
        if (el.children.length <= 3) {
          invoiceEl = el;
          break;
        }
      }
    }

    if (!invoiceEl) {
      console.log("[Geeves] Invoice link not found, using floating button only");
      return;
    }

    if (invoiceEl.parentElement?.querySelector("#geeves-inline-capture")) return;

    console.log("[Geeves] Found invoice element, injecting inline capture button");

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

    invoiceEl.parentElement?.insertBefore(inlineBtn, invoiceEl.nextSibling);
  }

  /**
   * Main capture flow
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
      // Extract order data from the page
      const invoiceData = extractOrderDataFromPage(orderId);

      // Send capture request to background script
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "CAPTURE_INVOICE",
            payload: {
              orderId,
              captureMethod: "page_data",
              orderData: { ...invoiceData, vendor: "amazon" },
              pageUrl: window.location.href,
              filename: `amazon-invoice-${orderId}.json`,
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
   * Extract order data from the Amazon page
   */
  function extractOrderDataFromPage(orderId) {
    const data = {
      orderId,
      vendor: "amazon",
      pageUrl: window.location.href,
      orderDate: null,
      items: [],
      totals: {},
      payment: {},
      deliveryStatus: null,
      fullText: null,
    };

    try {
      // Extract order date
      const dateEl = document.querySelector('.order-date-invoice-item, [data-test-id="order-date"], .a-color-secondary');
      if (dateEl) {
        const dateMatch = dateEl.textContent.match(/(?:Ordered on|Order placed)\s*(.+)/i);
        if (dateMatch) data.orderDate = dateMatch[1].trim();
      }

      // Extract items
      const itemElements = document.querySelectorAll('.a-fixed-left-grid, .shipment-item, [data-test-id="order-item"], .yohtmlc-item');
      itemElements.forEach(el => {
        const name = el.querySelector('.a-link-normal, .yohtmlc-product-title, [data-test-id="item-title"]')?.textContent?.trim();
        const price = el.querySelector('.a-color-price, .yohtmlc-item .a-text-right, [data-test-id="item-price"]')?.textContent?.trim();
        const qty = el.querySelector('.item-quantity, [data-test-id="item-quantity"]')?.textContent?.trim();
        if (name && name.length > 2) {
          data.items.push({ name: name.substring(0, 200), price: price || null, quantity: qty || "1" });
        }
      });

      // Extract totals/summary
      const summaryRows = document.querySelectorAll('.a-row .a-span-last, #od-subtotals .a-row, .order-summary-row');
      summaryRows.forEach(el => {
        const cols = el.querySelectorAll('.a-column, td, span');
        if (cols.length >= 2) {
          const label = cols[0]?.textContent?.trim();
          const value = cols[cols.length - 1]?.textContent?.trim();
          if (label && value && value.includes("$")) {
            data.totals[label] = value;
          }
        }
      });

      // Try the grand total
      const grandTotal = document.querySelector('.a-color-price.a-text-bold, #od-subtotals .a-text-bold, .grand-total-price');
      if (grandTotal) {
        data.totals["Grand Total"] = grandTotal.textContent.trim();
      }

      // Extract payment method
      const paymentEl = document.querySelector('.payment-info, [data-test-id="payment-method"], .pmts-instrument-box');
      if (paymentEl) {
        data.payment.text = paymentEl.textContent?.trim().substring(0, 200);
        const last4Match = paymentEl.textContent?.match(/ending in\s*(\d{4})/i);
        if (last4Match) data.payment.last4 = last4Match[1];
      }

      // Extract delivery status
      const statusEl = document.querySelector('.delivery-box__primary-text, [data-test-id="delivery-status"], .shipment-top-row');
      if (statusEl) {
        data.deliveryStatus = statusEl.textContent?.trim().substring(0, 100);
      }

      // Full page text as fallback for LLM extraction
      const mainContent = document.querySelector('#orderDetails, main, [role="main"], #content');
      if (mainContent) {
        data.fullText = mainContent.innerText?.substring(0, 10000);
      } else {
        data.fullText = document.body.innerText?.substring(0, 10000);
      }
    } catch (err) {
      console.warn("[Geeves] Error extracting Amazon page data:", err);
      data.fullText = document.body.innerText?.substring(0, 10000);
    }

    return data;
  }

  /**
   * Main initialization
   */
  function init() {
    if (!isOrderDetailPage()) {
      console.log("[Geeves] Not an Amazon order detail page, skipping injection");
      return;
    }

    const orderId = getOrderIdFromPage();
    if (!orderId) {
      console.log("[Geeves] Could not extract order ID from page");
      return;
    }

    // Don't inject if already present
    if (document.getElementById("geeves-capture-container")) return;

    console.log("[Geeves] Amazon order detail page detected. Order ID:", orderId);

    // Inject the floating capture button
    const captureContainer = createCaptureButton(orderId);
    document.body.appendChild(captureContainer);

    // Check if there's a pending auto-capture from Geeves
    checkPendingCapture(orderId);
  }

  /**
   * Check if there's a pending auto-capture request from Geeves
   */
  function checkPendingCapture(orderId) {
    chrome.storage.local.get(["pendingCapture"], (result) => {
      const pending = result.pendingCapture;
      if (!pending) return;

      const isRecent = (Date.now() - pending.timestamp) < 60000;
      const urlMatches = window.location.href.includes(pending.orderId) || pending.orderId === orderId;

      if (isRecent && urlMatches) {
        console.log("[Geeves] Auto-capture triggered from Geeves web app");
        chrome.storage.local.remove("pendingCapture");
        setTimeout(() => {
          const btn = document.getElementById("geeves-capture-btn");
          if (btn) {
            btn.click();
          } else {
            captureInvoice(orderId, document.createElement("button"));
          }
        }, 2000);
      }
    });
  }

  // Run on page load
  init();

  // Amazon uses SPA-like navigation, watch for URL changes
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log("[Geeves] URL changed to:", lastUrl);
      const existing = document.getElementById("geeves-capture-container");
      if (existing) existing.remove();
      const existingInline = document.getElementById("geeves-inline-capture");
      if (existingInline) existingInline.remove();
      setTimeout(init, 1500);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Retry injection for slow-loading pages
  setTimeout(init, 2000);
  setTimeout(init, 5000);
})();
