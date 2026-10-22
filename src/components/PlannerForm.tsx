"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CURRENCIES, EVENT_TYPES, LIMITS, PRIORITIES, SETTINGS, VENUE_COSTS, isOneOf,
  type FieldErrors, type PlanInput, type Priority,
} from "@/domain/types";

const EVENT_LABELS = { wedding: "Wedding", birthday: "Birthday", community: "Community event" } as const;
const PRIORITY_LABELS: Record<Priority, string> = {
  food: "Food & drink", venue: "Venue", decor: "Décor", entertainment: "Entertainment",
  photography: "Photo & video", "guest-comfort": "Guest comfort",
};
const SETTING_LABELS = { indoor: "Indoor", outdoor: "Outdoor", either: "Either / mixed" } as const;
const VENUE_LABELS = { paid: "I need to pay for a venue", "free-or-owned": "Venue is free or already ours" } as const;

interface Props {
  busy: boolean;
  fieldErrors: FieldErrors;
  formError: string | null;
  onSubmit: (input: PlanInput) => void;
}

function describedBy(name: string, hint: boolean, error?: string): string | undefined {
  const ids = [hint ? `${name}-hint` : "", error ? `${name}-error` : ""].filter(Boolean).join(" ");
  return ids || undefined;
}

function Field({ name, label, hint, error, children }: { name: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={`field-${name}`}>{label}</label>
      {hint && <p id={`${name}-hint`} className="hint">{hint}</p>}
      {children}
      {error && <p id={`${name}-error`} className="field-error">{error}</p>}
    </div>
  );
}

export function PlannerForm({ busy, fieldErrors, formError, onSubmit }: Props) {
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [notesLength, setNotesLength] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const errors = Object.entries(fieldErrors) as Array<[keyof PlanInput, string]>;

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0 || formError) summary.current?.focus();
  }, [fieldErrors, formError]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const eventType = data.get("eventType");
    const currency = data.get("currency");
    const venueCost = data.get("venueCost");
    const setting = data.get("setting");
    if (!isOneOf(EVENT_TYPES, eventType) || !isOneOf(CURRENCIES, currency) || !isOneOf(VENUE_COSTS, venueCost) || !isOneOf(SETTINGS, setting)) return;
    onSubmit({
      eventType, currency, venueCost, setting, priorities,
      eventDate: String(data.get("eventDate") ?? ""),
      guestCount: Number(data.get("guestCount")),
      budget: Number(data.get("budget")),
      city: String(data.get("city") ?? ""),
      notes: String(data.get("notes") ?? ""),
    });
  }

  function togglePriority(priority: Priority, checked: boolean) {
    setPriorities((current) => (checked ? [...current, priority] : current.filter((p) => p !== priority)));
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={busy}>
      {(errors.length > 0 || formError) && (
        <div ref={summary} tabIndex={-1} role="alert" className="error-summary">
          <h3>{errors.length > 0 ? "Please check these details" : "We couldn’t build your plan"}</h3>
          {formError && <p>{formError}</p>}
          {errors.length > 0 && (
            <ul>
              {errors.map(([name, message]) => (
                <li key={name}><a href={`#field-${name}`}>{message}</a></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset id="field-eventType" aria-describedby={describedBy("eventType", false, fieldErrors.eventType)}>
        <legend>What are you celebrating?</legend>
        <div className="choices">
          {EVENT_TYPES.map((type) => (
            <label key={type} className="choice">
              <input type="radio" name="eventType" value={type} required />
              <span>{EVENT_LABELS[type]}</span>
            </label>
          ))}
        </div>
        {fieldErrors.eventType && <p id="eventType-error" className="field-error">{fieldErrors.eventType}</p>}
      </fieldset>

      <div className="grid">
        <Field name="eventDate" label="Event date" error={fieldErrors.eventDate}>
          <input id="field-eventDate" name="eventDate" type="date" required autoComplete="off"
            aria-invalid={Boolean(fieldErrors.eventDate)} aria-describedby={describedBy("eventDate", false, fieldErrors.eventDate)} />
        </Field>
        <Field name="guestCount" label="Number of guests" hint={`Up to ${LIMITS.guestMax}`} error={fieldErrors.guestCount}>
          <input id="field-guestCount" name="guestCount" type="number" inputMode="numeric" required min={1} max={LIMITS.guestMax} step={1} defaultValue={100}
            aria-invalid={Boolean(fieldErrors.guestCount)} aria-describedby={describedBy("guestCount", true, fieldErrors.guestCount)} />
        </Field>
        <Field name="budget" label="Total budget" hint="Whole numbers, everything included" error={fieldErrors.budget}>
          <input id="field-budget" name="budget" type="number" inputMode="numeric" required min={LIMITS.budgetMin} max={LIMITS.budgetMax} step={1}
            aria-invalid={Boolean(fieldErrors.budget)} aria-describedby={describedBy("budget", true, fieldErrors.budget)} />
        </Field>
        <Field name="currency" label="Currency" error={fieldErrors.currency}>
          <select id="field-currency" name="currency" defaultValue="INR" aria-invalid={Boolean(fieldErrors.currency)} aria-describedby={describedBy("currency", false, fieldErrors.currency)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field name="city" label="City (optional)" error={fieldErrors.city}>
          <input id="field-city" name="city" type="text" maxLength={LIMITS.cityMax} autoComplete="address-level2"
            aria-invalid={Boolean(fieldErrors.city)} aria-describedby={describedBy("city", false, fieldErrors.city)} />
        </Field>
        <Field name="setting" label="Indoor or outdoor?" error={fieldErrors.setting}>
          <select id="field-setting" name="setting" defaultValue="either" aria-invalid={Boolean(fieldErrors.setting)} aria-describedby={describedBy("setting", false, fieldErrors.setting)}>
            {SETTINGS.map((s) => <option key={s} value={s}>{SETTING_LABELS[s]}</option>)}
          </select>
        </Field>
      </div>

      <fieldset id="field-venueCost" aria-describedby={describedBy("venueCost", false, fieldErrors.venueCost)}>
        <legend>Venue</legend>
        <div className="choices">
          {VENUE_COSTS.map((v) => (
            <label key={v} className="choice">
              <input type="radio" name="venueCost" value={v} defaultChecked={v === "paid"} />
              <span>{VENUE_LABELS[v]}</span>
            </label>
          ))}
        </div>
        {fieldErrors.venueCost && <p id="venueCost-error" className="field-error">{fieldErrors.venueCost}</p>}
      </fieldset>

      <fieldset id="field-priorities" aria-describedby={describedBy("priorities", true, fieldErrors.priorities)}>
        <legend>What matters most? (up to {LIMITS.maxPriorities})</legend>
        <p id="priorities-hint" className="hint">We shift budget toward what you pick.</p>
        <div className="choices">
          {PRIORITIES.map((p) => {
            const checked = priorities.includes(p);
            return (
              <label key={p} className="choice">
                <input type="checkbox" name="priorities" value={p} checked={checked}
                  disabled={!checked && priorities.length >= LIMITS.maxPriorities}
                  onChange={(e) => togglePriority(p, e.target.checked)} />
                <span>{PRIORITY_LABELS[p]}</span>
              </label>
            );
          })}
        </div>
        {fieldErrors.priorities && <p id="priorities-error" className="field-error">{fieldErrors.priorities}</p>}
      </fieldset>

      <Field name="notes" label="Anything we should know? (optional)" hint="Themes, traditions, dietary needs, who is helping. Please don’t include contact details." error={fieldErrors.notes}>
        <textarea id="field-notes" name="notes" rows={4} maxLength={LIMITS.notesMax} onChange={(e) => setNotesLength(e.target.value.length)}
          aria-invalid={Boolean(fieldErrors.notes)} aria-describedby={`${describedBy("notes", true, fieldErrors.notes) ?? ""} notes-count`.trim()} />
        <p id="notes-count" className="hint">{notesLength} / {LIMITS.notesMax}</p>
      </Field>

      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Building your plan…" : "Build my plan"}</button>
    </form>
  );
}
