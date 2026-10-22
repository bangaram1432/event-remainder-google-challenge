"use client";

import { useState, type RefObject } from "react";
import { formatMoney } from "@/domain/format";
import { buildIcs } from "@/domain/ics";
import type { AiProgress, FallbackReason, Plan, Severity, SpendCategoryId, TimelineItem } from "@/domain/types";

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Urgent", warning: "Heads-up", info: "Note" };
const URGENCY_LABEL = { now: "Do now", soon: "Coming up", scheduled: "" } as const;

const FALLBACK_NOTES: Record<FallbackReason, string> = {
  timeout: "Gemini took too long, so this is the rule-based plan. Edit your details and rebuild for tailored ideas.",
  "upstream-error": "AI personalisation is unavailable right now, so this is the rule-based plan.",
  "invalid-output": "The AI reply didn’t pass our checks, so this is the rule-based plan.",
  "input-flagged": "Your notes looked like instructions to an AI, so they were left out of the AI step. The rule-based plan is complete.",
  "blocked-output": "The AI reply was blocked by a safety check, so this is the rule-based plan.",
};

const dateFormat = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

function downloadCalendar(plan: Plan) {
  const blob = new Blob([buildIcs(plan, new Date())], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${plan.input.eventType}-plan.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const urgency = URGENCY_LABEL[item.urgency];
  return (
    <li className={`step${item.critical ? " step-critical" : ""}`}>
      <time dateTime={item.dueDate}>{formatDate(item.dueDate)}</time>
      <div>
        <p className="step-title">
          {item.title}
          {item.critical && <span className="badge badge-accent">Book first</span>}
          {urgency && <span className="badge">{urgency}</span>}
        </p>
        <p className="muted">{item.detail}</p>
      </div>
    </li>
  );
}

interface Props {
  plan: Plan;
  ai: AiProgress;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onEdit: () => void;
}

export function PlanView({ plan, ai, headingRef, onEdit }: Props) {
  const money = (n: number) => formatMoney(n, plan.input.currency);
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());
  const enhancement = ai.status === "enhanced" ? ai.enhancement : null;
  const tipsByCategory = new Map<SpendCategoryId, string[]>();
  for (const { categoryId, tip } of enhancement?.vendorTips ?? []) {
    tipsByCategory.set(categoryId, [...(tipsByCategory.get(categoryId) ?? []), tip]);
  }
  const ideas = [...(enhancement?.themeIdeas ?? []), ...plan.ideas];

  function toggle(key: string, checked: boolean) {
    setAsked((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <article className="results stack" aria-labelledby="results-heading">
      <section className="card">
        <h2 id="results-heading" tabIndex={-1} ref={headingRef}>Your plan</h2>
        <p className="lede-sm">{enhancement ? enhancement.headline : plan.summary}</p>
        {enhancement && <p className="muted">{plan.summary}</p>}
        <p className="ai-note">
          {ai.status === "pending" && "Adding tailored ideas with Gemini. The plan below is already complete."}
          {ai.status === "enhanced" && <span className="badge badge-accent">Personalised with Gemini</span>}
          {ai.status === "fallback" && FALLBACK_NOTES[ai.reason]}
          {ai.status === "disabled" && "AI personalisation is switched off on this server. Budget, timeline and checklists below are fully calculated."}
        </p>
        <div className="actions no-print">
          <button type="button" className="btn btn-primary" onClick={() => downloadCalendar(plan)}>Download calendar (.ics)</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print or save as PDF</button>
          <button type="button" className="btn btn-secondary" onClick={onEdit}>Edit details</button>
        </div>
      </section>

      {plan.warnings.length > 0 && (
        <section aria-labelledby="warnings-heading" className="card">
          <h3 id="warnings-heading">Things to know</h3>
          <ul className="plain">
            {plan.warnings.map((w) => (
              <li key={w.code} className={`warning warning-${w.severity}`}>
                <strong>{SEVERITY_LABEL[w.severity]}:</strong> {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="budget-heading" className="card">
        <h3 id="budget-heading">Budget</h3>
        <div className="table-wrap">
          <table>
            <caption>How {money(plan.budget.total)} is split across categories</caption>
            <thead>
              <tr><th scope="col">Category</th><th scope="col" className="num">Amount</th><th scope="col" className="num">Share</th><th scope="col" className="num">Per guest</th></tr>
            </thead>
            <tbody>
              {plan.budget.lines.map((line) => (
                <tr key={line.categoryId}>
                  <th scope="row">{line.label}<span className="why">{line.rationale}</span></th>
                  <td className="num">{money(line.amount)}</td>
                  <td className="num">
                    <meter min={0} max={100} value={line.sharePercent} aria-label={`${line.label} share of budget`}>{line.sharePercent}%</meter>
                    <span> {line.sharePercent}%</span>
                  </td>
                  <td className="num">{money(line.perGuest)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">Total</th><td className="num">{money(plan.budget.total)}</td><td className="num">100%</td><td className="num">{money(Math.round(plan.budget.total / plan.input.guestCount))}</td></tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="timeline-heading" className="card">
        <h3 id="timeline-heading">Timeline</h3>
        <ol className="timeline">
          {plan.timeline.items.map((item) => <TimelineEntry key={item.id} item={item} />)}
        </ol>
      </section>

      <section aria-labelledby="vendors-heading" className="card">
        <h3 id="vendors-heading">Vendor checklists</h3>
        <p className="muted">Tick each question once you have asked it. Never sign before you have the contract points in writing.</p>
        {plan.vendors.map((vendor) => {
          const done = vendor.questions.filter((_, i) => asked.has(`${vendor.categoryId}:${i}`)).length;
          const tips = tipsByCategory.get(vendor.categoryId) ?? [];
          return (
            <fieldset key={vendor.categoryId} className="vendor">
              <legend>{vendor.vendorType} · {money(vendor.allocated)}</legend>
              <p className="muted">
                {vendor.quotesToCollect > 0 ? `Collect ${vendor.quotesToCollect} quotes. ` : "No quotes needed. "}
                {vendor.bookBy ? `Book by ${formatDate(vendor.bookBy)}. ` : ""}
                <span aria-live="polite">{done} of {vendor.questions.length} questions asked.</span>
              </p>
              <ul className="plain">
                {vendor.questions.map((question, i) => {
                  const key = `${vendor.categoryId}:${i}`;
                  return (
                    <li key={key}>
                      <label className="check">
                        <input type="checkbox" checked={asked.has(key)} onChange={(e) => toggle(key, e.target.checked)} />
                        <span>{question}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="subhead">Put in the contract</p>
              <ul>{vendor.contractChecks.map((c) => <li key={c}>{c}</li>)}</ul>
              {tips.map((tip) => <p key={tip} className="tip"><span className="badge badge-accent">AI tip</span> {tip}</p>)}
            </fieldset>
          );
        })}
      </section>

      <section aria-labelledby="ideas-heading" className="card">
        <h3 id="ideas-heading">Ideas for your celebration</h3>
        <ul className="ideas">
          {ideas.map((idea) => (
            <li key={idea.title}>
              <p className="step-title">{idea.title} <span className="badge">{idea.source === "ai" ? "Tailored" : "Curated"}</span></p>
              <p className="muted">{idea.description}</p>
            </li>
          ))}
        </ul>
        {enhancement && (
          <>
            <h4>Personal touches</h4>
            <ul>{enhancement.personalTouches.map((t) => <li key={t}>{t}</li>)}</ul>
            {enhancement.risks.length > 0 && (
              <>
                <h4>What could go wrong</h4>
                <ul>{enhancement.risks.map((r) => <li key={r.risk}><strong>{r.risk}</strong> {r.mitigation}</li>)}</ul>
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="assumptions-heading" className="card">
        <h3 id="assumptions-heading">Assumptions</h3>
        <ul>{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      </section>
    </article>
  );
}
