# Duplicate Booking Investigation — Jul 5-12 2026

## Raw Data (11 bookings in range)

### Property Ln-_SMF7 (likely "Sunset Studio" — 5 bookings)
1. `042839d8` — Jul 3-13, "Airbnb — FEDERICA", platform=4HO817D5, src=email_only
2. `705d75e8` — Jul 5-8, "Oliwia Polak", platform=oYkPpXgo (Booking.com), src=email_only
3. `ad8e4ace` — Jul 5-8, "Booking.com Reservation", platform=oYkPpXgo, src=ical_only
4. `8d64cc09` — Jul 9-12, "Reserved - Angie", platform=939ayddu, src=ical_only
5. `38d90b7e` — Jul 10-12, "VRBO — Tarik Perkins", platform=n2dVmwfB, src=both

### Property nJnk4hr3 (likely "Morabeza" — 4 bookings)
1. `f80ce65d` — Jul 5-6, "Airbnb (Not available)", platform=eCyaTlnI, type=unavailable, src=ical_only
2. `666fb44f` — Jul 6-8, "Booking.com Reservation", platform=6rVvJgKe, src=ical_only
3. `bkng_594` — Jul 6-8, "Luigi Perrotta", platform=booking_, src=ical_only, NO icalUid
4. `k7TTr_Zu` — Jul 9-12, "Direct Booking — Tarik Perkins", platform=BzdKyVJo, src=ical_only

### Property ZI2Zy7Ou (likely "The Artiste's Boutique" — 2 bookings)
1. `b5213b80` — Jul 3-13, "Reserved", platform=RiVJhUt8 (Airbnb), src=ical_only
2. `a303fd35` — Jul 3-13, "Airbnb — Federica Nazzari", platform=RiVJhUt8, src=both

## Identified Duplicate Patterns

### Pattern 1: Email-only + iCal-only = same booking not merged
- `705d75e8` (email: "Oliwia Polak") and `ad8e4ace` (ical: "Booking.com Reservation") 
  → Same dates Jul 5-8, same platform oYkPpXgo. Should have been merged into one "both" record.
  
### Pattern 2: iCal "Reserved" + email enriched = same booking not merged  
- `b5213b80` (ical: "Reserved") and `a303fd35` (email+ical: "Airbnb — Federica Nazzari")
  → Same dates Jul 3-13, same platform RiVJhUt8. Should be one record.

### Pattern 3: Booking.com iCal generic + Booking.com scraper specific = not merged
- `666fb44f` (ical: "Booking.com Reservation") and `bkng_594` (ical: "Luigi Perrotta")
  → Same dates Jul 6-8, different platform IDs (6rVvJgKe vs booking_). 
  → bkng_594 has no icalUid — likely came from a different iCal feed or scraper.

## Root Cause

The merge logic in `getBookingsForProperty` (server/db.ts) merges by icalUid match OR 
date overlap + same platform. But these duplicates have:
- Different icalUids (email-generated vs iCal-generated)
- Sometimes different platformIds (booking_ vs the actual platform UUID)

The calendar timeline is showing ALL of these as separate entries because the frontend 
`getBookingsForProperty` composite query doesn't deduplicate them before rendering.

## Fix Strategy

The display layer (calendar timeline) should deduplicate bookings that:
1. Same property + same dates (within 1 day tolerance) + same platform → merge
2. Same property + same dates + one is "Reserved"/"Not available" and other has guest name → prefer the named one
3. Bookings with `bkng_` prefix IDs that match a real booking by date+property → hide the bkng_ one

Best approach: Fix the merge logic in `getBookingsForProperty` to be more aggressive about 
deduplication, OR add a post-query dedup step in the calendar timeline data fetching.
