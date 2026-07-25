/**
 * Geeves Invoice Capture - Background Service Worker
 * Handles message routing between content scripts and the Geeves API.
 * 
 * CAPTURE FLOW:
 * 1. Content script extracts order data from the vendor page (Walmart/Amazon)
 * 2. Content script sends CAPTURE_INVOICE message with order data
 * 3. Background script:
 *    a. Takes a screenshot of the current tab (the invoice/order page)
 *    b. Gets auth cookie from geeves.life using chrome.cookies API
 *    c. Creates an extraction record on Geeves
 *    d. Uploads the screenshot to S3 via Geeves API
 *    e. Triggers LLM extraction of line items
 *    f. Auto-links payment account
 * 4. Returns success/failure to content script
 */

const GEEVES_API_BASE = "https://geeves.life";

/**
 * Get the session cookie from geeves.life to authenticate API requests.
 * In MV3 service workers, credentials: "include" does NOT work reliably.
 * We must use chrome.cookies.getAll() and pass cookies as a header.
 */
async function getAuthCookie() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: "geeves.life" });
    if (!cookies || cookies.length === 0) {
      // Also try www.geeves.life
      const wwwCookies = await chrome.cookies.getAll({ domain: "www.geeves.life" });
      if (wwwCookies && wwwCookies.length > 0) {
        return wwwCookies.map(c => `${c.name}=${c.value}`).join("; ");
      }
      // Also try .geeves.life (domain cookies)
      const dotCookies = await chrome.cookies.getAll({ domain: ".geeves.life" });
      if (dotCookies && dotCookies.length > 0) {
        return dotCookies.map(c => `${c.name}=${c.value}`).join("; ");
      }
      return null;
    }
    return cookies.map(c => `${c.name}=${c.value}`).join("; ");
  } catch (err) {
    console.error("[Geeves BG] Failed to get cookies:", err);
    return null;
  }
}

/**
 * Make an authenticated fetch request to the Geeves API.
 * Uses cookies from chrome.cookies API for authentication.
 */
async function authenticatedFetch(url, options = {}) {
  const cookieStr = await getAuthCookie();
  if (!cookieStr) {
    throw new Error("Not authenticated — please log in to geeves.life first");
  }
  
  const headers = {
    ...(options.headers || {}),
    "Cookie": cookieStr,
  };
  
  return fetch(url, {
    ...options,
    headers,
    // Don't use credentials: "include" — we're manually passing cookies
  });
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CAPTURE_INVOICE") {
    handleInvoiceCapture(message.payload, sender.tab)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => {
        console.error("[Geeves BG] Capture failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === "GET_AUTH_STATUS") {
    getAuthStatus()
      .then((status) => sendResponse({ success: true, data: status }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_PENDING_ORDERS") {
    getPendingOrders()
      .then((orders) => sendResponse({ success: true, data: orders }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "OPEN_AND_CAPTURE") {
    // Triggered from Geeves web app via the bridge content script
    // Opens the vendor order page in a new tab so the content script can inject the capture button
    const { orderId, vendorUrl } = message.payload || {};
    if (vendorUrl) {
      chrome.tabs.create({ url: vendorUrl, active: true }, (tab) => {
        // Store the pending capture request so the content script knows to auto-capture
        chrome.storage.local.set({
          pendingCapture: { orderId, vendorUrl, tabId: tab.id, timestamp: Date.now() },
        });
        sendResponse({ success: true, message: "Tab opened for capture" });
      });
    } else {
      sendResponse({ success: false, error: "No vendor URL provided" });
    }
    return true;
  }
});

/**
 * Check if user is authenticated with Geeves
 */
async function getAuthStatus() {
  try {
    const response = await authenticatedFetch(`${GEEVES_API_BASE}/api/trpc/auth.me`);
    const data = await response.json();
    if (data.result?.data) {
      return { authenticated: true, user: data.result.data };
    }
    // Try parsing the JSON response format
    if (data.result?.data?.json) {
      return { authenticated: true, user: data.result.data.json };
    }
    return { authenticated: false };
  } catch (err) {
    console.error("[Geeves BG] Auth check failed:", err.message);
    return { authenticated: false, error: err.message };
  }
}

/**
 * Get pending vendor orders that need invoice capture
 */
async function getPendingOrders() {
  try {
    const response = await authenticatedFetch(
      `${GEEVES_API_BASE}/api/trpc/expenseCategorisation.getOrders?input=${encodeURIComponent(JSON.stringify({ json: { status: "pending", page: 1, pageSize: 50 } }))}`
    );
    const data = await response.json();
    return data.result?.data?.json?.orders || data.result?.data?.orders || [];
  } catch (err) {
    console.error("[Geeves BG] Failed to get pending orders:", err);
    return [];
  }
}

/**
 * Main invoice capture handler
 * Takes a screenshot of the tab and uploads it to Geeves
 */
async function handleInvoiceCapture(payload, tab) {
  const { orderId, orderData, pageUrl, filename } = payload;

  console.log("[Geeves BG] Starting capture for order:", orderId);

  // Step 1: Capture a screenshot of the current tab
  let screenshotDataUrl = null;
  try {
    if (tab?.id) {
      screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
        quality: 100,
      });
      console.log("[Geeves BG] Screenshot captured successfully");
    }
  } catch (err) {
    console.warn("[Geeves BG] Tab screenshot failed (may need activeTab):", err.message);
    // Continue without screenshot — we still have the extracted page data
  }

  // Step 2: Create extraction record on Geeves
  const createPayload = {
    json: {
      orderId: orderId,
      orderType: orderData?.vendor === "amazon" ? "amazon_order" : "walmart_order",
      filename: filename || `vendor-invoice-${orderId}.png`,
    },
  };

  const createRes = await authenticatedFetch(`${GEEVES_API_BASE}/api/trpc/invoiceExtraction.createExtraction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create extraction: ${createRes.status} - ${errText}`);
  }

  const createData = await createRes.json();
  const extractionId = createData.result?.data?.json?.extractionId || createData.result?.data?.extractionId;
  if (!extractionId) {
    throw new Error("Failed to create extraction record — no extractionId returned");
  }

  console.log("[Geeves BG] Extraction record created:", extractionId);

  // Step 3: Upload the screenshot (or page data as JSON if screenshot failed)
  let uploadPayload;
  if (screenshotDataUrl) {
    // Upload the screenshot PNG
    const base64Data = screenshotDataUrl.split(",")[1];
    uploadPayload = {
      json: {
        extractionId,
        fileBase64: base64Data,
        filename: `vendor-invoice-${orderId}.png`,
        mimeType: "image/png",
      },
    };
  } else {
    // Fallback: upload the extracted page data as JSON
    const jsonData = JSON.stringify(orderData, null, 2);
    const base64Data = btoa(unescape(encodeURIComponent(jsonData)));
    uploadPayload = {
      json: {
        extractionId,
        fileBase64: base64Data,
        filename: `vendor-invoice-${orderId}.json`,
        mimeType: "application/json",
      },
    };
  }

  const uploadRes = await authenticatedFetch(`${GEEVES_API_BASE}/api/trpc/invoiceExtraction.uploadInvoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(uploadPayload),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Failed to upload invoice: ${uploadRes.status} - ${errText}`);
  }

  const uploadData = await uploadRes.json();
  const s3Url = uploadData.result?.data?.json?.s3Url || uploadData.result?.data?.s3Url;
  console.log("[Geeves BG] Invoice uploaded to S3:", s3Url);

  // Step 4: Trigger LLM extraction
  try {
    const extractPayload = {
      json: { extractionId },
    };
    
    const extractRes = await authenticatedFetch(`${GEEVES_API_BASE}/api/trpc/invoiceExtraction.extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extractPayload),
    });

    if (extractRes.ok) {
      console.log("[Geeves BG] LLM extraction triggered");
    } else {
      console.warn("[Geeves BG] LLM extraction failed (non-critical)");
    }
  } catch (err) {
    console.warn("[Geeves BG] LLM extraction error (non-critical):", err.message);
  }

  // Step 5: Auto-link payment account
  try {
    const linkPayload = { json: { extractionId } };
    await authenticatedFetch(`${GEEVES_API_BASE}/api/trpc/invoiceExtraction.autoLinkPayment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(linkPayload),
    });
    console.log("[Geeves BG] Payment auto-link attempted");
  } catch {
    // Non-critical
  }

  // Step 6: Update captured count in storage
  const today = new Date().toISOString().split("T")[0];
  const storage = await chrome.storage.local.get(["capturedToday", "capturedDate"]);
  const count = storage.capturedDate === today ? (storage.capturedToday || 0) + 1 : 1;
  await chrome.storage.local.set({ capturedToday: count, capturedDate: today });

  // Notify popup of completion
  try {
    chrome.runtime.sendMessage({
      type: "CAPTURE_COMPLETE",
      payload: { orderId, extractionId, success: true },
    });
  } catch {
    // Popup may not be open
  }

  console.log("[Geeves BG] Capture complete for order:", orderId);
  return { extractionId, s3Url, status: "completed" };
}
