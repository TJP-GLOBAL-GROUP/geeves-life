# Geeves — Connectivity Strategy

**Version:** 1.0 — June 18, 2026
**Project:** Geeves Life Management Platform
**Status:** Architecture approved — implementation Phase 2

---

## 1. The Problem This Solves

Modern households are not contained within a single physical location. A household might have a primary residence in New York, a vacation property in Jamaica, a parent's home in another city, and constellation members (EAs, family members) working from Lagos, London, or Los Angeles. The devices, printers, smart home systems, and files that belong to that household are fragmented across these locations and networks, accessible only when you are physically present.

Geeves Connectivity is the layer that makes the household network location-independent. A constellation member in Lagos should be able to reach the household printer as if she were sitting in the New York kitchen. The owner should be able to access their home smart home controls from a villa in Jamaica. An EA should be able to work in a sandboxed environment on the household's local network without ever having credentials to personal machines.

This is not a VPN in the traditional sense — it is a **household mesh network** that is aware of the Geeves identity model, the constellation member permission system, and the household's physical topology.

---

## 2. Technology Foundation: Tailscale / WireGuard

The connectivity layer is built on **Tailscale**, which is itself built on **WireGuard** — the modern, audited, kernel-level VPN protocol that has replaced OpenVPN and IPsec as the industry standard for secure tunnelling.

Tailscale adds a coordination layer on top of WireGuard that handles the hard problems: NAT traversal (connecting two devices that are both behind firewalls), key distribution, device authentication, and access control policies. The result is a zero-configuration mesh network where any two devices can connect directly to each other, regardless of their network topology, with no port forwarding or firewall rules required.

Every Geeves household gets its own **tailnet** — an isolated private network that contains all the household's devices, Nodes, and Hubs. Constellation members are added to the tailnet with scoped access controlled by Tailscale ACL policies that map directly to the Geeves RBAC model.

### Why Tailscale Over a Traditional VPN

| Concern | Traditional VPN | Tailscale |
|---|---|---|
| Setup complexity | Requires port forwarding, static IP, or VPN server | Zero configuration — works behind any NAT |
| Performance | All traffic routes through a central server | Direct peer-to-peer connections where possible |
| Key management | Manual certificate management | Automatic, cryptographically verified |
| Access control | Coarse (in or out of the VPN) | Fine-grained ACL policies per device and user |
| Mobile battery impact | High (always-on tunnel) | Low (WireGuard is extremely efficient) |
| Audit trail | Typically none | Full connection log per device |

---

## 3. Architecture: How the Household Mesh Works

```
┌─────────────────────────────────────────────────────────┐
│                   Tailscale Coordination                 │
│              (or self-hosted Headscale)                  │
└────────────────────────┬────────────────────────────────┘
                         │ encrypted control plane
         ┌───────────────┼───────────────────────┐
         │               │                       │
┌────────▼──────┐  ┌─────▼──────┐  ┌────────────▼──────┐
│  Geeves Hub   │  │Geeves Node │  │ Constellation      │
│  (NY home)    │  │ (Jamaica)  │  │ Member Device      │
│               │  │            │  │ (Lagos / London)   │
│ Subnet router │  │ WiFi bridge│  │                    │
│ 192.168.1.0/24│  │ local SSID │  │ Tailscale client   │
└───────────────┘  └────────────┘  └────────────────────┘
        │                │
  Home LAN          Jamaica LAN
  (printer,          (devices
  smart home,         connected
  NAS, etc.)          to Geeves
                       SSID)
```

**The Hub** is deployed at the primary residence. It runs a Tailscale subnet router, which advertises the home LAN subnet (e.g., `192.168.1.0/24`) to all authorised tailnet members. Any device on the tailnet can reach any device on the home LAN by IP address — the printer, the NAS, the smart home hub — without any additional configuration on those devices.

**The Node** is deployed at remote locations. It runs Tailscale as a subnet router for the local network, and simultaneously runs `hostapd` to broadcast a Geeves SSID. Devices that connect to the Geeves SSID are NATted through the Tailscale tunnel back to the home tailnet. This is the WiFi bridge functionality — devices in Jamaica that connect to the Geeves SSID can reach the home network as if they were physically present.

**Constellation member devices** run the standard Tailscale client, installed as part of the Geeves onboarding flow. The Geeves platform generates a pre-authentication key via the Tailscale API when a constellation member is invited, and the Geeves mobile app handles the Tailscale client installation and key configuration automatically. The member never interacts with Tailscale directly.

---

## 4. Access Control: Geeves RBAC → Tailscale ACL Mapping

Tailscale ACL policies are JSON documents that define which devices can communicate with which other devices. Geeves manages these policies programmatically via the Tailscale API, keeping them in sync with the Geeves RBAC model.

The mapping between Geeves household roles and Tailscale ACL permissions is as follows:

| Geeves Role | Tailscale Access |
|---|---|
| **Owner** | Full access to all devices on the tailnet and all subnets |
| **Admin** | Full access to all devices and subnets |
| **Adult** | Access to shared devices (printer, media server); no access to owner's personal devices |
| **EA** | Access to shared devices and the sandboxed virtual desktop on the Hub; no access to personal devices or smart home controls |
| **Child** | Access to media server only; no access to network devices |
| **Guest** | No tailnet access by default; temporary access can be granted per-visit |

ACL policies are regenerated and pushed to Tailscale whenever a household member's role changes, a new member is added, or a member is removed. This is handled by a server-side procedure (`trpc.household.syncTailscaleACL`) that is called automatically by the household management workflows.

---

## 5. The WiFi Bridge in Detail

The WiFi bridge is the feature that makes the Node genuinely useful for travel. The software stack running on the Node is entirely open source:

| Component | Role |
|---|---|
| **Tailscale** | WireGuard tunnel to the home tailnet |
| **hostapd** | Broadcasts the Geeves SSID as a WiFi access point |
| **dnsmasq** | DHCP server for devices connecting to the Geeves SSID |
| **iptables / nftables** | NAT rules that route traffic from the Geeves SSID through the Tailscale interface |
| **Geeves agent** | Registers the Node with the household, reports status, handles firmware updates |

When the Node arrives at a new location, it connects to the local WiFi as a client (using credentials stored in the Geeves app and pushed to the Node via the tailnet). It then broadcasts the Geeves SSID. Devices that connect to the Geeves SSID receive a DHCP lease and their traffic is NATted through the Tailscale tunnel.

The Node also functions as a **Tailscale exit node** — if the owner wants all traffic from their devices to appear to originate from the home network (useful for accessing geo-restricted services or for privacy on untrusted networks), they can enable exit node mode from the Geeves app with a single toggle.

---

## 6. Connectivity at Scale: The 150,000-User Model

At 150,000 active households, the per-user cost of Tailscale's commercial tiers becomes significant. The strategy for managing this cost has two phases.

### Phase A: Tailscale OEM Partnership (Launch → ~20,000 users)

Tailscale operates a documented partner and OEM programme that allows platforms to embed Tailscale connectivity at wholesale rates. The commercial model is typically a per-tailnet or per-active-device rate rather than a per-seat rate, negotiated directly with Tailscale's partnerships team.

Several established platforms have taken this path, including Synology (DSM Tailscale package), QNAP, and various NAS vendors. The Geeves use case — one tailnet per household, with 2–10 devices per tailnet — is well within the parameters of existing OEM arrangements.

At launch, Geeves should initiate a partnership conversation with Tailscale. The key negotiating points are: wholesale per-tailnet pricing, white-label or co-branded client binaries, and SLA guarantees for the DERP relay infrastructure that Tailscale operates globally.

### Phase B: Self-Hosted Headscale (>20,000 users)

**Headscale** is the open-source, self-hosted implementation of the Tailscale coordination server. It is fully compatible with the standard Tailscale client — no changes are required on user devices. Migrating from Tailscale's hosted coordination to a self-hosted Headscale instance eliminates the per-user cost entirely.

The infrastructure cost of running Headscale at 150,000 tailnets is modest — the coordination server is stateless and horizontally scalable. The primary operational cost is the DERP relay infrastructure (the servers that relay traffic when direct peer-to-peer connections are not possible). Geeves would need to operate DERP nodes in at least three geographic regions (Americas, Europe, Asia-Pacific) to ensure acceptable latency globally.

The migration path from Tailscale to Headscale is non-trivial but well-documented. Devices need to re-register with the new coordination server, which requires a re-authentication flow for all users. This migration should be planned carefully to minimise disruption.

### Cost Model Comparison

| Scenario | Tailscale Commercial | Self-Hosted Headscale |
|---|---|---|
| 1,000 households | ~$500–1,000/month | ~$200/month (infra only) |
| 10,000 households | ~$5,000–8,000/month | ~$800/month |
| 150,000 households | ~$60,000–90,000/month | ~$5,000–8,000/month |

The crossover point where self-hosting becomes clearly economical is around 10,000–20,000 active households. Below that threshold, the engineering and operational overhead of running Headscale outweighs the cost savings.

---

## 7. Remote Print: The Practical Solution

For constellation members who need to print to the owner's home printer, the connectivity layer provides the network path. The printer is reachable via its LAN IP address through the Tailscale subnet router on the Hub. The constellation member's device, once on the tailnet, can add the printer using its IP address directly.

For members who do not need full network access (e.g., an EA who only needs to print occasionally), a simpler cloud print relay is preferable. The recommended approach depends on the printer manufacturer:

| Printer brand | Cloud print solution | Setup required |
|---|---|---|
| HP | HP Smart / HP ePrint | Enable in HP Smart app; share email address |
| Canon | Canon PRINT | Enable Canon Cloud Link; share printer |
| Epson | Epson Connect | Register at epsonconnect.com; share printer |
| Any brand | Printix | Install Printix client on any PC on the home LAN |

The Geeves platform should surface the appropriate cloud print option in the household settings, alongside the full Tailscale connectivity option, so owners can choose the right level of access for each constellation member.

---

## 8. Virtual Desktop for Constellation Members

The Geeves Hub (Pi 5 8GB) has sufficient compute to run lightweight virtual desktop environments using **LXC containers** or **QEMU/KVM** with a minimal Linux desktop. This enables a genuinely novel use case: an EA in Lagos can be given access to a sandboxed virtual desktop that runs on the owner's home Hub, with access to shared files, the household printer, and approved tools — without ever having credentials to the owner's personal machines.

The virtual desktop is accessed via **RDP or VNC over the Tailscale tunnel**, which provides an encrypted, authenticated connection. The Geeves app surfaces this as a "Remote Workspace" feature in the constellation member's interface.

This feature is a Phase 3 item — it requires the Hub hardware to be in market and a meaningful number of households to have adopted it. The architecture is sound and the technology is mature; the limiting factor is hardware adoption.

---

## 9. Geeves Auto Connectivity

The Geeves Auto head unit (see `docs/HARDWARE_PHILOSOPHY.md`, Section 4.2) connects to the household tailnet as a standard Tailscale node. This means the vehicle is a first-class member of the household mesh network. Practical implications include:

- The vehicle can access the home NAS for media playback without an internet connection (via the tailnet)
- The Geeves agent on the vehicle can push location and ETA data to the household Hub for departure intelligence features
- Smart home automations can be triggered by the vehicle's location (e.g., open the garage when the vehicle is within 500 metres of home)
- The vehicle can be granted temporary access to a constellation member's tailnet for shared navigation or media

---

## 10. Security Considerations

The connectivity layer introduces a significant attack surface. The following controls are mandatory before any constellation member connectivity features are enabled in production:

| Control | Implementation | Status |
|---|---|---|
| Tailscale ACL policies | Programmatically managed via Tailscale API; synced on every RBAC change | Phase 2 |
| Node firmware signing | All Node firmware images signed with Geeves private key; verified on boot | Phase 2 |
| Pre-auth key rotation | Tailscale pre-auth keys expire after 24 hours; single-use | Phase 2 |
| Tailnet isolation | Each household has a separate tailnet; no cross-household routing | Phase 2 |
| Audit logging | All tailnet connection events logged to the Geeves audit log table | Phase 2 |
| Node physical security | Nodes generate a unique device key on first boot; key is not recoverable if the device is stolen | Phase 3 |

The connectivity layer is explicitly out of scope for the current Phase 1 security posture (see `docs/SECURITY_ASSESSMENT.md`). It will be assessed separately as part of the Phase 2 security review before any constellation member connectivity features are enabled.

---

*Last updated: June 18, 2026 — Supah-T product direction session*
*See also: `docs/HARDWARE_PHILOSOPHY.md`, `docs/SECURITY_ASSESSMENT.md`, `docs/GLOBAL_DESIGN.md`*
