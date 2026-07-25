/// <reference types="@types/google.maps" />

/**
 * LocationAutocomplete
 * Provides a text input with Google Places autocomplete suggestions.
 * Uses the same Manus Maps proxy as Map.tsx — no API key setup needed.
 *
 * Props:
 *   value          — controlled value
 *   onChange       — called with the raw text as the user types
 *   onPlaceSelect  — called when a suggestion is confirmed:
 *                    { address, mapsUrl, lat, lng }
 *   placeholder    — input placeholder
 *   disabled       — disables the input
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

// Shared promise so the script is only loaded once across all instances
let mapsLoadPromise: Promise<void> | null = null;

function loadMapsScript(): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

export interface PlaceResult {
  address: string;
  mapsUrl: string;
  lat?: number;
  lng?: number;
}

interface Suggestion {
  placeId: string;
  description: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Add location or address",
  disabled = false,
  className,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [mapsReady, setMapsReady] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesService = useRef<google.maps.places.PlacesService | null>(null);
  const dummyDiv = useRef<HTMLDivElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load Maps script once
  useEffect(() => {
    loadMapsScript()
      .then(() => setMapsReady(true))
      .catch(console.error);
  }, []);

  // Initialise services after script loads
  useEffect(() => {
    if (!mapsReady) return;
    if (!autocompleteService.current) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
    }
    if (!placesService.current) {
      if (!dummyDiv.current) {
        dummyDiv.current = document.createElement("div");
      }
      placesService.current = new window.google.maps.places.PlacesService(dummyDiv.current);
    }
  }, [mapsReady]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback((input: string) => {
    if (!autocompleteService.current || input.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    autocompleteService.current.getPlacePredictions(
      { input, types: ["establishment", "geocode"] },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(
            predictions.slice(0, 5).map(p => ({
              placeId: p.place_id,
              description: p.description,
            }))
          );
          setOpen(true);
          setActiveIdx(-1);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      }
    );
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(v), 250);
  };

  const selectSuggestion = useCallback((suggestion: Suggestion) => {
    setOpen(false);
    setSuggestions([]);
    onChange(suggestion.description);
    // Fetch place details for lat/lng
    if (!placesService.current) {
      onPlaceSelect({
        address: suggestion.description,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suggestion.description)}&query_place_id=${suggestion.placeId}`,
      });
      return;
    }
    placesService.current.getDetails(
      { placeId: suggestion.placeId, fields: ["formatted_address", "geometry", "place_id"] },
      (result, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && result) {
          const address = result.formatted_address || suggestion.description;
          const lat = result.geometry?.location?.lat();
          const lng = result.geometry?.location?.lng();
          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}&query_place_id=${suggestion.placeId}`;
          onChange(address);
          onPlaceSelect({ address, mapsUrl, lat, lng });
        } else {
          onPlaceSelect({
            address: suggestion.description,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(suggestion.description)}&query_place_id=${suggestion.placeId}`,
          });
        }
      }
    );
  }, [onChange, onPlaceSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {suggestions.map((s, idx) => (
            <button
              key={s.placeId}
              type="button"
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm flex items-start gap-2 transition-colors",
                idx === activeIdx
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60 text-popover-foreground"
              )}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="leading-snug">{s.description}</span>
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-border/50 flex justify-end">
            <span className="text-[10px] text-muted-foreground/60">Powered by Google Maps</span>
          </div>
        </div>
      )}
    </div>
  );
}
