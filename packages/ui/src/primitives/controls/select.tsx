import { Check, ChevronDown } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../cn.js";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  value?: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

interface PopupPosition {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
}

function nextEnabled(options: readonly SelectOption[], current: number, delta: 1 | -1): number {
  if (options.length === 0) return -1;
  for (let step = 1; step <= options.length; step += 1) {
    const index = (current + delta * step + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

function edgeEnabled(options: readonly SelectOption[], fromEnd: boolean): number {
  if (fromEnd) {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index]?.disabled) return index;
    }
    return -1;
  }
  return options.findIndex((option) => !option.disabled);
}

export function Select({
  id,
  value,
  options,
  onValueChange,
  label,
  placeholder = "Select...",
  disabled,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid
}: SelectProps): ReactNode {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<PopupPosition>();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  function placePopup(): void {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const openAbove = below < 160 && above > below;
    const maxHeight = Math.max(96, Math.min(240, openAbove ? above : below));
    const width = Math.min(Math.max(rect.width, 144), window.innerWidth - margin * 2);
    setPosition({
      left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
      top: openAbove ? undefined : rect.bottom + 4,
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      width,
      maxHeight
    });
  }

  function openPopup(preferredIndex = selectedIndex): void {
    if (disabled) return;
    const initial =
      preferredIndex >= 0 && !options[preferredIndex]?.disabled
        ? preferredIndex
        : edgeEnabled(options, false);
    setActiveIndex(initial);
    setOpen(true);
  }

  function closePopup(restoreFocus = true): void {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(index: number): void {
    const option = options[index];
    if (!option || option.disabled) return;
    onValueChange(option.value);
    closePopup();
  }

  function handleTypeahead(character: string): void {
    typeaheadRef.current += character.toLocaleLowerCase();
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadTimerRef.current = setTimeout(() => {
      typeaheadRef.current = "";
    }, 600);
    const match = options.findIndex(
      (option) =>
        !option.disabled && option.label.toLocaleLowerCase().startsWith(typeaheadRef.current)
    );
    if (match >= 0) setActiveIndex(match);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openPopup();
      } else {
        setActiveIndex((current) =>
          nextEnabled(
            options,
            current < 0 ? selectedIndex : current,
            event.key === "ArrowDown" ? 1 : -1
          )
        );
      }
    } else if (open && event.key === "Home") {
      event.preventDefault();
      setActiveIndex(edgeEnabled(options, false));
    } else if (open && event.key === "End") {
      event.preventDefault();
      setActiveIndex(edgeEnabled(options, true));
    } else if (open && event.key === "Enter") {
      event.preventDefault();
      choose(activeIndex);
    } else if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePopup();
    } else if (
      open &&
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      handleTypeahead(event.key);
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    placePopup();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const reposition = (): void => placePopup();
    const closeFromPointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        closePopup(false);
      }
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("mousedown", closeFromPointer);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("mousedown", closeFromPointer);
    };
  }, [open]);

  useEffect(() => {
    const option = optionRefs.current[activeIndex];
    if (open && activeIndex >= 0 && typeof option?.scrollIntoView === "function") {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    },
    []
  );

  const popup =
    open && position
      ? createPortal(
          <div
            ref={popupRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="fixed z-[80] overflow-auto rounded-[4px] border border-border bg-popover p-1 shadow-lg"
            style={position}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-${index}`}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => choose(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left font-mono text-[10px] text-foreground outline-none",
                  activeIndex === index && "bg-accent",
                  option.disabled && "cursor-not-allowed text-quiet-foreground"
                )}
              >
                <Check
                  className={cn(
                    "h-2.5 w-2.5 shrink-0",
                    option.value === value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onClick={() => (open ? closePopup() : openPopup())}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex min-h-7 w-full items-center gap-2 rounded-[3px] border border-border bg-secondary px-2 py-1 text-left font-mono text-[10px] outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45",
          className
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected ? "text-foreground" : "text-quiet-foreground"
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
      </button>
      {popup}
    </>
  );
}
