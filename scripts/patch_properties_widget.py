#!/usr/bin/env python3
"""
Patch Home.tsx: replace PropertiesWidget with carousel version.
- Adds useCallback, useRef to React import
- Adds keepPreviousData to @tanstack/react-query import
- Replaces PropertiesWidget function body (lines 1493-1775) with new carousel version
"""

import re

path = "/home/ubuntu/geeves-shopping/client/src/pages/Home.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# ── 1. Patch React import to add useCallback, useRef ──────────────────
content = re.sub(
    r'import \{ (useState, useMemo, useEffect) \} from "react";',
    'import { useState, useMemo, useEffect, useCallback, useRef } from "react";',
    content,
    count=1
)

# ── 2. Patch @tanstack/react-query import to add keepPreviousData ──────
content = re.sub(
    r'import \{ skipToken \} from "@tanstack/react-query";',
    'import { skipToken, keepPreviousData } from "@tanstack/react-query";',
    content,
    count=1
)

# ── 3. Replace entire PropertiesWidget function ────────────────────────
# Find the start and end of the function
start_marker = "function PropertiesWidget() {"
# End is the closing brace of the function (the line that is just "}")
# followed by the Tasks widget comment
end_marker = "// ─── Widget: Tasks (Coming Soon) ─────────────────────────────────────"

start_idx = content.index(start_marker)
end_idx = content.index(end_marker)

new_widget = '''function PropertiesWidget() {
  const [, setLocation] = useLocation();
  const [carouselIdx, setCarouselIdx] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);

  const householdQuery = trpc.household.getMyHousehold.useQuery();
  const householdId = householdQuery.data?.household?.id;

  const propertiesQuery = trpc.properties.list.useQuery(
    householdId ? { householdId } : skipToken,
    { staleTime: 60_000, placeholderData: keepPreviousData }
  );

  const verticalsQuery = trpc.verticals.list.useQuery(
    undefined,
    { staleTime: 60000 }
  );

  const propertiesList = propertiesQuery.data || [];
  const verticals = verticalsQuery.data || [];

  // Build verticalId → color map
  const verticalColorMap = new Map<string, string>();
  verticals.forEach((v: any) => verticalColorMap.set(v.id, v.color || "#2AAFA9"));

  const isLoading = householdQuery.isLoading || propertiesQuery.isLoading;

  // Clamp carousel index when properties list changes
  const clampedIdx = propertiesList.length > 0 ? Math.min(carouselIdx, propertiesList.length - 1) : 0;

  const goTo = useCallback((idx: number) => {
    setCarouselIdx(Math.max(0, Math.min(idx, propertiesList.length - 1)));
  }, [propertiesList.length]);

  // Touch swipe handlers for the carousel
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    swipeStartX.current = null;
    swipeStartY.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(clampedIdx + (dx < 0 ? 1 : -1));
    }
  }, [clampedIdx, goTo]);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4" style={{ color: "#E8943A" }} /> Properties
          {propertiesList.length > 1 && (
            <span className="text-[10px] text-muted-foreground font-normal">
              {clampedIdx + 1}/{propertiesList.length}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          {propertiesList.length > 1 && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={clampedIdx === 0} onClick={() => goTo(clampedIdx - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={clampedIdx === propertiesList.length - 1} onClick={() => goTo(clampedIdx + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={() => setLocation("/properties")}>
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : propertiesList.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">No properties added yet.</p>
            <Button variant="link" size="sm" className="text-xs h-6 mt-1" onClick={() => setLocation("/properties")}>
              Add a property
            </Button>
          </div>
        ) : (
          <>
            {/* Carousel: one property at a time */}
            <div
              ref={carouselRef}
              className="touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {(() => {
                const prop = propertiesList[clampedIdx];
                if (!prop) return null;
                const verticalColor = prop.verticalId ? (verticalColorMap.get(prop.verticalId) || "#2AAFA9") : "#2AAFA9";
                const isSTR = ["rental_str", "vacation"].includes(prop.type);
                const isLTR = prop.type === "rental_ltr";
                return (
                  <div key={prop.id}>
                    {/* Property type badge + address */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: verticalColor }} />
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">
                        {isSTR ? "Short-term Rental" : isLTR ? "Long-term Rental" : prop.type?.replace(/_/g, " ") || "Property"}
                      </span>
                      {prop.address && (
                        <span className="text-[9px] text-muted-foreground truncate ml-auto flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />{prop.address}
                        </span>
                      )}
                    </div>

                    {/* Gantt timeline for STR */}
                    {isSTR && (
                      <PropertyBookingTimeline
                        property={prop}
                        verticalColor={verticalColor}
                      />
                    )}

                    {/* LTR summary row */}
                    {isLTR && (
                      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{prop.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{prop.address || "No address"}</p>
                        </div>
                        {prop.monthlyRent && (
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold">{formatCurrency(parseFloat(prop.monthlyRent), prop.rentCurrency || "USD")}</p>
                            <p className="text-[10px] text-muted-foreground">/ month</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Other property type */}
                    {!isSTR && !isLTR && (
                      <div className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 mb-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <p className="text-xs font-medium truncate">{prop.name}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Dot pagination */}
            {propertiesList.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 -mt-1">
                {propertiesList.map((_: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setCarouselIdx(i)}
                    className={`rounded-full transition-all ${
                      i === clampedIdx
                        ? "h-1.5 w-4 bg-primary"
                        : "h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        )}

      </CardContent>
    </Card>
  );
}

'''

content = content[:start_idx] + new_widget + content[end_idx:]

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

# Verify
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()
print(f"Done. Total lines: {len(lines)}")
for term in ["useCallback", "useRef", "keepPreviousData", "carouselIdx", "handleTouchStart", "dot pagination"]:
    found = any(term in l for l in lines)
    print(f"  {term}: {'OK' if found else 'MISSING'}")
