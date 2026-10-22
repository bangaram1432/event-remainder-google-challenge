/**
 * Declarative planning knowledge: ratios, milestones, vendor questions and idea pool.
 * Everything a planner would want to tune lives here, away from the algorithms.
 * The figures are illustrative planning heuristics, not market quotes (see README, "Assumptions").
 */
import type { CategoryId, Currency, EventType, Idea, Priority, PlanInput, SpendCategoryId } from "./types";

export const CATEGORY_LABELS: Readonly<Record<CategoryId, string>> = {
  venue: "Venue",
  catering: "Food & drink",
  decor: "Décor & flowers",
  entertainment: "Music & entertainment",
  "photo-video": "Photo & video",
  "attire-styling": "Attire & styling",
  stationery: "Invitations & printing",
  logistics: "Logistics & staffing",
  "gifts-favours": "Gifts & favours",
  contingency: "Contingency reserve",
};

type Weighted = ReadonlyArray<readonly [SpendCategoryId, number]>;

/** Typical share of spend per category before context adjustments. Each list sums to 100. */
export const BASE_WEIGHTS: Readonly<Record<EventType, Weighted>> = {
  wedding: [
    ["venue", 24], ["catering", 30], ["decor", 10], ["entertainment", 7], ["photo-video", 10],
    ["attire-styling", 10], ["stationery", 2], ["logistics", 4], ["gifts-favours", 3],
  ],
  birthday: [
    ["venue", 22], ["catering", 34], ["decor", 14], ["entertainment", 16], ["photo-video", 4],
    ["stationery", 2], ["logistics", 3], ["gifts-favours", 5],
  ],
  community: [
    ["venue", 18], ["catering", 28], ["decor", 8], ["entertainment", 14], ["photo-video", 3],
    ["stationery", 8], ["logistics", 16], ["gifts-favours", 5],
  ],
};

/** Share of the total held back for surprises. Outdoor events add a weather premium. */
export const RESERVE_PERCENT: Readonly<Record<EventType, number>> = { wedding: 10, birthday: 8, community: 10 };
export const OUTDOOR_RESERVE_BONUS = 3;

export const PRIORITY_TARGETS: Readonly<Record<Priority, readonly SpendCategoryId[]>> = {
  food: ["catering"],
  venue: ["venue"],
  decor: ["decor"],
  entertainment: ["entertainment"],
  photography: ["photo-video"],
  "guest-comfort": ["logistics"],
};

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  food: "food & drink",
  venue: "the venue",
  decor: "décor",
  entertainment: "entertainment",
  photography: "photo & video",
  "guest-comfort": "guest comfort",
};

/** How strongly each category scales with guest count (positive: grows with larger crowds). */
export const GUEST_SENSITIVITY: Readonly<Partial<Record<CategoryId, number>>> = {
  catering: 0.06,
  logistics: 0.1,
  decor: -0.05,
  entertainment: -0.03,
};

/** Minimum plausible catering spend per guest (whole currency units) for a simple menu. */
export const CATERING_FLOOR_PER_GUEST: Readonly<Record<Currency, number>> = {
  INR: 250, USD: 12, EUR: 12, GBP: 10, AUD: 16, CAD: 15,
};
export const CATERING_FLOOR_MULTIPLIER: Readonly<Record<EventType, number>> = {
  wedding: 1.6, birthday: 1, community: 0.7,
};
/** catering-per-guest ÷ floor below the first value is "stretched"; above the second, "generous". */
export const TIER_THRESHOLDS = { stretchedBelow: 1, generousFrom: 4 } as const;

export type PlanContext = Pick<PlanInput, "guestCount" | "setting" | "venueCost">;

export interface MilestoneTemplate {
  id: string;
  /** Ideal lead time in days. 0 is the event day; negative values fall after the event. */
  daysBefore: number;
  title: string;
  detail: string;
  critical?: boolean;
  categoryId?: SpendCategoryId;
  when?: (context: PlanContext) => boolean;
}

const paidVenue = (c: PlanContext) => c.venueCost === "paid";
const freeVenue = (c: PlanContext) => c.venueCost === "free-or-owned";
const outdoors = (c: PlanContext) => c.setting === "outdoor";
const large = (c: PlanContext) => c.guestCount > 150;

function m(
  id: string, daysBefore: number, title: string, detail: string,
  extra: Partial<Pick<MilestoneTemplate, "critical" | "categoryId" | "when">> = {},
): MilestoneTemplate {
  return { id, daysBefore, title, detail, ...extra };
}

export const MILESTONES: Readonly<Record<EventType, readonly MilestoneTemplate[]>> = {
  wedding: [
    m("set-budget", 270, "Agree the budget and a first guest list", "Decide who pays for what and draft the guest list; it drives every quote."),
    m("book-venue", 255, "Book the venue and hold the date", "Visit at least three venues and get the date in writing.", { critical: true, categoryId: "venue", when: paidVenue }),
    m("confirm-venue", 255, "Confirm venue access and house rules", "Get permission, access hours, power and noise rules in writing.", { critical: true, categoryId: "venue", when: freeVenue }),
    m("book-photo", 240, "Book photographer and videographer", "Good ones sell out first; review full galleries before you sign.", { critical: true, categoryId: "photo-video" }),
    m("book-caterer", 210, "Book the caterer and schedule a tasting", "Share the dietary needs of your guests before the tasting.", { critical: true, categoryId: "catering" }),
    m("book-music", 180, "Book music or DJ", "Agree the playlist, key moments and equipment needs.", { critical: true, categoryId: "entertainment" }),
    m("save-dates", 150, "Send save-the-dates", "Let out-of-town guests plan travel early.", { categoryId: "stationery" }),
    m("attire", 120, "Start attire shopping and fittings", "Allow time for stitching and two rounds of alterations.", { categoryId: "attire-styling" }),
    m("send-invites", 90, "Send invitations with an RSVP date", "Add an easy RSVP link or phone number.", { categoryId: "stationery" }),
    m("weather-plan", 60, "Lock a weather backup", "Reserve a tent or indoor fallback and agree who makes the call.", { critical: true, categoryId: "logistics", when: outdoors }),
    m("finalise-details", 60, "Finalise menu, décor and rentals in writing", "Get every vendor to confirm scope, timings and price.", { categoryId: "decor" }),
    m("crowd-plan", 45, "Plan parking, seating flow and helpers", "Large guest lists need marshals, signage and a seating plan.", { categoryId: "logistics", when: large }),
    m("chase-rsvps", 30, "Chase RSVPs and draft the seating plan", "Call the guests who have not replied."),
    m("final-headcount", 14, "Give the caterer the final headcount", "Most caterers lock numbers about two weeks out.", { critical: true, categoryId: "catering" }),
    m("share-schedule", 7, "Share the day-of schedule and pay balances", "Send every vendor and helper the same one-page schedule.", { categoryId: "logistics" }),
    m("walkthrough", 1, "Walk through the venue and pack an emergency kit", "Sewing kit, pain relief, chargers, cash and a printed vendor contact list."),
    m("event-day", 0, "Celebrate", "Delegate problems to a trusted helper so you can enjoy the day."),
    m("thank-you", -7, "Send thank-you notes and settle final invoices", "Pay remaining balances and review the vendors you would recommend."),
  ],
  birthday: [
    m("theme-date", 60, "Pick the date, theme and guest list", "Check school, work and festival clashes before announcing."),
    m("book-venue", 50, "Book the venue", "Compare at least two options and confirm what is included.", { critical: true, categoryId: "venue", when: paidVenue }),
    m("confirm-venue", 50, "Confirm venue access and house rules", "Check decorations, noise and food rules at your own or a free venue.", { categoryId: "venue", when: freeVenue }),
    m("book-fun", 45, "Book the entertainer, DJ or activities", "Match the act to the age range of your guests.", { critical: true, categoryId: "entertainment" }),
    m("photos", 40, "Arrange someone to capture photos", "A hired photographer or a friend with a clear shot list.", { categoryId: "photo-video" }),
    m("cake-decor", 35, "Order the cake and décor", "Confirm allergens, flavour and delivery time for the cake.", { critical: true, categoryId: "decor" }),
    m("send-invites", 28, "Send invitations", "Include the address, start and end time, and an RSVP date.", { categoryId: "stationery" }),
    m("weather-plan", 21, "Lock a weather backup", "Arrange a shaded or indoor fallback for outdoor parties.", { critical: true, categoryId: "logistics", when: outdoors }),
    m("chase-rsvps", 14, "Chase RSVPs and confirm food quantities", "Call anyone who has not replied so the caterer gets a realistic number."),
    m("final-headcount", 7, "Give the caterer the final headcount", "Round up slightly for children and last-minute guests.", { critical: true, categoryId: "catering" }),
    m("collect-supplies", 3, "Collect the cake, décor and party favours", "Do a final check against your list.", { categoryId: "gifts-favours" }),
    m("event-day", 0, "Celebrate", "Keep one helper free to handle surprises."),
    m("thank-you", -3, "Send thank-you messages", "A short note or photo from the day works well."),
  ],
  community: [
    m("goals-roles", 90, "Set the goal and assign committee roles", "Name one owner each for venue, safety, food, programme and promotion."),
    m("permits", 80, "Check permits, insurance and venue rules", "Ask the local authority what is needed for the crowd size and any amplified sound.", { critical: true, categoryId: "logistics" }),
    m("book-venue", 70, "Book the venue", "Confirm capacity, accessibility and what the hire fee covers.", { critical: true, categoryId: "venue", when: paidVenue }),
    m("confirm-venue", 70, "Confirm venue access and house rules", "Get permission and access hours from the owner in writing.", { critical: true, categoryId: "venue", when: freeVenue }),
    m("volunteers", 60, "Recruit and assign volunteers", "Plan roughly one volunteer for every 25 guests.", { categoryId: "logistics" }),
    m("confirm-vendors", 45, "Confirm food, sound and equipment suppliers", "Agree delivery windows and who is on site.", { critical: true, categoryId: "catering" }),
    m("promote", 35, "Start promotion", "Flyers, messaging groups and notice boards in the languages your community uses.", { categoryId: "stationery" }),
    m("weather-plan", 30, "Lock a weather backup", "Decide the rain plan and the date by which you will switch to it.", { critical: true, categoryId: "logistics", when: outdoors }),
    m("safety-plan", 21, "Prepare the safety, first-aid and crowd plan", "Mark exits, name a first-aid lead and agree an emergency contact.", { critical: true, categoryId: "logistics" }),
    m("traffic-plan", 21, "Plan parking and traffic flow", "Large crowds need signage, marshals and a drop-off point.", { categoryId: "logistics", when: large }),
    m("volunteer-briefing", 7, "Brief volunteers and share the run sheet", "Give every volunteer a role, a shift time and one contact person."),
    m("setup", 1, "Set up the space and test the sound", "Walk the route guests will take and check exits, signage and power."),
    m("event-day", 0, "Run the event", "Keep a short list of who decides what if plans change."),
    m("debrief", -5, "Debrief and thank volunteers and sponsors", "Record what worked so the next committee starts ahead."),
  ],
};

export interface VendorTemplate {
  vendorType: string;
  quotesToCollect: number;
  questions: readonly string[];
  contractChecks: readonly string[];
}

export const VENDOR_BASE: Readonly<Record<SpendCategoryId, VendorTemplate>> = {
  venue: {
    vendorType: "Venue", quotesToCollect: 3,
    questions: [
      "What is the all-in price for my date, including taxes, service charges and overtime?",
      "What is the capacity for seated dining versus standing, and what is the plan for rain or a power cut?",
      "What are the load-in, sound and end-time restrictions?",
    ],
    contractChecks: ["Deposit amount, refund schedule and date-change terms", "What is included (tables, chairs, power, cleaning) and what is billed extra"],
  },
  catering: {
    vendorType: "Caterer", quotesToCollect: 3,
    questions: [
      "What is the price per guest for my menu, and how does it change if the headcount moves by 10%?",
      "How do you handle vegetarian, vegan, allergen and religious dietary needs?",
      "Who provides service staff and equipment, and how many staff will serve every 50 guests?",
    ],
    contractChecks: ["Final headcount deadline and the tolerance allowed", "Tasting before signing and the menu substitution policy"],
  },
  decor: {
    vendorType: "Décor & florals", quotesToCollect: 3,
    questions: [
      "Can you share photos of similar setups and a line-item quote?",
      "Which items are rented and which do I keep, and who handles setup and teardown?",
      "What is the plan if flowers or materials are unavailable?",
    ],
    contractChecks: ["Setup and teardown times agreed with the venue", "Substitution rules and damage-deposit terms"],
  },
  entertainment: {
    vendorType: "Music & entertainment", quotesToCollect: 3,
    questions: [
      "What is your total fee for my timings, including travel, equipment and overtime?",
      "Can you share a recent video of a similar event and a sample set list?",
      "What do you need from the venue (power, stage, sound limits), and what is your backup if you fall ill?",
    ],
    contractChecks: ["Performance hours, breaks and overtime rate", "Cancellation and replacement terms"],
  },
  "photo-video": {
    vendorType: "Photographer / videographer", quotesToCollect: 3,
    questions: [
      "What do the package hours, number of shooters and delivery timeline include?",
      "Who owns the files, and are full-resolution images included?",
      "Can I see a full gallery from a recent event, not only highlights?",
    ],
    contractChecks: ["Shot list or must-have moments", "Backup media and what happens if the photographer is unavailable"],
  },
  "attire-styling": {
    vendorType: "Attire & styling", quotesToCollect: 2,
    questions: [
      "What is the realistic timeline for stitching, alterations and fittings?",
      "What are the rental or return policies, and are alterations included?",
      "Who coordinates hair, makeup or grooming on the day, and how long does it take?",
    ],
    contractChecks: ["Delivery at least two weeks before the event", "Alteration and refund terms"],
  },
  stationery: {
    vendorType: "Invitations & printing", quotesToCollect: 2,
    questions: [
      "What are the proof, revision and turnaround times?",
      "Do you offer a digital invitation or RSVP link alongside print?",
    ],
    contractChecks: ["Final proof approved in writing before printing", "Delivery date and reprint policy for errors"],
  },
  logistics: {
    vendorType: "Logistics (rentals, transport, staffing)", quotesToCollect: 2,
    questions: [
      "Which items must be rented (tents, generators, sound, seating), and what is the delivery window?",
      "How many helpers do I need for every 50 guests, and who supervises them?",
      "Do I need permits, parking arrangements or security for this guest count?",
    ],
    contractChecks: ["Delivery, pick-up and damage terms for rentals", "An emergency contact for each supplier on the day"],
  },
  "gifts-favours": {
    vendorType: "Gifts & favours", quotesToCollect: 2,
    questions: ["What is the minimum order and the lead time for custom items?", "Can I get a sample before ordering in bulk?"],
    contractChecks: ["Delivery date and a quantity check on arrival", "Replacement policy for damaged items"],
  },
};

export const VENUE_FREE_TEMPLATE: VendorTemplate = {
  vendorType: "Venue access (free or owned)", quotesToCollect: 0,
  questions: [
    "Who must give permission, and which house rules apply (noise, decorations, food)?",
    "Is there enough power, lighting, water and restroom capacity for the guest count?",
    "Who is responsible for cleaning, and is a deposit due?",
  ],
  contractChecks: ["Written confirmation of the date and access hours", "Insurance or permit needs for the event"],
};

interface VendorExtra { questions?: readonly string[]; contractChecks?: readonly string[] }

export const VENDOR_EXTRAS: Readonly<Record<EventType, Partial<Record<SpendCategoryId, VendorExtra>>>> = {
  wedding: {
    venue: { questions: ["Does the venue allow your ceremony customs (fire, music, processions), and are there timing limits?"] },
    catering: { questions: ["Can you cater several functions around the wedding at a package rate?"] },
    "photo-video": { questions: ["Do you cover the ceremony and pre-wedding moments, and is a second shooter included?"] },
  },
  birthday: {
    entertainment: { questions: ["Have you worked with this age range before (for example toddlers versus teenagers)?"] },
    catering: { questions: ["Does the cake come from you or a separate baker, and who checks allergens in the cake?"] },
  },
  community: {
    venue: { questions: ["Is the venue accessible, with step-free entry, accessible restrooms and hearing support?"] },
    logistics: { questions: ["Do you carry public-liability insurance and can you provide the certificate?"] },
    stationery: { questions: ["Can flyers be produced in the languages our community uses?"] },
  },
};

export interface ConditionalQuestion {
  when: (input: PlanInput) => boolean;
  categoryIds: readonly SpendCategoryId[];
  question: string;
}

export const CONDITIONAL_QUESTIONS: readonly ConditionalQuestion[] = [
  { when: (i) => i.setting === "outdoor", categoryIds: ["venue", "logistics"], question: "What is the weather backup, who decides to switch, and by what time?" },
  { when: (i) => i.guestCount > 150, categoryIds: ["venue"], question: "Is parking sufficient for this guest count, and is there a crowd-management or security plan?" },
];

type IdeaTier = "stretched" | "balanced" | "generous";
export interface IdeaTemplate extends Omit<Idea, "source"> {
  tiers: readonly IdeaTier[];
  settings?: readonly PlanInput["setting"][];
}

export const IDEA_POOL: Readonly<Record<EventType, readonly IdeaTemplate[]>> = {
  wedding: [
    { title: "Two-tier guest list", description: "Invite everyone to the ceremony and a close circle to the dinner; food is the biggest cost and this protects it.", tiers: ["stretched"] },
    { title: "Daytime garden celebration", description: "Natural light and greenery cut décor and lighting costs, and a brunch menu is cheaper per guest than dinner.", tiers: ["stretched", "balanced"], settings: ["outdoor", "either"] },
    { title: "Family-textile palette", description: "Build the décor around fabrics, brass and flowers your families already own and add seasonal local blooms.", tiers: ["stretched", "balanced", "generous"] },
    { title: "Regional food stations", description: "Live stations from different regions feel generous, reduce queueing and use fewer service staff than plated courses.", tiers: ["balanced", "generous"] },
    { title: "Live acoustic ceremony, playlist party", description: "Hire a small live act for the ceremony and cocktail hour, then switch to a curated playlist for dancing.", tiers: ["balanced", "generous"] },
  ],
  birthday: [
    { title: "Backyard activity circuit", description: "Three DIY stations (craft, game, treat) keep guests busy without an expensive entertainer.", tiers: ["stretched", "balanced"] },
    { title: "Potluck-plus menu", description: "You provide the main dish and cake, guests bring sides; it lowers the food bill and feels communal.", tiers: ["stretched"] },
    { title: "One hero moment", description: "Spend on a single memorable thing, such as a themed cake, a magician or a photo corner, and keep everything else simple.", tiers: ["balanced", "generous"] },
    { title: "Themed party with takeaway favours", description: "Pick one colour or character and let the favours, cake and décor repeat it.", tiers: ["balanced", "generous"] },
    { title: "Evening lantern party", description: "String lights and candles transform a simple space cheaply for an outdoor evening.", tiers: ["stretched", "balanced", "generous"], settings: ["outdoor", "either"] },
  ],
  community: [
    { title: "Volunteer-run food stalls", description: "Invite local home cooks and charge a small stall fee; it widens the menu and spreads the cost.", tiers: ["stretched", "balanced"] },
    { title: "Open-mic programme", description: "Local performers fill the stage for free and give people a reason to bring friends.", tiers: ["stretched", "balanced", "generous"] },
    { title: "Sponsor wall", description: "Offer small businesses a named banner or table in exchange for covering a line such as sound or water.", tiers: ["stretched", "balanced"] },
    { title: "Family-friendly zones", description: "Separate quiet, kids and food zones with signage so every age group has somewhere comfortable.", tiers: ["balanced", "generous"] },
    { title: "Shaded rain-ready layout", description: "Plan covered seating and a short indoor fallback programme so weather never cancels the day.", tiers: ["stretched", "balanced", "generous"], settings: ["outdoor"] },
  ],
};
