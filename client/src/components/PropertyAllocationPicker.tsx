/**
 * PropertyAllocationPicker — Multi-vertical, multi-property expense split component.
 *
 * Supports cross-vertical + cross-property splitting per the Addendum to Round 2 Response.
 * Each allocation row has: verticalId, propertyId (nullable), splitAmount.
 * The sum of all splitAmounts must equal the total expense amount.
 *
 * Usage:
 *   <PropertyAllocationPicker
 *     totalAmount={1000}
 *     allocations={allocations}
 *     onChange={setAllocations}
 *   />
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, AlertCircle, CheckCircle2, Building2 } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Allocation {
  id: string; // local key for React rendering
  verticalId: string;
  propertyId: string | null;
  splitAmount: number;
}

interface PropertyAllocationPickerProps {
  totalAmount: number;
  allocations: Allocation[];
  onChange: (allocations: Allocation[]) => void;
  disabled?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PropertyAllocationPicker({
  totalAmount,
  allocations,
  onChange,
  disabled = false,
}: PropertyAllocationPickerProps) {
  const [entryMode, setEntryMode] = useState<"dollar" | "percentage">("dollar");

  // Fetch verticals and properties
  const verticalsQuery = trpc.verticals.list.useQuery(undefined, { retry: false });
  const propertiesQuery = trpc.properties.list.useQuery(
    { householdId: "" }, // Will be filtered client-side per vertical
    { retry: false, enabled: false }
  );
  // Use a broader properties fetch — get all properties for the household
  const householdQuery = trpc.household.getMyHousehold.useQuery(undefined, { retry: false });
  const householdId = householdQuery.data?.household?.id ?? "";
  const allPropertiesQuery = trpc.properties.list.useQuery(
    { householdId: householdId || "" },
    { retry: false, enabled: !!householdId }
  );

  const verticals = verticalsQuery.data ?? [];
  const allProperties = allPropertiesQuery.data ?? [];

  // Group properties by verticalId
  const propertiesByVertical = useMemo(() => {
    const map = new Map<string, typeof allProperties>();
    for (const prop of allProperties) {
      if (!prop.verticalId) continue;
      const existing = map.get(prop.verticalId) ?? [];
      existing.push(prop);
      map.set(prop.verticalId, existing);
    }
    return map;
  }, [allProperties]);

  // Compute totals
  const allocatedTotal = allocations.reduce((sum, a) => sum + (a.splitAmount || 0), 0);
  const remaining = totalAmount - allocatedTotal;
  const isBalanced = Math.abs(remaining) < 0.01;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function addAllocation() {
    const defaultVertical = verticals[0]?.id ?? "";
    onChange([
      ...allocations,
      {
        id: generateId(),
        verticalId: defaultVertical,
        propertyId: null,
        splitAmount: remaining > 0 ? parseFloat(remaining.toFixed(2)) : 0,
      },
    ]);
  }

  function removeAllocation(id: string) {
    onChange(allocations.filter((a) => a.id !== id));
  }

  function updateAllocation(id: string, updates: Partial<Allocation>) {
    onChange(
      allocations.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  }

  function handleAmountChange(id: string, value: string) {
    const num = parseFloat(value) || 0;
    if (entryMode === "percentage") {
      // Convert percentage to dollar amount
      const dollarAmount = parseFloat(((num / 100) * totalAmount).toFixed(2));
      updateAllocation(id, { splitAmount: dollarAmount });
    } else {
      updateAllocation(id, { splitAmount: parseFloat(num.toFixed(2)) });
    }
  }

  function distributeEvenly() {
    if (allocations.length === 0) return;
    const perRow = parseFloat((totalAmount / allocations.length).toFixed(2));
    // Last row gets the remainder to avoid rounding drift
    const updated = allocations.map((a, i) => ({
      ...a,
      splitAmount: i === allocations.length - 1
        ? parseFloat((totalAmount - perRow * (allocations.length - 1)).toFixed(2))
        : perRow,
    }));
    onChange(updated);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Property Allocation</label>
        <div className="flex items-center gap-2">
          {/* Entry mode toggle */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            <button
              type="button"
              className={`px-2.5 py-1 transition-colors ${entryMode === "dollar" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              onClick={() => setEntryMode("dollar")}
              disabled={disabled}
            >
              $
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 transition-colors ${entryMode === "percentage" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
              onClick={() => setEntryMode("percentage")}
              disabled={disabled}
            >
              %
            </button>
          </div>
          {allocations.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={distributeEvenly}
              disabled={disabled}
              className="text-xs h-7"
            >
              Split evenly
            </Button>
          )}
        </div>
      </div>

      {/* Allocation rows */}
      {allocations.map((allocation) => {
        const verticalProperties = propertiesByVertical.get(allocation.verticalId) ?? [];
        const hasProperties = verticalProperties.length > 0;
        const percentValue = totalAmount > 0
          ? ((allocation.splitAmount / totalAmount) * 100).toFixed(1)
          : "0.0";

        return (
          <div
            key={allocation.id}
            className="flex flex-col gap-2 p-3 rounded-lg border bg-card"
          >
            <div className="flex items-center gap-2">
              {/* Vertical selector */}
              <Select
                value={allocation.verticalId}
                onValueChange={(v) => updateAllocation(allocation.id, { verticalId: v, propertyId: null })}
                disabled={disabled}
              >
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Select vertical..." />
                </SelectTrigger>
                <SelectContent>
                  {verticals.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: v.color ?? undefined }}
                        />
                        {v.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Amount input */}
              <div className="relative w-28">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={entryMode === "dollar" ? allocation.splitAmount || "" : percentValue}
                  onChange={(e) => handleAmountChange(allocation.id, e.target.value)}
                  disabled={disabled}
                  className="h-9 pr-7 text-right"
                  placeholder="0.00"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {entryMode === "dollar" ? "$" : "%"}
                </span>
              </div>

              {/* Remove button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeAllocation(allocation.id)}
                disabled={disabled || allocations.length <= 1}
                className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Property selector (only shown if vertical has properties) */}
            {hasProperties && (
              <div className="flex items-center gap-2 pl-1">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Select
                  value={allocation.propertyId ?? "none"}
                  onValueChange={(v) => updateAllocation(allocation.id, { propertyId: v === "none" ? null : v })}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select property (optional)..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific property</SelectItem>
                    {verticalProperties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Per-row summary */}
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>
                {verticals.find((v) => v.id === allocation.verticalId)?.name ?? "—"}
                {allocation.propertyId && ` → ${verticalProperties.find((p) => p.id === allocation.propertyId)?.name ?? ""}`}
              </span>
              <span>
                ${allocation.splitAmount.toFixed(2)} ({percentValue}%)
              </span>
            </div>
          </div>
        );
      })}

      {/* Add allocation button */}
      <Button
        variant="outline"
        size="sm"
        onClick={addAllocation}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Allocation
      </Button>

      {/* Balance indicator */}
      <div className={`flex items-center gap-2 text-xs px-1 ${isBalanced ? "text-green-600" : "text-amber-600"}`}>
        {isBalanced ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Balanced — all ${totalAmount.toFixed(2)} allocated</span>
          </>
        ) : (
          <>
            <AlertCircle className="h-3.5 w-3.5" />
            <span>
              {remaining > 0
                ? `$${remaining.toFixed(2)} unallocated`
                : `$${Math.abs(remaining).toFixed(2)} over-allocated`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
