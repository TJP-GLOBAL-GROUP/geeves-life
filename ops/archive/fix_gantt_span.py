with open("/home/ubuntu/geeves-shopping/client/src/pages/Home.tsx", "r") as f:
    content = f.read()

# Fix 1: Add isFirstDayOfSpan helper after getEntryForDay
old_entry_fn = """  const ENTRY_PRIORITY: Record<string, number> = { checkin: 5, checkout: 4, booking: 3, block: 2, prep: 1, unavailable: 0 };
  const getEntryForDay = (day: Date) => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 86400000;
    const covering = entries.filter((e: any) => e.checkIn < dayEnd && e.checkOut > dayStart);
    if (covering.length === 0) return null;
    return covering.reduce((best: any, e: any) =>
      (ENTRY_PRIORITY[e.type] ?? 0) > (ENTRY_PRIORITY[best.type] ?? 0) ? e : best
    );
  };"""

new_entry_fn = """  const ENTRY_PRIORITY: Record<string, number> = { checkin: 5, checkout: 4, booking: 3, block: 2, prep: 1, unavailable: 0 };
  const getEntryForDay = (day: Date) => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 86400000;
    const covering = entries.filter((e: any) => e.checkIn < dayEnd && e.checkOut > dayStart);
    if (covering.length === 0) return null;
    return covering.reduce((best: any, e: any) =>
      (ENTRY_PRIORITY[e.type] ?? 0) > (ENTRY_PRIORITY[best.type] ?? 0) ? e : best
    );
  };
  // For multi-day block/unavailable/prep spans, only show label on the first visible day
  const isFirstDayOfSpan = (day: Date, entry: any) => {
    if (!entry) return true;
    if (entry.type !== "block" && entry.type !== "unavailable" && entry.type !== "prep") return true;
    const dayStart = day.getTime();
    const spanStart = new Date(entry.checkIn);
    spanStart.setHours(0, 0, 0, 0);
    return dayStart <= spanStart.getTime();
  };"""

if old_entry_fn in content:
    content = content.replace(old_entry_fn, new_entry_fn, 1)
    print("Fix 1 applied: isFirstDayOfSpan helper added")
else:
    print("ERROR: Fix 1 target not found")

# Fix 2: Use isFirstDay in labelContent
old_label = """          const labelContent = (() => {
            if (!entry || isToday) return null;
            if (isPrepDay) return <span className="text-[7px] font-bold" style={{ color: "#E8943A" }}>P</span>;
            if (isBlock) return <span className="text-[7px] font-bold text-red-400">\u2715</span>;
            if (isUnavail) return <span className="text-[7px] text-slate-400">\u2014</span>;"""

new_label = """          const isFirstDay = isFirstDayOfSpan(day, entry);
          const labelContent = (() => {
            if (!entry || isToday) return null;
            if (isPrepDay) return isFirstDay ? <span className="text-[7px] font-bold" style={{ color: "#E8943A" }}>P</span> : null;
            if (isBlock) return isFirstDay ? <span className="text-[7px] font-bold text-red-400">\u2715</span> : null;
            if (isUnavail) return isFirstDay ? <span className="text-[7px] text-slate-400">\u2014</span> : null;"""

if old_label in content:
    content = content.replace(old_label, new_label, 1)
    print("Fix 2 applied: isFirstDay used in labelContent")
else:
    print("ERROR: Fix 2 target not found")
    # Debug: show what's around the label
    idx = content.find("const labelContent = (() => {")
    if idx >= 0:
        print("Found labelContent at index", idx)
        print(repr(content[idx-100:idx+300]))

with open("/home/ubuntu/geeves-shopping/client/src/pages/Home.tsx", "w") as f:
    f.write(content)
print("Done")
