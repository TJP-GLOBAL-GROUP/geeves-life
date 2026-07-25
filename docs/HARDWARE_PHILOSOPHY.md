# Geeves — Hardware Philosophy & Product Roadmap

**Version:** 1.0 — June 18, 2026
**Project:** Geeves Life Management Platform
**Status:** Approved product direction — not yet in development

---

## 1. Core Principle: BYOD-First

Geeves.life is a software-first, open platform. The fundamental value proposition is that Geeves turns the hardware a customer already owns into a unified personal and household operating system. No hardware purchase is required to use any core feature of the platform.

> **"Geeves.life works with the devices you already own. Add hardware only when you want to unlock new capabilities — not to access the ones you already paid for."**

This principle governs every hardware decision. It is not a compromise; it is a deliberate competitive position. Closed hardware ecosystems create acquisition friction, slow growth, and erode trust. An open, BYOD-first approach removes the barrier to entry entirely and lets the product grow through software quality, not hardware lock-in.

The practical implications of this principle are:

**Any tablet becomes a Geeves Panel.** A customer with a spare Amazon Fire HD 10, an old iPad Mini, or an Android tablet can mount it on their wall and run Geeves Panel mode. The minimum specification is 2 GB RAM, 16 GB storage, Android 9 / iPadOS 14 or later, and an 8-inch screen. A $50 device meets this bar. Geeves does not sell a proprietary wall tablet.

**Any compatible mini-PC or NAS becomes a Geeves Hub.** Customers with a Synology NAS, a Raspberry Pi, an Unraid server, or any Docker-capable device can install the Geeves Hub software image. Geeves does not require customers to purchase its branded hardware to access Hub features.

**Any Raspberry Pi or compatible SBC becomes a Geeves Node.** The Node firmware image is freely available and flashable via Raspberry Pi Imager. Customers with spare hardware can deploy their own Nodes at no additional cost.

The Geeves-branded Hub and Node exist as **convenience products** — pre-configured, quality-tested, and ready to plug in. They are the right choice for customers who want a plug-and-play experience and are willing to pay a modest premium for it. They are not gatekeepers.

---

## 2. The "Works with Geeves" Programme

Geeves maintains a publicly documented compatibility programme for third-party hardware. Certified devices carry the "Works with Geeves" mark and are listed in the Geeves hardware directory. Certification requires passing a compatibility test suite and agreeing to a basic interoperability standard.

The programme serves three purposes. It generates affiliate and referral revenue from hardware partners without requiring Geeves to manufacture or stock inventory. It creates a trust signal for customers who want to buy compatible hardware from established brands. And it builds an ecosystem of hardware partners who have a commercial interest in Geeves succeeding.

Initial certification targets include Amazon Fire HD tablets (Panel mode), Synology and QNAP NAS devices (Hub mode), GL.iNet routers (Node mode), and Raspberry Pi 4 and 5 (Hub and Node modes).

---

## 3. The Geeves Hardware Line

While BYOD-first is the default, Geeves offers a curated hardware line for customers who want a premium, fully integrated experience. Every device in the Geeves hardware line runs the same open software as the BYOD equivalents — there is no feature gating on branded hardware.

### 3.1 Geeves Node

The Node is the smallest device in the line. It is a headless connectivity device designed to extend the Geeves household network to remote locations — a vacation property in Jamaica, a parent's home, an EA's office in Lagos.

| Attribute | Specification |
|---|---|
| **Form factor** | Compact enclosure, no screen, wall-outlet or USB-C power |
| **Base hardware** | Raspberry Pi Zero 2W (connectivity-only) or Pi 4 2GB (full compute) |
| **Primary function** | Tailscale subnet router, WiFi access point, local LAN bridge |
| **Secondary functions** | Presence detection (Bluetooth/WiFi scanning), local Geeves agent |
| **Target price** | $39–$59 |
| **Target customer** | Premium subscribers who want plug-and-play remote connectivity |

The Node is the device Supah-T carries to Jamaica. It joins the villa WiFi as a client, broadcasts a Geeves SSID for connected devices, and tunnels all traffic back to the home tailnet. Devices connected to the Geeves SSID in Jamaica can reach the home printer, smart home controls, and any other LAN-connected device as if they were physically at home.

### 3.2 Geeves Hub

The Hub is the primary home device. It runs the full Geeves agent stack and serves as the household's always-on compute and connectivity anchor.

| Attribute | Specification |
|---|---|
| **Form factor** | Small desktop enclosure, passive or quiet active cooling |
| **Base hardware** | Raspberry Pi 5 8GB + NVMe SSD (256 GB or 512 GB) |
| **Primary function** | Always-on Geeves agent, Tailscale coordination node, subnet router |
| **Secondary functions** | Local AI inference (Llama 3.2 / Phi-3 Mini), Home Assistant host, local backup, media server (Jellyfin), lightweight VM host |
| **Target price** | $119–$149 |
| **Target customer** | Premium subscribers who want a dedicated home intelligence hub |

The Hub is the device that makes Geeves genuinely local-first. It can respond to voice commands and process calendar and task queries even when the internet is down. It can run Home Assistant, giving constellation members controlled access to smart home devices via Tailscale ACLs. It can host lightweight virtual desktop environments for remote constellation members (EAs, family members) who need access to shared tools without credentials to the owner's personal machines.

### 3.3 Geeves Panel (Software Mode, Not a Device)

The Geeves Panel is a software mode, not a device. Any tablet meeting the minimum specification can run Panel mode. The Panel is the visual interface for the household — a wall-mounted dashboard showing the calendar, household member presence, property status, tasks, and smart home controls.

Panel mode is a Progressive Web App optimised for landscape orientation and always-on display. It includes a screen-saver mode that shows a minimal ambient display (clock, weather, next event) when idle, and wakes to the full dashboard on motion detection or tap.

**Minimum specification for Panel mode:**

| Spec | Minimum | Recommended |
|---|---|---|
| RAM | 2 GB | 4 GB |
| Storage | 16 GB | 32 GB |
| OS | Android 9 / iPadOS 14 / Chrome OS | Android 12+ / iPadOS 16+ |
| Screen | 8 inch, 1280×800 | 10 inch, 1920×1200 |
| Connectivity | WiFi 5 | WiFi 6 |

A $50 Amazon Fire HD 10 meets the minimum specification. A five-year-old iPad Mini 5 meets it comfortably.

---

## 4. Premium Display Line (Future)

Beyond the core Node/Hub/Panel line, Geeves has a longer-term opportunity in premium display hardware. These are not near-term products but represent the natural extension of the platform as it matures.

### 4.1 Geeves Display

A premium wall-mounted display designed specifically for the Geeves Panel experience. This is the product for customers who want something that looks architectural rather than like a mounted tablet. Think a thin, flush-mounted panel with a custom industrial design, ambient light sensor, and a dedicated Geeves compute module embedded in the frame.

This product is not a priority until the software platform has significant traction. The design language should be consistent with the Geeves brand — the constellation motif, the node-and-line visual system, the dark-first aesthetic.

### 4.2 Geeves Auto (Head Unit)

The most ambitious hardware product in the roadmap. A Geeves-branded automotive head unit that sits above Android Auto and Apple CarPlay as a native layer, rather than replacing them.

The core insight is that Android Auto and Apple CarPlay are excellent at what they do — navigation, music, calls — but they are generic. They have no knowledge of the household, the schedule, the constellation members, or the properties. A Geeves Auto layer can surface contextually relevant information that neither platform can:

- **Departure intelligence:** "You have a check-in at Sunset Studio at 3 PM. Current traffic puts your arrival at 3:45. Leave now or notify the guest?"
- **Household awareness:** "Nia's school pickup is in 40 minutes. Her school is 12 minutes from your current location."
- **Property alerts:** "A new booking request arrived for Morabeza. Tap to review."
- **Constellation member routing:** "Eniola has sent you a task. Play audio summary?"

The head unit runs Android Automotive OS (not Android Auto — the distinction matters; AAOS is a full Android installation on the vehicle's infotainment system, not a phone projection). Geeves Auto is an AAOS application that integrates with the Geeves platform via the same API as the mobile app.

The hardware strategy for Geeves Auto has two paths. The first is a software-only path — publishing a Geeves Auto app on the Android Automotive OS app store, which is available on vehicles from Volvo, Polestar, Renault, and others. This requires no hardware manufacturing. The second is an aftermarket head unit for vehicles that do not run AAOS — a double-DIN unit with a custom enclosure, Geeves branding, and a pre-installed Geeves Auto build. This is a longer-term hardware product.

The auto head unit is a significant differentiator because no personal OS product has meaningfully integrated with the vehicle context. The car is where a large portion of household logistics decisions happen — school pickups, grocery runs, property visits — and it is currently a dead zone for personal AI assistants.

---

## 5. Hardware as a Retention Mechanism

The BYOD-first principle does not mean hardware is unimportant to the business. Hardware creates physical presence in the customer's home and dramatically increases switching costs. A customer who has a Geeves Hub in their kitchen, a Node at their vacation property, and Panel mode running on a wall tablet in their hallway is not going to cancel their subscription because a competitor launched a slightly better calendar feature.

The hardware strategy is therefore a retention and monetisation strategy, not an acquisition strategy. Acquisition happens through the free software tier. Conversion to paid happens through software features. Retention is reinforced by hardware presence.

This means the quality bar for Geeves hardware must be high. The enclosures should feel considered and premium. The setup experience should be genuinely simple. The firmware should be reliable and updated automatically. A customer who has a poor hardware experience will associate that experience with the Geeves brand, even if the software is excellent.

---

## 6. Manufacturing & Supply Chain Approach

Geeves does not manufacture its own silicon. The hardware line is built on commodity single-board computers (Raspberry Pi, Rockchip RK3588-based boards) with custom enclosures and firmware. This approach keeps capital requirements low, leverages an established global supply chain, and allows rapid iteration on the hardware design without retooling costs.

The enclosure design should be done with a reputable industrial design firm. The firmware is maintained by the Geeves engineering team as an open-source project. Assembly and fulfilment can be handled by a contract manufacturer (CM) in the US, UK, or Southeast Asia depending on the primary market.

For the initial launch, a small batch of 500–1,000 units is sufficient to validate the market and gather feedback. The Raspberry Pi Compute Module 4 or CM5 is the preferred base for the Hub enclosure because it allows a custom carrier board that integrates the NVMe SSD, the WiFi radio, and the power management in a single compact form factor.

---

## 7. Roadmap Summary

| Phase | Hardware | Timeline |
|---|---|---|
| **Phase 1 (Now)** | BYOD Panel mode (tablet PWA), BYOD Hub (Docker image), BYOD Node (Pi OS image) | Live |
| **Phase 2** | Geeves Node (pre-configured Pi Zero 2W / Pi 4) — first branded hardware | 12–18 months |
| **Phase 3** | Geeves Hub (pre-configured Pi 5 + SSD enclosure) | 18–24 months |
| **Phase 4** | Works with Geeves certification programme | 18–24 months |
| **Phase 5** | Geeves Display (premium wall panel) | 30–36 months |
| **Phase 6** | Geeves Auto (AAOS app, then aftermarket head unit) | 36–48 months |

---

*Last updated: June 18, 2026 — Supah-T product direction session*
*See also: `docs/CONNECTIVITY_STRATEGY.md`, `docs/GLOBAL_DESIGN.md`*
