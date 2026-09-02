import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GlassPanel, SectionHeader } from "@/components/glass";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import {
  Search,
  X,
  Rocket,
  Building2,
  Grid3x3,
  Users,
  Ticket,
  IndianRupee,
  ReceiptText,
  Sparkles,
  Megaphone,
  LifeBuoy,
  Star,
  UserCog,
  CreditCard,
  LayoutDashboard,
  HelpCircle,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tutorial")({
  head: () => ({ meta: [{ title: "Tutorial · LibraryBandhu" }] }),
  component: TutorialPage,
  errorComponent: ({ error }) => <div className="p-6 text-rose">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

type Chapter = {
  id: string;
  title: string;
  icon: typeof Rocket;
  to?: string;
  summary: string;
  steps: string[];
  tips?: string[];
};

const QUICK_START: string[] = [
  "Add your first branch in Branches — name, address, contact, opening hours, shifts, amenities and photos.",
  "Open Layout Builder for that branch and draw your hall: add sections, generate seats, then save the layout.",
  "Add a student in Students (name, mobile, DOB). The student uses mobile + DOB PIN to log in.",
  "Assign a seat in Allocations — pick the student, choose the shift and monthly fee, then confirm.",
  "Log the first payment in Payments (or from the student's profile) so the due date starts tracking.",
  "Check the Dashboard each morning for expected revenue and the Needs attention list of overdue students.",
];

const CHAPTERS: Chapter[] = [
  {
    id: "dashboard",
    title: "Dashboard — your daily control room",
    icon: LayoutDashboard,
    to: "/admin",
    summary: "One screen that answers: how much money is coming in, who hasn't paid, and how each branch is doing.",
    steps: [
      "Use the branch and month filters at the top to scope every number on the page.",
      "Read the KPI cards: collected this month, expected revenue (collected + still due), outstanding dues, active students and seat occupancy.",
      "Scroll to the trend charts to compare revenue against expenses over the last six months.",
      "Work the Needs attention list top to bottom — it lists every overdue student. Click a name to open the full profile and log the payment right there.",
      "Use Branch comparison to spot the branch that is lagging on occupancy or collection.",
    ],
    tips: ["Expected revenue = money already collected this month + fees still due this month, so it is your realistic monthly target."],
  },
  {
    id: "branches",
    title: "Branches — set up your library",
    icon: Building2,
    to: "/admin/settings",
    summary: "Each physical location is one branch. Everything else (seats, students, payments) hangs off a branch.",
    steps: [
      "Click New branch and fill the Basic tab: branch name, address, city, contact number and description.",
      "Pin the exact location on the map so students can find you on the marketplace and get directions.",
      "Open the Schedule tab: set opening and closing time, weekly closed days, and define your shifts (for example Morning 6am–12pm, Evening 4pm–10pm) with a fee for each.",
      "In Features, search and tick the exams you cater to (UPSC, SSC, NEET…) and the amenities you offer (AC, WiFi, locker, water, CCTV).",
      "In Photos, upload clear pictures of the hall. The first photo becomes your marketplace cover image.",
      "Save. Repeat for every branch you run — the sidebar filters everywhere let you switch between them.",
    ],
    tips: [
      "Editing a branch shows a Save changes button on every tab, and warns you before discarding unsaved edits.",
      "Good photos and accurate shift fees are the biggest drivers of marketplace enquiries.",
    ],
  },
  {
    id: "layout",
    title: "Layout Builder — draw your seating plan",
    icon: Grid3x3,
    to: "/admin/layout-builder",
    summary: "A visual grid of your hall. Seats you create here are the seats you allocate to students.",
    steps: [
      "Pick the branch at the top, then create a section (for example 'Ground Floor', 'Cabin Row').",
      "Use Generate seats to create many seats at once: choose the starting number, direction (left-to-right or right-to-left) and ascending or descending order.",
      "Place non-seat objects — walls, doors, washrooms, stairs — so the plan matches reality.",
      "Tap a cell to select it; tap again to deselect. Select several cells to move or delete them together.",
      "Use zoom + / − / Fit to screen and drag to pan when working on a large hall, especially on a phone or tablet.",
      "Undo any mistake with the undo button, then press Save to sync the layout to the server.",
    ],
    tips: [
      "Your edits are kept as a local draft, so if the tab closes accidentally you can reopen and restore the draft.",
      "Deleting a seat that a student occupies asks for confirmation first — the allocation is released with it.",
      "Turn on occupancy view to see which seats are free, occupied or overdue at a glance.",
    ],
  },
  {
    id: "students",
    title: "Students — your member register",
    icon: Users,
    to: "/admin/students",
    summary: "Every person studying at your library, with documents, fees and full payment history.",
    steps: [
      "Click Add student and enter name, mobile number and date of birth. Mobile + DOB is what the student uses to log in.",
      "Optionally attach ID proof and a photo, and record address and guardian details.",
      "After saving, the app offers to continue straight into seat allocation and then the first payment — a single guided flow.",
      "Click any student name to open their profile: sticky header with actions, fee / next due / total paid stats, and Overview, Seats and Payments tabs.",
      "From the profile you can Log payment, Edit allocation, Edit details, and Deactivate or Reactivate the student.",
      "Switch between card view and table view with the toggle, and use Export to download all student details to Excel.",
    ],
    tips: [
      "One student can hold seats at more than one branch; the Seats tab shows every active allocation.",
      "Deactivate instead of deleting when a student leaves — their payment history stays intact.",
    ],
  },
  {
    id: "allocations",
    title: "Allocations — assign seats and shifts",
    icon: Ticket,
    to: "/admin/allocations",
    summary: "The link between a student, a seat, a shift and a monthly fee.",
    steps: [
      "Choose a branch, then click a free seat on the floor plan or use New allocation.",
      "Search the student. Newly added students appear first, and each row shows their current seat and colour-coded payment status.",
      "For an existing student the shift and monthly fee are pre-filled from their last allocation — change them only if needed.",
      "Set the start date and confirm. Paid coverage already earned carries forward, so a re-seated student is never asked to pay twice.",
      "Use the status filters (paid, partial, due, overdue) to review the register, and Edit allocation to change seat, shift or fee later.",
      "Release a seat when a student leaves so it becomes available again.",
    ],
    tips: ["Colour code: green = paid, amber = partial, orange = due soon, red = overdue."],
  },
  {
    id: "payments",
    title: "Payments — collect and track fees",
    icon: IndianRupee,
    to: "/admin/payments",
    summary: "Log every rupee collected, handle part-payments and discounts, and see where you stand.",
    steps: [
      "Click Log payment, pick the student, and enter the amount and method (cash, UPI, card, bank transfer) with an optional transaction reference.",
      "Check the coverage dates. The start date defaults to the allocation start or the current due date, so you can begin a subscription now and collect later.",
      "If the student pays less than the monthly fee, it is recorded as Partial and the due date does not move until the full fee is covered.",
      "For a discount or waiver, turn on Settle / mark as fully paid — the cycle closes and the due date advances even on a short amount. It shows up tagged as Discounted.",
      "Read the summary bar for collected totals and method-wise split; on mobile tap it to expand.",
      "Filter by range chips (Today, This month…), branch, method or status. Filters stay in the URL so you can bookmark or share a view.",
      "Click Edit on any logged payment to fix the amount, method, date or coverage.",
    ],
    tips: [
      "Backdated legacy payments are allowed — pick any past due date when migrating old records.",
      "₹0 entries are blocked on purpose; use Settle for a full waiver instead.",
    ],
  },
  {
    id: "expenses",
    title: "Expenses — know your real profit",
    icon: ReceiptText,
    to: "/admin/expenses",
    summary: "Record rent, electricity, salaries, internet and maintenance so the dashboard shows profit, not just income.",
    steps: [
      "Click Add expense, choose the branch and category, enter the amount and date, and add a short note.",
      "Log recurring bills as soon as they are paid so the monthly trend stays accurate.",
      "Compare the revenue and expense lines on the dashboard charts to see which branch is actually profitable.",
    ],
  },
  {
    id: "leads",
    title: "Leads — follow up on enquiries",
    icon: Sparkles,
    to: "/admin/leads",
    summary: "Enquiries from the marketplace and walk-ins, in one pipeline.",
    steps: [
      "Open a lead to see the name, mobile, exam interest and preferred shift.",
      "Move the status as you work: new → contacted → visited → converted or lost.",
      "When a lead joins, convert them into a student and go straight into allocation and payment.",
      "Add notes after every call so anyone on your team can pick up the conversation.",
    ],
  },
  {
    id: "notices",
    title: "Notices — message your students",
    icon: Megaphone,
    to: "/admin/notices",
    summary: "Announcements that appear inside every student's app.",
    steps: [
      "Click New notice, write a clear title and body, and choose the branch (or all branches).",
      "Publish. Students see it the next time they open their app.",
      "Use it for holidays, fee reminders, new shift timings, exam-day arrangements or rule changes.",
    ],
  },
  {
    id: "tickets",
    title: "Tickets — handle student complaints",
    icon: LifeBuoy,
    to: "/admin/tickets",
    summary: "Issues raised by students — AC not working, noise, seat problems.",
    steps: [
      "Open a ticket to read the student's message and the branch it concerns.",
      "Reply with what you are doing about it, then mark it in progress.",
      "Close the ticket once resolved. Students see the status change in their app.",
    ],
  },
  {
    id: "reviews",
    title: "Reviews — your public reputation",
    icon: Star,
    to: "/admin/reviews",
    summary: "Ratings students leave for each branch, shown on your marketplace listing.",
    steps: [
      "Filter by branch to see the average rating and the star distribution.",
      "Read individual comments to find recurring complaints worth fixing.",
      "Ask happy students to rate you — a higher average lifts your position in marketplace results.",
    ],
  },
  {
    id: "team",
    title: "Team — add staff with limited access",
    icon: UserCog,
    to: "/admin/staff",
    summary: "Give a manager or receptionist their own login without exposing everything.",
    steps: [
      "Click Add staff, enter their name and details, and note the employee ID and login they receive.",
      "Tick only the permissions they need: students, allocations, collect payments, expenses, leads, notices, tickets.",
      "Assign the branches they are allowed to see — staff only ever see data for their branches.",
      "Deactivate a staff member the moment they leave; owner-only areas (Branches, Team, Reviews, Subscription) are never visible to staff.",
    ],
    tips: ["A front-desk person usually needs only Students, Allocations and Collect payments."],
  },
  {
    id: "subscription",
    title: "Subscription — keep your account active",
    icon: CreditCard,
    to: "/admin/subscription",
    summary: "Your LibraryBandhu plan, billed securely through Razorpay.",
    steps: [
      "You start on a 14-day free trial with full access; the banner at the top shows the days left.",
      "Open Subscription, pick the plan that fits your number of branches and seats, and complete the payment.",
      "The sidebar card always shows your plan, status and next due date.",
      "If a subscription expires you get a short grace period where data stays readable but edits are locked; renewing restores everything immediately.",
    ],
  },
  {
    id: "student-app",
    title: "What your students see",
    icon: HelpCircle,
    summary: "Helpful to know so you can guide new members over the counter.",
    steps: [
      "Students sign in on the student login page with their mobile number and a PIN based on their date of birth, and are asked to change the PIN the first time.",
      "They can see their seat, shift, fee, next due date and full payment history.",
      "They read your notices, raise tickets, and rate the branch.",
      "If a student forgets their PIN, point them to Forgot PIN — or reset their details from their profile in Students.",
    ],
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "A student paid only half the fee. What should I do?",
    a: "Log the amount actually received. It is saved as Partial and the due date does not move. When they pay the rest, log it again — the due date then advances by exactly one cycle, never two.",
  },
  {
    q: "I gave a student a discount. How do I close the month?",
    a: "In Log payment, enter the amount received and turn on Settle / mark as fully paid. The cycle closes, the due date advances, and the entry is tagged Discounted for your records.",
  },
  {
    q: "I moved a student to another seat and it now shows Pending.",
    a: "It shouldn't — paid coverage carries forward on re-allocation. If it still looks wrong, open the student's profile and check the Payments tab: the covers-until date is the source of truth.",
  },
  {
    q: "Can one student use two branches?",
    a: "Yes. One account can hold allocations at multiple branches. The Seats tab in their profile lists all of them.",
  },
  {
    q: "How do I move my old records into the app?",
    a: "Add the students, allocate their seats with the real start dates, then log their past payments with backdated coverage dates. Past dates are allowed for exactly this reason.",
  },
  {
    q: "Can I get my student data out of the app?",
    a: "Yes. On the Students page use Export to download an Excel file with name, mobile, DOB, fee, last payment, current due date and seat number.",
  },
  {
    q: "My staff member can't see a page.",
    a: "Open Team and check their permissions and assigned branches. Branches, Team, Reviews and Subscription are owner-only by design.",
  },
];

function TutorialPage() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const chapters = useMemo(() => {
    if (!query) return CHAPTERS;
    return CHAPTERS.filter((c) =>
      [c.title, c.summary, ...c.steps, ...(c.tips ?? [])].join(" ").toLowerCase().includes(query),
    );
  }, [query]);

  const faqs = useMemo(() => {
    if (!query) return FAQS;
    return FAQS.filter((f) => (f.q + " " + f.a).toLowerCase().includes(query));
  }, [query]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tutorial"
        hint="A complete, plain-language guide to running your library on LibraryBandhu."
      />

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the guide — partial payment, seats, staff, export…"
          className="h-11 pl-9 pr-9"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-panel hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Quick start */}
      {!query && (
        <GlassPanel className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-violet/20 text-violet">
              <Rocket className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Quick start — your first 30 minutes</h2>
              <p className="text-xs text-muted-foreground">Do these six things in order and your library is live.</p>
            </div>
          </div>
          <ol className="mt-4 space-y-3">
            {QUICK_START.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-panel-border bg-panel font-mono text-[11px]">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </GlassPanel>
      )}

      {/* Chapters */}
      <div className="space-y-4">
        {chapters.map((c) => (
          <GlassPanel key={c.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-panel-strong text-foreground">
                  <c.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight">{c.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>
                </div>
              </div>
              {c.to && (
                <Link
                  to={c.to}
                  className="whitespace-nowrap rounded-full border border-panel-border bg-panel px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Open →
                </Link>
              )}
            </div>

            <ol className="mt-4 space-y-2.5">
              {c.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-panel-border bg-panel font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{s}</span>
                </li>
              ))}
            </ol>

            {c.tips?.length ? (
              <div className="mt-4 space-y-2 rounded-lg border border-panel-border bg-panel/60 p-3">
                {c.tips.map((t, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-gold" />
                    <span className="text-muted-foreground">{t}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </GlassPanel>
        ))}
      </div>

      {/* FAQ */}
      {faqs.length > 0 && (
        <GlassPanel className="p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-cyan/20 text-cyan">
              <HelpCircle className="size-4" />
            </span>
            <h2 className="text-base font-semibold">Common questions</h2>
          </div>
          <Accordion type="single" collapsible className="mt-2">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </GlassPanel>
      )}

      {chapters.length === 0 && faqs.length === 0 && (
        <GlassPanel className="p-10 text-center">
          <h3 className="text-base font-semibold">No results for “{q}”</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a simpler word like “payment”, “seat”, “staff” or “export”.
          </p>
        </GlassPanel>
      )}

      <GlassPanel className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="size-4 text-emerald" />
          <span className="text-muted-foreground">Still stuck? Raise a ticket and our team will help you out.</span>
        </div>
        <Badge variant="outline" className="w-fit">Owner guide · updated regularly</Badge>
      </GlassPanel>
    </div>
  );
}
