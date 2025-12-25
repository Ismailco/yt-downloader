"use client";

import { useMemo } from "react";
import Image from "next/image";
import { PlaylistSelectorProps } from "@/types";

export default function PlaylistSelector({
  items = [],
  selectedIds = [],
  onChange,
  className = "",
}: PlaylistSelectorProps) {
  const selectedCount = selectedIds.length;
  const totalItems = items.length;
  const allSelected = useMemo(
    () => totalItems > 0 && selectedCount === totalItems,
    [totalItems, selectedCount],
  );
  const partiallySelected = useMemo(
    () => selectedCount > 0 && selectedCount < totalItems,
    [selectedCount, totalItems],
  );

  const toggleItem = (id: string) => {
    if (!onChange) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((itemId) => itemId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleSelectAll = () => {
    if (allSelected) {
      onChange?.([]);
      return;
    }
    onChange?.(items.map((item) => item.id));
  };

  if (!items.length) {
    return (
      <div
        className={`ui-card bg-card-muted p-6 ${className}`}
      >
        <p className="text-sm text-muted">
          Analyze a playlist to pick specific videos.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Playlist Items</h3>
          <p className="text-xs text-muted">
            Selected {selectedCount}/{totalItems || 0}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSelectAll}
          className="ui-link text-sm"
        >
          {allSelected ? "Clear selection" : "Select all"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const checked = selectedIds.includes(item.id);
          return (
            <label
              key={item.id}
              className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 transition focus-within:ring-2 focus-within:ring-ring/20 ${
                checked
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-card-muted"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                ref={(checkbox) => {
                  if (checkbox)
                    checkbox.indeterminate =
                      !checked &&
                      partiallySelected &&
                      selectedIds.includes(item.id);
                }}
                onChange={() => toggleItem(item.id)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="text-xs text-muted">
                  {item.channelTitle || "Unknown channel"} •{" "}
                  {item.duration || "—"}
                </p>
              </div>
              {item.thumbnail && (
                <Image
                  src={item.thumbnail}
                  alt={item.title}
                  width={96}
                  height={56}
                  className="h-14 w-24 rounded-lg object-cover"
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
