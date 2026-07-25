# Sync Audit Screenshot Notes — 2026-06-25

## Source screenshots reviewed

| Source file | Platform / screen | Key findings |
| --- | --- | --- |
| `/home/ubuntu/upload/Screenshot_20260625_011302_Pulse.jpg` | Pulse / Bookings / June | On **June 25, 2026**, Pulse shows: **Bohemian Lodge - Artist's Boutique** has **Kristina Panova** as a **stay-over** from **Jun 17–Jul 3, 2026**. **Morabeza - A Tropical Seneca Haven** shows **Haskins Valerie** **Jun 25–Jun 28, 2026** marked **Canceled**. **The Seneca Sunset Suites** shows **Jamie LASORSA** **Jun 24–Jun 27, 2026** marked **Canceled**, and **Julia Marotta** **Jun 25–Jun 28, 2026** marked **Canceled**. Summary cards show zero June 25 check-ins/check-outs for these sections, with one stay-over for Artist's Boutique. |
| `/home/ubuntu/upload/Screenshot_20260625_011353_Pulse.jpg` | Pulse / Bookings / July | On **July 25, 2026**, Pulse shows **Morabeza - A Tropical Seneca Haven** with **Jonathan Relph** as a **stay-over** from **Jul 24–Jul 26, 2026**. Summary card shows **0 check-ins, 1 stay-over, 0 check-outs**. |
| `/home/ubuntu/upload/Screenshot_20260625_011421_Pulse.jpg` | Pulse / list view | Pulse upcoming bookings include: **Olivia Polak** at **The Seneca Sunset Suites** for **Jul 5–Jul 8, 2026**; **Luigi Perrotta** at **Morabeza** for **Jul 6–Jul 8, 2026**; **Jonathan Relph** at **Morabeza** for **Jul 24–Jul 26, 2026**; **laura weir** at **Morabeza** for **Aug 21–Aug 22, 2026**; **Shawna Weaver** at **Morabeza** for **Oct 3–Oct 4, 2026**; **Martyna Rodak** at **Morabeza** for **May 11–May 12, 2027**; **Alicia Spivey** at **Morabeza** for **May 21–May 23, 2027**; **Ja'nos Bowen** at **Morabeza** for **May 27–May 31, 2027**. |
| `/home/ubuntu/upload/Screenshot_20260625_011514_Airbnb.jpg` | Airbnb calendar / Bohemian Lodge | Airbnb calendar shows an occupied span beginning **Jun 25, 2026** and bookings later in **July** and **August**. Visual evidence confirms at least one long stay crossing **late June into early July** and additional bookings around **Jul 9–11**, **Jul 19–25**, and early **August**. |
| `/home/ubuntu/upload/Screenshot_20260625_011540_Airbnb.jpg` | Airbnb calendar / Morabeza | Airbnb calendar shows a booking beginning **Jun 25, 2026** labeled **Christopher**, another booking around **Jul 4–5** labeled beginning with **Care...**, and later blocked/occupied periods in late July and September. |

## Cross-check implications

1. The DB currently contains **no `bookingType='block'` rows**. It does contain several `bookingType='unavailable'` rows for Airbnb and VRBO on multiple properties. Those need to be treated as potential platform-driven blocks / unavailable periods in the UI and audit matrix.
2. Pulse screenshots show multiple bookings/cancellations that must be compared against Geeves widgets for:
   - **Gantt rows**
   - **Upcoming check-in summary**
   - **Upcoming check-out summary**
3. For **Seneca Sunset Studios / Sunset Studio on VRBO**, the current DB snapshot shows the VRBO platform row is still **active=1** with **25 bookings** and **0 unavailable rows**, so the database does **not** currently support the claim that VRBO is inactive. This requires explicit auditing in the matrix as a potential configuration discrepancy versus operator understanding.
4. For overnight completion, the authoritative audit logic should use:
   - platform screenshot evidence for visible ground truth,
   - DB property/platform rows and `property_bookings`,
   - live UI rendering in Gantt and summary widgets.

| `/home/ubuntu/upload/Screenshot_20260625_011644_VrboOwner.jpg` | VRBO / Bohemian Lodge - The Artiste's Boutique | VRBO dashboard shows **Shannel Russell Aug 20–24, 7 guests** as the next guest (in 56 days from Jun 25 = Aug 20). VRBO says "no other reservations for the next 90 days" after that. Tax form required warning visible. |  
| `/home/ubuntu/upload/Screenshot_20260625_011700_VrboOwner.jpg` | VRBO / Morabeza: A Tropical Seneca Haven | VRBO dashboard shows **Angie Diette Jul 9–12, 2 guests** as the next guest (in 14 days from Jun 25). VRBO says "no other reservations for the next 90 days" after that. |  
| `/home/ubuntu/upload/Screenshot_20260625_011602_Airbnb.jpg` | Airbnb calendar / The Seneca Sunsets (Sunset Studio) | Airbnb shows **Kara +1** booking visible in **August** (around Aug 16–17). Calendar shows many blocked/unavailable days in July (crossed-out dates). No guest names visible for July blocked dates — these are likely VRBO cross-blocks or owner blocks. |  

## Critical VRBO Discrepancy — Seneca Sunset Suites

- **Pulse** shows "The Seneca Sunset Suites" with **Jamie LASORSA Jun 24–27 (Canceled)** and **Julia Marotta Jun 25–28 (Canceled)**.
- **Airbnb** calendar for "The Seneca Sunsets" shows many blocked/unavailable days in July with no guest names — these are cross-blocks.
- **VRBO** dashboard for Morabeza shows **Angie Diette Jul 9–12** as the only upcoming booking.
- **VRBO** dashboard for Bohemian Lodge shows **Shannel Russell Aug 20–24** as the only upcoming booking.
- **DB** shows Sunset Studio VRBO platform as `active=1` with 25 bookings — but user says "Seneca Sunset Studios is inactive on VRBO".
- **This is the critical discrepancy**: Either (a) the VRBO platform row for Sunset Studio is mislabeled as active when it should be inactive, or (b) the iCal URL is still feeding blocks even though the listing is inactive on VRBO.
- **Risk**: If VRBO is pushing unavailability blocks from an inactive listing, those blocks could be preventing bookings on Airbnb and Booking.com.

## Immediate follow-up tasks

- Build a machine-readable matrix from DB + screenshot evidence.
- Verify how `unavailable` rows are rendered in the Gantt and summary widgets.
- Trace whether canceled Pulse bookings are stored or intentionally excluded from Geeves DB.
- Verify whether Sunset Studio / Seneca Sunset Suites naming mismatch affects platform/property reconciliation.
