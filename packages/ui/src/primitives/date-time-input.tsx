import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../cn.js";

export type DateTimeInputKind = "date" | "time" | "datetime-local";

export interface DateTimeInputProps {
  id?: string;
  kind: DateTimeInputKind;
  /** Matches the exact string shape the native input this replaces used to produce, so no
   * downstream (filter query) code needed to change: "YYYY-MM-DD", "HH:MM", or
   * "YYYY-MM-DDTHH:MM". Empty string means no value. */
  value: string;
  onChange: (value: string) => void;
  /** Fires on Enter from the time segments - FilterBar wires this to its own Apply action, since a
   * calendar day click already commits the date half by itself. */
  onEnter?: () => void;
  autoFocus?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDatePart(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseTimePart(value: string): { hour: number; minute: number } | null {
  const match = /(\d{2}):(\d{2})/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function CalendarGrid({
  selected,
  onSelect
}: {
  selected: DateParts | null;
  onSelect: (parts: DateParts) => void;
}): ReactNode {
  const today = new Date();
  const [viewYear, setViewYear] = useState(selected?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.month ?? today.getMonth() + 1);

  function changeMonth(delta: number): void {
    let month = viewMonth + delta;
    let year = viewYear;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    setViewMonth(month);
    setViewYear(year);
  }

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array<null>(startWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1)
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="w-60 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="font-mono text-[11px] text-foreground">
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((day) => (
          <span key={day} className="font-mono text-[9px] text-quiet-foreground">
            {day}
          </span>
        ))}
        {cells.map((day, index) => {
          if (day === null) return <span key={index} />;
          const isSelected =
            selected?.year === viewYear && selected.month === viewMonth && selected.day === day;
          const isToday =
            today.getFullYear() === viewYear &&
            today.getMonth() + 1 === viewMonth &&
            today.getDate() === day;
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect({ year: viewYear, month: viewMonth, day })}
              className={cn(
                "rounded-[2px] py-1 font-mono text-[10px]",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "text-primary hover:bg-accent"
                    : "text-foreground/80 hover:bg-accent"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DatePicker({
  id,
  value,
  onChange,
  autoFocus,
  ariaDescribedBy,
  ariaInvalid
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const parts = parseDatePart(value);
  const label = parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : "Select date...";

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        autoFocus={autoFocus}
        onClick={() => setOpen((current) => !current)}
        aria-label="Choose date"
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-[3px] border border-border bg-secondary px-2 py-1.5 text-left font-mono text-[11px] outline-none focus:border-primary",
          parts ? "text-foreground" : "text-quiet-foreground"
        )}
      >
        <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
              }
            }}
            className="absolute left-0 top-full z-50 mt-1 rounded-[4px] border border-border bg-popover shadow-lg"
          >
            <CalendarGrid
              selected={parts}
              onSelect={(next) => {
                onChange(`${next.year}-${pad(next.month)}-${pad(next.day)}`);
                setOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TimeSegments({
  id,
  value,
  onChange,
  onEnter,
  autoFocus,
  ariaDescribedBy,
  ariaInvalid
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}): ReactNode {
  const [hour, setHour] = useState(() => {
    const parts = parseTimePart(value);
    return parts ? pad(parts.hour) : "";
  });
  const [minute, setMinute] = useState(() => {
    const parts = parseTimePart(value);
    return parts ? pad(parts.minute) : "";
  });
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  // Re-sync from outside changes (e.g. the drawer/popover reopening with a different draft).
  useEffect(() => {
    const parts = parseTimePart(value);
    setHour(parts ? pad(parts.hour) : "");
    setMinute(parts ? pad(parts.minute) : "");
  }, [value]);

  function commit(nextHour: string, nextMinute: string): void {
    if (nextHour.length === 2 && nextMinute.length === 2) {
      onChange(`${pad(Math.min(23, Number(nextHour)))}:${pad(Math.min(59, Number(nextMinute)))}`);
    } else {
      onChange("");
    }
  }

  function handleHour(raw: string): void {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    setHour(digits);
    commit(digits, minute);
    if (digits.length === 2) minuteRef.current?.focus();
  }

  function handleMinute(raw: string): void {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    setMinute(digits);
    commit(hour, digits);
  }

  return (
    <div
      id={id}
      role="group"
      aria-label="Time"
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      className="flex items-center gap-1 rounded-[3px] border border-border bg-secondary px-2 py-1.5 focus-within:border-primary"
    >
      <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
      <input
        ref={hourRef}
        aria-label="Hour"
        value={hour}
        onChange={(event) => handleHour(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
          if (event.key === "ArrowRight" && hour.length === 2) minuteRef.current?.focus();
        }}
        placeholder="HH"
        inputMode="numeric"
        autoFocus={autoFocus}
        className="w-5 bg-transparent text-center font-mono text-[11px] text-foreground outline-none placeholder:text-quiet-foreground"
      />
      <span className="text-muted-foreground">:</span>
      <input
        ref={minuteRef}
        aria-label="Minute"
        value={minute}
        onChange={(event) => handleMinute(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
          if (event.key === "Backspace" && minute === "") hourRef.current?.focus();
          if (event.key === "ArrowLeft" && minute === "") hourRef.current?.focus();
        }}
        placeholder="MM"
        inputMode="numeric"
        className="w-5 bg-transparent text-center font-mono text-[11px] text-foreground outline-none placeholder:text-quiet-foreground"
      />
    </div>
  );
}

/**
 * A themed date/time/datetime-local picker replacing the browser's native `<input
 * type="date"|"time"|"datetime-local">` in FilterBar's value step - the native control's own OS
 * chrome (light-mode-only on some platforms, cramped placeholder text) didn't match this app's
 * dark, dense IDE styling. Produces the exact same value shape the native input did
 * ("YYYY-MM-DD" / "HH:MM" / "YYYY-MM-DDTHH:MM"), so no downstream filter-query code changed.
 */
export function DateTimeInput({
  id,
  kind,
  value,
  onChange,
  onEnter,
  autoFocus,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid
}: DateTimeInputProps): ReactNode {
  if (kind === "time") {
    return (
      <TimeSegments
        id={id}
        value={value}
        onChange={onChange}
        onEnter={onEnter}
        autoFocus={autoFocus}
        ariaDescribedBy={ariaDescribedBy}
        ariaInvalid={ariaInvalid}
      />
    );
  }

  if (kind === "date") {
    return (
      <DatePicker
        id={id}
        value={value}
        onChange={onChange}
        autoFocus={autoFocus}
        ariaDescribedBy={ariaDescribedBy}
        ariaInvalid={ariaInvalid}
      />
    );
  }

  const [datePart = "", timePart = ""] = value ? value.split("T") : [];

  return (
    <div
      id={id}
      role="group"
      aria-label="Date and time"
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      className="flex flex-col gap-1.5"
    >
      <DatePicker
        value={datePart}
        autoFocus={autoFocus}
        onChange={(nextDate) => {
          if (!nextDate) {
            onChange("");
            return;
          }
          onChange(`${nextDate}T${timePart || "00:00"}`);
        }}
      />
      <TimeSegments
        value={timePart}
        onEnter={onEnter}
        onChange={(nextTime) => onChange(datePart && nextTime ? `${datePart}T${nextTime}` : "")}
      />
    </div>
  );
}
