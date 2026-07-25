"""
Patch script: Replace the Properties page return statement (lines 1657-1912)
with a new sidebar+detail layout, preserving all sub-components and dialogs.
"""

NEW_RETURN = '''  return (
    <div className="h-full flex flex-col">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex-none px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your homes, rentals, and commercial properties.
            </p>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Property
          </Button>
        </div>

        {/* Stats bar */}
        {!isLoading && propertiesList.length > 0 && (
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              <strong className="text-foreground">{propertiesList.length}</strong>
              {propertiesList.length === 1 ? "property" : "properties"}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <strong className="text-foreground">
                {propertiesList.filter((p: any) => p.isActive).length}
              </strong>
              active
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-sky-400" />
              <strong className="text-foreground">
                {propertiesList.filter((p: any) => (p.type as string).startsWith("rental")).length}
              </strong>
              rentals
            </span>
          </div>
        )}

        {/* Integration attention badge */}
        {scrapeAuthWarningCount > 0 && (
          <Link href="/settings?tab=integrations">
            <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 cursor-pointer hover:bg-amber-500/15 transition-colors">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-medium flex-1">
                {scrapeAuthWarningCount === 1
                  ? "1 integration needs attention"
                  : `${scrapeAuthWarningCount} integrations need attention`}
              </span>
              <span className="text-xs text-amber-400/70">Manage in Settings →</span>
            </div>
          </Link>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : propertiesList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="border-dashed w-full max-w-md">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">No properties yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Add your primary residence, rental properties, or commercial spaces to keep everything organised.
              </p>
              <Button onClick={openCreate} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Property
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ── Split layout: sidebar + detail ─────────────────────────────── */
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar — property selector */}
          <div className="w-72 flex-none border-r border-border overflow-y-auto">
            <div className="p-3 space-y-1.5">
              {propertiesList.map((property: any) => {
                const isSelected = detailProperty?.id === property.id;
                const typeLabel = PROPERTY_TYPES.find((t) => t.value === property.type)?.label ?? property.type;
                return (
                  <button
                    key={property.id}
                    onClick={() => setDetailProperty(property)}
                    className={`w-full text-left rounded-xl p-3 transition-colors ${
                      isSelected
                        ? "bg-primary/10 border border-primary/30 text-foreground"
                        : "hover:bg-muted/60 border border-transparent text-foreground"
                    } ${!property.isActive ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{property.name}</span>
                        </div>
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                          (property.type as string).startsWith("rental_str")
                            ? "text-violet-400 bg-violet-400/10 border-violet-400/30"
                            : (property.type as string).startsWith("rental_ltr")
                            ? "text-sky-400 bg-sky-400/10 border-sky-400/30"
                            : (property.type as string) === "primary_residence"
                            ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                            : "text-muted-foreground bg-muted/40 border-border"
                        }`}>
                          {typeLabel}
                        </span>
                        {property.address && (
                          <div className="flex items-start gap-1 mt-1.5 text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-1">{property.address}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openEdit(property)}
                          title="Edit property"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmId(property.id)}
                          title="Delete property"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {!property.isActive && (
                      <span className="mt-1 inline-block text-[10px] text-muted-foreground">Inactive</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right panel — property detail */}
          <div className="flex-1 overflow-y-auto">
            {detailProperty ? (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">{detailProperty.name}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setDetailProperty(null)}
                    title="Close detail"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <PropertyDetail
                  property={detailProperty}
                  onClose={() => setDetailProperty(null)}
                  embedded
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a property from the sidebar to view details
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create/Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Property" : "Add Property"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="propName">Property Name *</Label>
              <Input
                id="propName"
                placeholder="e.g. Main House, Beach Cottage"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="propType">Property Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PropertyType })}>
                <SelectTrigger id="propType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propAddress">Address (optional)</Label>
              <Input
                id="propAddress"
                placeholder="123 Main St, City, State"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="propCountry">Country</Label>
                <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                  <SelectTrigger id="propCountry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">United States</SelectItem>
                    <SelectItem value="JM">Jamaica</SelectItem>
                    <SelectItem value="GB">United Kingdom</SelectItem>
                    <SelectItem value="CA">Canada</SelectItem>
                    <SelectItem value="AU">Australia</SelectItem>
                    <SelectItem value="NG">Nigeria</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                {form.country && form.country !== "US" && form.country !== "JM" && (
                  <p className="text-xs text-amber-400/80 mt-1">
                    ⚠ Sunday/Holiday prep rules currently only apply to US and JM properties.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="propTimezone">Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                  <SelectTrigger id="propTimezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern (New York)</SelectItem>
                    <SelectItem value="America/Chicago">Central (Chicago)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (Denver)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (Los Angeles)</SelectItem>
                    <SelectItem value="America/Jamaica">Jamaica (Kingston)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="Africa/Lagos">Lagos (WAT)</SelectItem>
                    <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="propertyEmail">Property Management Email (optional)</Label>
              <Input
                id="propertyEmail"
                type="email"
                placeholder="bookings@yourproperty.com"
                value={form.propertyEmail}
                onChange={(e) => setForm({ ...form, propertyEmail: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Booking confirmation emails sent here will be scanned for guest details and revenue in Phase 2.
              </p>
            </div>
            {editingId && (
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">Active</Label>
                <Switch
                  id="isActive"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingId
                ? "Save Changes"
                : "Add Property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Property</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this property? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
'''

with open('/home/ubuntu/geeves-shopping/client/src/pages/Properties.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the return statement of the main Properties function
# It starts at "  return (\n    <div className=\"p-6 space-y-6\">"
old_return_start = '  return (\n    <div className="p-6 space-y-6">'
idx = content.find(old_return_start)
if idx < 0:
    print('Return start not found')
    # Try to find it
    idx2 = content.find('  return (')
    # Find the last one (the main Properties function return)
    while True:
        next_idx = content.find('  return (', idx2 + 1)
        if next_idx < 0:
            break
        idx2 = next_idx
    print(f'Last return at: {idx2}')
    print(repr(content[idx2:idx2+100]))
else:
    print(f'Found return at: {idx}')
    # The return ends at the last "}" of the file
    end_idx = content.rfind('\n}')
    print(f'End at: {end_idx}')
    print(repr(content[end_idx:end_idx+5]))
    
    # Replace from the return statement to the end of the file
    content = content[:idx] + NEW_RETURN
    
    with open('/home/ubuntu/geeves-shopping/client/src/pages/Properties.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Saved')
