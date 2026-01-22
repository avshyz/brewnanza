"use client";

import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Mention from "@tiptap/extension-mention";
import { forwardRef, useImperativeHandle, useEffect, useState, useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { MentionList, MentionListHandle } from "./MentionList";
import tippy, { Instance as TippyInstance } from "tippy.js";
import "tippy.js/dist/tippy.css";
import Fuse from "fuse.js";

// Single-line document that only allows one paragraph
const SingleLineDocument = Document.extend({
  content: "paragraph",
});

// Create uniquely named extensions for @ and # mentions
const CoffeeMention = Mention.extend({ name: "coffeeMention" });
const RoasterMention = Mention.extend({ name: "roasterMention" });

export interface SearchInputHandle {
  focus: () => void;
  clear: () => void;
  getText: () => string;
  getCoffeeId: () => string | undefined;
  getRoasterId: () => string | undefined;
}

interface SearchInputProps {
  placeholder?: string;
  onSubmit?: (text: string, coffeeId?: string, roasterId?: string) => void;
  className?: string;
  autoFocus?: boolean;
}

export const SearchInput = forwardRef<SearchInputHandle, SearchInputProps>(
  function SearchInput({ placeholder = "Search...", onSubmit, className = "", autoFocus = false }, ref) {
    const [coffeeId, setCoffeeId] = useState<string | undefined>();
    const [roasterId, setRoasterId] = useState<string | undefined>();

    // Preload all coffees and roasters for instant fuzzy search
    const allCoffees = useQuery(api.search.autocompleteCoffees, { query: "", limit: 1000 });
    const allRoasters = useQuery(api.search.autocompleteRoasters, { query: "", limit: 1000 });

    // Create Fuse instances for fuzzy search
    const coffeeFuse = useMemo(() => {
      if (!allCoffees) return null;
      return new Fuse(allCoffees, {
        keys: ["name", "roasterName"],
        threshold: 0.4,
        includeScore: true,
      });
    }, [allCoffees]);

    const roasterFuse = useMemo(() => {
      if (!allRoasters) return null;
      return new Fuse(allRoasters, {
        keys: ["name"],
        threshold: 0.4,
        includeScore: true,
      });
    }, [allRoasters]);

    // Refs to track loading state for immediate popup display
    const coffeesLoadingRef = useRef(true);
    const roastersLoadingRef = useRef(true);

    useEffect(() => {
      coffeesLoadingRef.current = allCoffees === undefined;
    }, [allCoffees]);

    useEffect(() => {
      roastersLoadingRef.current = allRoasters === undefined;
    }, [allRoasters]);

    // Create suggestion for coffee mentions (@)
    const coffeeSuggestion = useMemo(() => ({
      char: "@",
      allowSpaces: true,
      items: ({ query }: { query: string }) => {
        // Return empty array while loading
        if (!coffeeFuse || coffeesLoadingRef.current) return [];

        const searchQuery = query || "";
        if (!searchQuery) {
          // Return first 8 items when no query
          return allCoffees!.slice(0, 8).map((r) => ({
            id: r.id,
            label: r.name,
            subtitle: r.roasterName,
            type: "coffee",
          }));
        }

        // Use Fuse for fuzzy search
        const results = coffeeFuse.search(searchQuery, { limit: 8 });
        return results.map((r) => ({
          id: r.item.id,
          label: r.item.name,
          subtitle: r.item.roasterName,
          type: "coffee",
        }));
      },
      render: () => {
        let component: ReactRenderer<MentionListHandle> | null = null;
        let popup: TippyInstance[] | null = null;

        return {
          onStart: (props: any) => {
            component = new ReactRenderer(MentionList, {
              props: { ...props, type: "coffee" },
              editor: props.editor,
            });
            if (!props.clientRect) return;
            popup = tippy("body", {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
              theme: "dropdown",
            });
          },
          onUpdate: (props: any) => {
            component?.updateProps({ ...props, type: "coffee" });
            if (props.clientRect && popup?.[0]) {
              popup[0].setProps({ getReferenceClientRect: props.clientRect });
            }
          },
          onKeyDown: (props: any) => {
            if (props.event.key === "Escape") {
              popup?.[0]?.hide();
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            popup?.[0]?.destroy();
            component?.destroy();
          },
        };
      },
    }), [coffeeFuse, allCoffees]);

    // Create suggestion for roaster mentions (#)
    const roasterSuggestion = useMemo(() => ({
      char: "#",
      allowSpaces: true,
      items: ({ query }: { query: string }) => {
        // Return empty array while loading
        if (!roasterFuse || roastersLoadingRef.current) return [];

        const searchQuery = query || "";
        if (!searchQuery) {
          // Return first 8 items when no query
          return allRoasters!.slice(0, 8).map((r) => ({
            id: r.id,
            label: r.name,
            type: "roaster",
          }));
        }

        // Use Fuse for fuzzy search
        const results = roasterFuse.search(searchQuery, { limit: 8 });
        return results.map((r) => ({
          id: r.item.id,
          label: r.item.name,
          type: "roaster",
        }));
      },
      render: () => {
        let component: ReactRenderer<MentionListHandle> | null = null;
        let popup: TippyInstance[] | null = null;

        return {
          onStart: (props: any) => {
            component = new ReactRenderer(MentionList, {
              props: { ...props, type: "roaster" },
              editor: props.editor,
            });
            if (!props.clientRect) return;
            popup = tippy("body", {
              getReferenceClientRect: props.clientRect,
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: "manual",
              placement: "bottom-start",
              theme: "dropdown",
            });
          },
          onUpdate: (props: any) => {
            component?.updateProps({ ...props, type: "roaster" });
            if (props.clientRect && popup?.[0]) {
              popup[0].setProps({ getReferenceClientRect: props.clientRect });
            }
          },
          onKeyDown: (props: any) => {
            if (props.event.key === "Escape") {
              popup?.[0]?.hide();
              return true;
            }
            return component?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => {
            popup?.[0]?.destroy();
            component?.destroy();
          },
        };
      },
    }), [roasterFuse, allRoasters]);

    const editor = useEditor({
      extensions: [
        SingleLineDocument,
        Paragraph,
        Text,
        CoffeeMention.configure({
          HTMLAttributes: { class: "mention mention-coffee" },
          suggestion: coffeeSuggestion,
        }),
        RoasterMention.configure({
          HTMLAttributes: { class: "mention mention-roaster" },
          suggestion: roasterSuggestion,
        }),
      ],
      content: "",
      editorProps: {
        attributes: {
          class: "outline-none",
        },
      },
      onUpdate: ({ editor }) => {
        // Extract mention data from editor JSON
        const json = editor.getJSON();
        let foundCoffeeId: string | undefined;
        let foundRoasterId: string | undefined;

        function walk(node: any) {
          if (node.type === "coffeeMention" && node.attrs?.id) {
            foundCoffeeId = node.attrs.id;
          } else if (node.type === "roasterMention" && node.attrs?.id) {
            foundRoasterId = node.attrs.id;
          }
          if (node.content) {
            node.content.forEach(walk);
          }
        }
        walk(json);

        setCoffeeId(foundCoffeeId);
        setRoasterId(foundRoasterId);
      },
      autofocus: autoFocus,
    }, [coffeeSuggestion, roasterSuggestion]);

    // Handle Enter key for submit
    useEffect(() => {
      if (!editor) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
          const hasMentionPopup = document.querySelector(".tippy-box");
          if (!hasMentionPopup) {
            event.preventDefault();
            const text = editor.getText().trim();
            onSubmit?.(text, coffeeId, roasterId);
          }
        }
      };

      const dom = editor.view.dom;
      dom.addEventListener("keydown", handleKeyDown);
      return () => dom.removeEventListener("keydown", handleKeyDown);
    }, [editor, onSubmit, coffeeId, roasterId]);

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      clear: () => {
        editor?.commands.clearContent();
        setCoffeeId(undefined);
        setRoasterId(undefined);
      },
      getText: () => editor?.getText() ?? "",
      getCoffeeId: () => coffeeId,
      getRoasterId: () => roasterId,
    }));

    return (
      <div className={`search-input-wrapper relative ${className}`}>
        <EditorContent editor={editor} className="search-input-editor" />
        {editor?.isEmpty && (
          <div className="search-input-placeholder pointer-events-none absolute inset-0 flex items-center px-4 text-text-muted font-medium">
            {placeholder}
          </div>
        )}
      </div>
    );
  }
);
