"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface MentionItem {
  id: string;
  label: string;
  subtitle?: string;
}

interface MentionListProps {
  items: MentionItem[] | null; // null = loading
  command: (item: { id: string; label: string; type: string }) => void;
  type: "coffee" | "roaster";
}

export interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  function MentionList({ items, command, type }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const selectItem = (index: number) => {
      const item = items?.[index];
      if (item) {
        command({ id: item.id, label: item.label, type });
      }
    };

    const upHandler = () => {
      if (!items?.length) return;
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    };

    const downHandler = () => {
      if (!items?.length) return;
      setSelectedIndex((prev) => (prev + 1) % items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }
        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }
        if (event.key === "Enter") {
          enterHandler();
          return true;
        }
        return false;
      },
    }));

    // Loading state
    if (items === null) {
      return (
        <div className="mention-list bg-surface border-3 border-border p-2 brutal-shadow-sm">
          <div className="text-text-muted text-sm px-2 py-1">
            Searching...
          </div>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="mention-list bg-surface border-3 border-border p-2 brutal-shadow-sm">
          <div className="text-text-muted text-sm px-2 py-1">
            No matches found
          </div>
        </div>
      );
    }

    return (
      <div className="mention-list bg-surface border-3 border-border brutal-shadow-sm max-h-[200px] overflow-y-auto">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => { itemRefs.current[index] = el; }}
            className={`w-full text-left px-3 py-2 flex flex-col border-b border-border last:border-b-0 ${
              index === selectedIndex
                ? "bg-border text-white"
                : "bg-surface text-text hover:bg-surface-hover"
            }`}
            onClick={() => selectItem(index)}
          >
            <span className="font-bold text-sm truncate">
              {type === "coffee" ? "@" : "#"}
              {item.label}
            </span>
            {item.subtitle && (
              <span
                className={`text-xs truncate ${
                  index === selectedIndex ? "text-white/70" : "text-text-muted"
                }`}
              >
                {item.subtitle}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }
);
