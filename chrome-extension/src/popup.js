/**
 * Geeves Invoice Capture - Popup Script
 * Handles popup UI state and user interactions.
 */

const GEEVES_URL = "https://geeves.life";

document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const pendingCount = document.getElementById("pending-count");
  const capturedCount = document.getElementById("captured-count");
  const openCategorizer = document.getElementById("open-categorizer");
  const openVendor = document.getElementById("open-vendor");

  // Check auth status
  chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" }, (response) => {
    if (response?.success && response.data?.authenticated) {
      statusDot.className = "status-dot connected";
      statusText.textContent = `Connected as ${response.data.user.name || "User"}`;
    } else {
      statusDot.className = "status-dot disconnected";
      statusText.textContent = "Not connected";
    }
  });

  // Get pending orders count
  chrome.runtime.sendMessage({ type: "GET_PENDING_ORDERS" }, (response) => {
    if (response?.success) {
      pendingCount.textContent = response.data?.length || "0";
    } else {
      pendingCount.textContent = "—";
    }
  });

  // Get captured today count from storage
  const today = new Date().toISOString().split("T")[0];
  chrome.storage.local.get(["capturedToday", "capturedDate"], (result) => {
    if (result.capturedDate === today) {
      capturedCount.textContent = result.capturedToday || "0";
    } else {
      capturedCount.textContent = "0";
      chrome.storage.local.set({ capturedToday: 0, capturedDate: today });
    }
  });

  // Button handlers
  openCategorizer.addEventListener("click", () => {
    chrome.tabs.create({ url: `${GEEVES_URL}/expense-categorisation` });
    window.close();
  });

  openVendor.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.walmart.com/account/orders" });
    window.close();
  });

  // Listen for capture completions to update counter
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CAPTURE_COMPLETE" && message.payload?.success) {
      chrome.storage.local.get(["capturedToday", "capturedDate"], (result) => {
        const currentDate = new Date().toISOString().split("T")[0];
        const count = result.capturedDate === currentDate ? (result.capturedToday || 0) + 1 : 1;
        chrome.storage.local.set({ capturedToday: count, capturedDate: currentDate });
        capturedCount.textContent = String(count);
      });
    }
  });
});
