import {
  CATEGORY_LABELS, CONDITIONAL_QUESTIONS, VENDOR_BASE, VENDOR_EXTRAS, VENUE_FREE_TEMPLATE,
} from "./catalog";
import type { BudgetPlan, PlanInput, SpendCategoryId, TimelineItem, VendorChecklist } from "./types";

/**
 * Turns budget lines into vendor checklists tailored to the event type, setting and crowd size.
 * Each checklist carries its allocation and the "book by" date from the first critical timeline item.
 */
export function buildVendorChecklists(
  input: PlanInput,
  budget: BudgetPlan,
  timeline: readonly TimelineItem[],
): VendorChecklist[] {
  const checklists: VendorChecklist[] = [];
  for (const line of budget.lines) {
    if (line.categoryId === "contingency" || line.amount <= 0) continue;
    const categoryId: SpendCategoryId = line.categoryId;
    const template = categoryId === "venue" && input.venueCost === "free-or-owned" ? VENUE_FREE_TEMPLATE : VENDOR_BASE[categoryId];
    const extra = VENDOR_EXTRAS[input.eventType][categoryId];
    const conditional = CONDITIONAL_QUESTIONS.filter((c) => c.categoryIds.includes(categoryId) && c.when(input)).map((c) => c.question);
    const bookBy = timeline.find((t) => t.categoryId === categoryId && t.critical && t.phase === "before")?.dueDate ?? null;
    checklists.push({
      categoryId,
      label: CATEGORY_LABELS[categoryId],
      vendorType: template.vendorType,
      allocated: line.amount,
      quotesToCollect: template.quotesToCollect,
      bookBy,
      questions: [...template.questions, ...(extra?.questions ?? []), ...conditional],
      contractChecks: [...template.contractChecks, ...(extra?.contractChecks ?? [])],
    });
  }
  return checklists;
}
