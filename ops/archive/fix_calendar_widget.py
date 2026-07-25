with open("/home/ubuntu/geeves-shopping/client/src/pages/Home.tsx", "r") as f:
    content = f.read()

# Find and replace the upcoming section by locating the exact boundary
old_marker = '          <p className="text-xs text-muted-foreground font-medium mb-2">Upcoming (7 days)</p>'
new_marker = '          <p className="text-xs text-muted-foreground font-medium mb-2">Upcoming</p>'

if old_marker not in content:
    print("ERROR: marker not found")
    exit(1)

# Find the start of the section (the comment line before it)
section_start = content.find('        {/* Upcoming events */}\n        <div className="border-t pt-3">')
if section_start == -1:
    print("ERROR: section start not found")
    exit(1)

# Find the end of the section (the closing div before Shopping widget comment)
section_end_marker = '        </div>\n      </CardContent>\n    </Card>\n  );\n}\n\n// ─── Widget: Shopping'
section_end = content.find(section_end_marker, section_start)
if section_end == -1:
    print("ERROR: section end not found")
    exit(1)

old_section = content[section_start:section_end]
print("Found section, length:", len(old_section))
print("First 100 chars:", repr(old_section[:100]))

new_section = '''        {/* Upcoming events — vertical-coloured, sorted, scrollable */}
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground font-medium mb-2">Upcoming</p>
          {upcomingEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No upcoming events</p>
          ) : (
            <div className="flex flex-col gap-0 max-h-[180px] overflow-y-auto pr-0.5">
              {upcomingEvents.map((e: any) => {
                const start = new Date(e.startTime);
                const isEventToday = isSameDay(start, today);
                const isTomorrow = isSameDay(start, new Date(today.getTime() + 86400000));
                const dotColor: string = (e as any).verticalColor || "#2AAFA9";
                const mins = e.isAllDay ? 0 : Math.round((e.endTime - e.startTime) / 60000);
                const durationStr = e.isAllDay ? "All day" : mins < 60 ? `${mins}m` : mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
                const dayLabel = isEventToday ? "Today" : isTomorrow ? "Tomorrow" : start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
                return (
                  <div
                    key={e.id}
                    className="flex items-start gap-2 cursor-pointer hover:bg-accent/50 rounded px-1 py-1 transition-colors"
                    onClick={() => { const iso = start.toISOString().split("T")[0]; setLocation(`/calendar?view=day&date=${iso}`); }}
                  >
                    {/* Vertical colour bar */}
                    <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: dotColor, minHeight: "28px" }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate leading-tight">{e.title}</p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{dayLabel}</span>
                        {!e.isAllDay && (
                          <>
                            <span className="text-[10px] text-muted-foreground">\u00b7</span>
                            <span className="text-[10px] text-muted-foreground">{start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                          </>
                        )}
                        <span className="text-[10px] text-muted-foreground">\u00b7</span>
                        <span className="text-[10px] font-medium" style={{ color: dotColor }}>{durationStr}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>'''

content = content[:section_start] + new_section + content[section_end:]

with open("/home/ubuntu/geeves-shopping/client/src/pages/Home.tsx", "w") as f:
    f.write(content)
print("Done — section replaced successfully")
