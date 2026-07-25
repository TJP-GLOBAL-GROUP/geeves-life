# Penthouse (Unit 1 - 2BR) Dirty Data Audit Findings

## Root Cause
The Penthouse property has **misassigned platform iCal feeds**:
- `booking_com` platform (id: 6rVvJgKeoj7rxZfo6WAqN) is named "Morabeza - A Tropical Seneca Haven" → belongs to **Morabeza** property
- `vrbo` platform (id: n2dVmwfBKAmQo62mwvXH6) is named "Sunsets Studio - VRBO" → belongs to **Sunset Studio** property
- `airbnb` platform (id: 86b0ac2b-fbee-44af-b9) is named "Penthouse - Airbnb" → correctly assigned (0 bookings in 2026)

## Impact
- 33 bookings from the Booking.com feed (Morabeza data) are attributed to Penthouse
- 27 bookings from the VRBO feed (Sunset Studio data) are attributed to Penthouse
- Total 2026 revenue incorrectly shown: $7,470.33 (confirmed bookings)
- 10+ duplicate bookings exist on both Penthouse AND the correct property (Morabeza/Artiste's Boutique)

## Property IDs
- Penthouse: YiyTtDDIqXx88hD9ZWCo7
- Morabeza: nJnk4hr3AxZJZ-RkwhRJy
- Sunset Studio: Ln-_SMF7Nrt1uXsQcdP9C
- The Artiste's Boutique: ZI2Zy7OuLGYF-vmWOAII-

## Fix Plan (CAREFUL - don't delete data that belongs elsewhere)
1. **Deactivate** the misassigned platforms on Penthouse (don't delete, just isActive=0)
2. **For bookings from booking_com platform (6rVvJgKeoj7rxZfo6WAqN):**
   - If duplicate exists on Morabeza → delete from Penthouse
   - If no duplicate → reassign propertyId to Morabeza
3. **For bookings from vrbo platform (n2dVmwfBKAmQo62mwvXH6):**
   - If duplicate exists on Sunset Studio → delete from Penthouse
   - If no duplicate → reassign propertyId to Sunset Studio
4. Verify Penthouse shows $0 or minimal revenue after cleanup

## Remaining Overnight Work Items
- [ ] Execute Penthouse cleanup (above)
- [ ] Fix upcoming bookings not loading on Properties page (Section 37)
- [ ] Fix property carousel reorder (Section 36)
- [ ] Property widget pictures & map auto-load (Section 38)
- [ ] Morabeza booking visibility (Section 32) — booking exists in DB, need to fix display
- [ ] Verify categorization tool end-to-end (Section 31)
- [ ] Re-register propagation-retry as Manus heartbeat schedule
- [ ] Compile morning report

## Key Router/Query Locations
- Properties page bookings: server/routers/properties.ts → getPropertyBookings (line ~575)
- Upcoming events: server/routers/properties.ts → getUpcomingEvents (line ~714)
- Composite bookings: server/routers/properties.ts → getCompositeBookings (line ~2010)
- Property carousel: client/src/pages/Home.tsx (Properties widget section)
- Property reorder: look for sortOrder or displayOrder in properties schema
