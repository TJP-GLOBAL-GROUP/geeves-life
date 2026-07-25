# Geeves Invoice Capture — Chrome Extension

A Manifest V3 Chrome Extension that automatically captures invoice PDFs from Walmart (and future vendors) and extracts line-item data for the Geeves.Life expense categorization tool.

---

## Installation (Developer Mode)

Since this extension is not published to the Chrome Web Store, you install it manually in Developer Mode:

### Step 1: Download the Extension

Download the `chrome-extension` folder from the Geeves project (or the packaged `.zip` file if provided).

### Step 2: Open Chrome Extensions Page

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)

### Step 3: Load the Extension

1. Click **"Load unpacked"** button (top-left)
2. Select the `chrome-extension` folder (the one containing `manifest.json`)
3. The extension will appear in your extensions list with the blue "G" icon

### Step 4: Pin the Extension

1. Click the puzzle piece icon in Chrome's toolbar
2. Find "Geeves Invoice Capture" in the list
3. Click the pin icon to keep it visible in your toolbar

---

## How It Works

### On Walmart Order Pages

When you visit a Walmart order page (`walmart.com/orders/...`), the extension:
1. Detects invoice/receipt download links on the page
2. Injects a "Capture for Geeves" button next to each link
3. When clicked, downloads the PDF and uploads it to Geeves
4. Geeves then extracts line items, totals, and payment method via AI

### On Geeves.Life

When you visit the Walmart Categorization tool on Geeves.Life:
1. The extension signals its presence to the web app
2. The web app shows a green "Extension active" badge
3. A "Capture Invoice" button appears on orders that don't have extracted data
4. Extracted line items appear in a dedicated panel with payment account linking

### Popup

Click the extension icon in your toolbar to see:
- Connection status (whether you're logged into Geeves)
- Pending orders count
- Today's capture count
- Quick links to the Categorizer and Walmart Orders

---

## Permissions Explained

| Permission | Why |
|------------|-----|
| `activeTab` | Access the current tab's content for invoice detection |
| `storage` | Store capture counts and settings locally |
| `downloads` | Intercept PDF downloads from Walmart |
| `walmart.com` | Inject capture buttons on order pages |
| `geeves.life` | Signal extension presence to the web app |

---

## Troubleshooting

**Extension not detected on Geeves.Life:**
- Ensure the extension is enabled in `chrome://extensions/`
- Refresh the Geeves.Life page
- Check that the extension has permission for the site

**Capture button not appearing on Walmart:**
- Navigate to a specific order page (not the orders list)
- Wait a few seconds for the page to fully load
- Check the console for `[Geeves]` log messages

**"Not connected" in popup:**
- Make sure you're logged into Geeves.Life in the same Chrome profile
- Visit geeves.life and log in, then try the popup again

---

## Development

The extension uses vanilla JavaScript (no build step required):

```
chrome-extension/
├── manifest.json              # Extension configuration
├── icons/                     # Extension icons (16, 48, 128px)
├── src/
│   ├── background.js          # Service worker (API calls, message routing)
│   ├── popup.html             # Popup UI
│   └── popup.js               # Popup logic
└── content-scripts/
    ├── walmart.js             # Walmart page injection
    └── geeves-bridge.js       # Geeves.Life detection bridge
```

To make changes, edit the files and click "Update" on the extension card in `chrome://extensions/`.

---

*Version 1.0.0 — Built for Geeves.Life*
