# Channex Onboarding Research — Jul 5, 2026

## Key Question: Does the end-user need to interact with Channex directly?

### Answer: PARTIALLY TRUE — but it can be embedded

The statement "hosts must connect their platform accounts to Channex (via Channex's mapping flow)" is **partially true but misleading**. Here's the nuanced reality:

## What Actually Happens

### 1. Airbnb Connection (OAuth)
- **Requires user login**: The host must log into their Airbnb account to authorize the OAuth connection
- **BUT**: This can happen inside a Channex iframe embedded in YOUR app (Geeves)
- The user never sees "Channex" branding — it's white-labeled
- Source: https://docs.channex.io/channel-mapping-guides/airbnb
- Quote: "To connect Airbnb it works with an Oauth model, this means you need to have login access to the account to be able to connect it to Channex."

### 2. Booking.com Connection
- **Requires action in Booking.com Extranet**: The host must request a connection to Channex from within their Booking.com admin panel
- This is a Booking.com requirement (not Channex-specific) — ANY channel manager requires this step
- Source: https://docs.channex.io/channel-mapping-guides/booking.com

### 3. Channel IFrame (White-Label Embedding)
- Channex provides an **embeddable iframe** that shows the channel mapping screen inside YOUR application
- The PMS (Geeves) generates a one-time access token via API, then renders the iframe
- The user creates/edits/removes channel connections within this iframe — **never leaving Geeves**
- Source: https://docs.channex.io/api-v.1-documentation/channel-iframe
- Quote: "This is the API to show an iframe for the Channex mapping screen in your application. The user will be able to create channels and map by themselves."

### 4. Automated Mapping (API-Driven)
- For PMS providers, Channex supports **auto-creating properties, rooms, and rate plans** via API
- The PMS Integration Guide explicitly mentions: "Auto create property, rooms and rate plans on new accounts"
- Source: https://docs.channex.io/guides/pms-integration-guide
- Quote: "For some PMS or systems it might be simpler to auto create and map and to keep the mapping interface to the administrator."

## Corrected Assessment

The original statement should be revised to:

**ORIGINAL (in DATA_COLLECTION_ARCHITECTURE_REVIEW.md):**
> "User onboarding friction — hosts must connect their platform accounts to Channex (via Channex's mapping flow), which is an additional step beyond connecting to Geeves directly"

**CORRECTED:**
> "User onboarding requires hosts to authorize their platform accounts (Airbnb via OAuth, Booking.com via Extranet request). This authorization step exists regardless of whether you use Channex or build direct integrations — it's a platform requirement, not a Channex-specific friction. Channex provides an embeddable white-label iframe and API-driven auto-mapping so the user never leaves the Geeves UI."

## Implications for Geeves Architecture

1. **No additional friction vs. direct integration** — Airbnb requires OAuth regardless; Booking.com requires Extranet approval regardless
2. **The iframe approach means Geeves can fully abstract Channex** — users see "Connect Airbnb" inside Geeves, not "Go to Channex"
3. **API-driven auto-mapping** means once a user connects, Geeves can programmatically map properties/rooms without user interaction
4. **The only real friction is Booking.com's Extranet step** — but this is unavoidable with ANY channel manager or direct API integration
