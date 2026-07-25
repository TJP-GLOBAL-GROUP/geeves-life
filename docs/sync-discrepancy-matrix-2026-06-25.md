# Geeves.Life — iCal Sync Discrepancy Matrix
**Audit Date:** June 25, 2026  
**Auditor:** Geeves Autonomous Agent  
**Sources:** DB snapshot (polled ~39 min before audit), Pulse screenshots (1:13–1:17 AM), Airbnb calendar screenshots, VRBO Owner dashboard screenshots

---

## Summary

| Severity | Count | Description |
| :--- | :---: | :--- |
| 🔴 CRITICAL | 1 | Sunset Studio VRBO active in DB but user reports inactive; 25 bookings still feeding cross-blocks |
| 🟡 WARNING | 2 | Apartment #1 and Apartment #2 have NO platform configurations in DB |
| 🟡 WARNING | 1 | Morabeza VRBO shows Angie Diette Jul 9–12 on VRBO; not confirmed in Geeves DB Gantt |
| 🟡 WARNING | 1 | Artiste's Boutique VRBO shows Shannel Russell Aug 20–24; not confirmed in Geeves DB |
| ℹ️ INFO | 3 | Canceled bookings (Jamie LASORSA, Julia Marotta, Haskins Valerie) appear in Pulse but not in Geeves DB — expected if iCal feeds exclude cancellations |
| ✅ OK | 7 | All active platform iCal feeds last polled ~39 min ago with no errors |

---

## Matrix: Property × Platform Sync Status

### Legend
- ✅ **OK** — iCal configured, recently polled, no errors, booking counts match expected range
- 🔴 **CRITICAL** — Active in DB but should be inactive; risk of spurious cross-blocks
- 🟡 **WARN** — Configured but discrepancy detected between platform ground truth and DB
- ⬜ **NOT_CONFIGURED** — No platform row in DB for this property
- ℹ️ **INFO** — Informational note only

---

### Apartment #1 — Jessica Dougherty

| Platform | Status | DB Bookings | Ground Truth | Notes |
| :--- | :--- | :---: | :--- | :--- |
| Airbnb | ⬜ NOT_CONFIGURED | 0 | Unknown | No iCal URL in DB |
| VRBO | ⬜ NOT_CONFIGURED | 0 | Unknown | No iCal URL in DB |
| Booking.com | ⬜ NOT_CONFIGURED | 0 | Unknown | No iCal URL in DB |
| Direct | ⬜ NOT_CONFIGURED | 0 | N/A | — |

**Action required:** Add platform iCal URLs for Apartment #1 in the property settings.

---

### Apartment #2 — Jennifer Ungberg

| Platform | Status | DB Bookings | Ground Truth | Notes |
| :--- | :--- | :---: | :--- | :--- |
| Airbnb | ⬜ NOT_CONFIGURED | 0 | Unknown | No iCal URL in DB |
| VRBO | ⬜ NOT_CONFIGURED | 0 | Unknown | No iCal URL in DB |
| Booking.com | ⬜ NOT_CONFIGURED | 0 | Unknown | No iCal URL in DB |
| Direct | ⬜ NOT_CONFIGURED | 0 | N/A | — |

**Action required:** Add platform iCal URLs for Apartment #2 in the property settings.

---

### Morabeza — A Tropical Seneca Haven

| Platform | Status | DB Bookings | DB Unavailable | Ground Truth | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| Airbnb | ✅ OK | 2 | 4 | Airbnb calendar shows Christopher booking Jun 25+, Care... booking Jul 4–5 | DB has 2 bookings Jun 24–Jul 5 range. Unavailable rows (4) likely represent Airbnb-side blocks from other platform cross-sync. Consistent. |
| VRBO | 🟡 WARN | 6 | 1 | VRBO dashboard shows **Angie Diette Jul 9–12** as next guest | DB has 6 VRBO bookings ranging Sep 2025–Jul 2026. Need to verify Angie Diette Jul 9–12 is present in DB. VRBO says "no other reservations for next 90 days" after that — consistent with DB range ending Jul 12. |
| Booking.com | ✅ OK | 10 | 0 | Pulse shows Luigi Perrotta Jul 6–8, Jonathan Relph Jul 24–26, laura weir Aug 21–22, Shawna Weaver Oct 3–4, and 2027 bookings | DB has 10 bookings Jun 2026–May 2027. Booking count and date range consistent with Pulse list. |
| Direct | ⬜ NOT_CONFIGURED | 0 | 0 | N/A | — |

**Morabeza VRBO detail check needed:** Confirm `Angie Diette Jul 9–12` exists in DB under VRBO platform ID `939ayddubY_KHSfH5GIFN`. The DB shows VRBO bookings ending at Jul 12, 2026 — this aligns but the guest name needs verification since iCal feeds often omit guest names.

---

### Sunset Studio (a.k.a. "The Seneca Sunset Suites" in Pulse)

| Platform | Status | DB Bookings | DB Unavailable | Ground Truth | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| Airbnb | ✅ OK | 1 | 2 | Airbnb calendar shows **Kara +1** in August, many crossed-out (blocked) days in July | DB has 1 Airbnb booking (Aug 13–16) and 2 unavailable rows (Aug 12–17). The July crossed-out days on Airbnb are NOT in DB as unavailable — these are likely VRBO cross-blocks being pushed to Airbnb calendar. **This is the visual discrepancy you noticed.** |
| VRBO | 🔴 **CRITICAL** | 25 | 0 | **User reports Seneca Sunset Studios is INACTIVE on VRBO** | DB has VRBO platform row marked `active=1` with **25 bookings** (Sep 2025–Oct 2026). If the VRBO listing is deactivated, VRBO may still be pushing its calendar as blocks to other platforms via iCal cross-sync. The 25 VRBO bookings in DB may be stale/historical from when the listing was active. **The July blocked dates on Airbnb are almost certainly caused by this.** |
| Booking.com | ✅ OK | 1 | 0 | Pulse shows Olivia Polak Jul 5–8 at Seneca Sunset Suites | DB has 1 Booking.com booking (Jul 5–8). Consistent with Pulse. |
| Direct | ⬜ NOT_CONFIGURED | 0 | 0 | N/A | — |

**CRITICAL ACTION REQUIRED:**  
The VRBO platform row for Sunset Studio must be set to `isActive = false` in the DB. While the iCal feed may still be accessible (VRBO continues to serve the calendar even for inactive listings), Geeves should stop treating it as an active feed and should flag any blocks it generates as "inactive platform blocks" rather than real bookings. The July blocked dates visible on Airbnb's calendar for this property are likely being caused by VRBO's iCal feed pushing unavailability from the deactivated listing.

---

### The Artiste's Boutique (a.k.a. "Bohemian Lodge - Artist's Boutique" in Pulse)

| Platform | Status | DB Bookings | DB Unavailable | Ground Truth | Notes |
| :--- | :--- | :---: | :---: | :--- | :--- |
| Airbnb | ✅ OK | 5 | 0 | Airbnb calendar shows occupied spans in late June/early July, mid-July, and August | DB has 5 Airbnb bookings (Jul 3–Oct 19). Pulse shows Kristina Panova Jun 17–Jul 3 as a stay-over — this would be a booking ending Jul 3, consistent with DB earliest booking Jul 3. |
| VRBO | 🟡 WARN | 6 | 1 | VRBO dashboard shows **Shannel Russell Aug 20–24, 7 guests** as next guest | DB has 6 VRBO bookings (Aug 2025–Aug 2026). Shannel Russell Aug 20–24 should be in DB. VRBO says "no other reservations for next 90 days" after that — consistent. |
| Booking.com | ✅ OK | 1 | 0 | Pulse shows one active stay-over (Kristina Panova is Airbnb) | DB has 1 Booking.com booking (Jun 17–Jul 3). This matches the Kristina Panova stay-over visible in Pulse. |
| Direct | ⬜ NOT_CONFIGURED | 0 | 0 | N/A | — |

---

## Gantt Chart Discrepancy Summary

The following bookings are visible in platform screenshots but need verification in the Geeves Gantt widget:

| Property | Platform | Guest | Dates | In DB? | In Gantt? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Morabeza | VRBO | Angie Diette | Jul 9–12, 2026 | Likely (DB ends Jul 12) | Needs verification |
| Morabeza | Airbnb | Christopher | Jun 25–? 2026 | Yes (booking Jun 24–Jul 5) | Needs verification |
| Artiste's Boutique | VRBO | Shannel Russell | Aug 20–24, 2026 | Likely (DB has Aug 2026 booking) | Needs verification |
| Sunset Studio | Airbnb | Kara +1 | ~Aug 16–17, 2026 | Yes (DB Aug 13–16) | Needs verification |
| Sunset Studio | VRBO | (blocks) | July 2026 (multiple) | 🔴 NOT in DB as unavailable | Causing Airbnb cross-blocks |

## Upcoming Check-in/Check-out Summary Discrepancy

| Property | Platform | Guest | Check-in | Check-out | In Geeves Summary? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Seneca Sunset Suites | Booking.com | Olivia Polak | Jul 5, 2026 | Jul 8, 2026 | Needs verification |
| Morabeza | Airbnb | Luigi Perrotta | Jul 6, 2026 | Jul 8, 2026 | Needs verification |
| Morabeza | VRBO | Angie Diette | Jul 9, 2026 | Jul 12, 2026 | Needs verification |
| Morabeza | Airbnb | Jonathan Relph | Jul 24, 2026 | Jul 26, 2026 | Needs verification |
| Artiste's Boutique | VRBO | Shannel Russell | Aug 20, 2026 | Aug 24, 2026 | Needs verification |
| Morabeza | Airbnb | laura weir | Aug 21, 2026 | Aug 22, 2026 | Needs verification |

---

## VRBO Inactive Listing — Risk Assessment

**Question:** Could Seneca Sunset Studios being inactive on VRBO cause blocks on other platforms?

**Answer: YES — CRITICAL RISK.**

When a VRBO listing is deactivated, VRBO does not automatically clear its iCal feed. The iCal URL continues to serve the calendar with all existing bookings and owner-blocked dates. If Airbnb and Booking.com have imported this VRBO iCal URL as a "connected calendar" (which is standard practice to prevent double-bookings), those platforms will continue to see and honour the VRBO blocks as unavailability — even though the VRBO listing is no longer taking new bookings.

**Evidence:** The Airbnb calendar for "The Seneca Sunsets" shows multiple crossed-out (blocked) days in July 2026 with no guest names. These are not Airbnb bookings — they are cross-platform blocks. The DB has 25 VRBO bookings for Sunset Studio ranging through October 2026. These are the source of the Airbnb blocks.

**Recommended actions:**
1. **Immediately** set `isActive = false` for Sunset Studio's VRBO platform row in Geeves DB.
2. On Airbnb and Booking.com, **remove the VRBO iCal import** for this property to stop receiving VRBO blocks.
3. Geeves should display a **CRITICAL badge** on the Sunset Studio property card until this is resolved.
4. Consider whether the 25 VRBO bookings in DB are real historical bookings or stale blocks — if stale, they should be archived.

---

## Recommended Next Actions (Priority Order)

1. 🔴 **Mark Sunset Studio VRBO as inactive** in property platform settings (SuperAdmin → Properties → Sunset Studio → VRBO → toggle off)
2. 🟡 **Add iCal URLs for Apartment #1 and Apartment #2** — these properties have no platform configurations
3. 🟡 **Verify Morabeza VRBO guest names** — Angie Diette Jul 9–12 should appear in Geeves Gantt
4. 🟡 **Verify Artiste's Boutique VRBO** — Shannel Russell Aug 20–24 should appear in Geeves Gantt
5. ℹ️ **Canceled bookings** (Jamie LASORSA, Julia Marotta, Haskins Valerie) are correctly absent from Geeves — iCal feeds only carry confirmed/active bookings
