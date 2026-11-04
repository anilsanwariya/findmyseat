# Architecture

## Stack
| Layer | Choice |
|---|---|
| Framework | TanStack Start (React 19, TanStack Router file routes, server functions) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui components (`src/components/ui`) |
| Data fetching | TanStack Query |
| Database & auth | Supabase (Postgres, Auth, Storage, row-level security) via Lovable Cloud |
| Payments (owner plans) | Razorpay (checkout + webhook) |
| Email | Lovable email service (`src/lib/email-templates`) |
| Hosting | Cloudflare (built by Lovable), domain librarybandhu.com |
| Editor | Lovable (syncs with GitHub `main`) + Claude Code via pull requests |
| Tests | Vitest (`src/**/*.test.ts`) |
| Android | Trusted Web Activity built with Bubblewrap |

## How a request flows
```
Browser / Android app
   ↓
TanStack routes (src/routes)          ← UI, reads via Supabase client under the user's own session (RLS applies)
   ↓
Server functions (src/lib/*.functions.ts, createServerFn)
   ↓                                   ← privileged work: creating users, OTPs, billing, uploads
Supabase (Postgres + RLS + triggers + RPCs)
```
- Normal reads/writes from the browser go through the Supabase client with the user's session, so **row-level security decides what they can see**.
- Work that needs the service-role key (creating student/staff logins, OTPs, Razorpay, file uploads) runs in **server functions** and must check the caller's role itself.
- Rules that must hold even if the UI is bypassed (seat overlap, shift scope, subscription lock) are enforced in **database triggers/RPCs**.

## Folders
```
src/
  routes/                 pages (file-based). _authenticated/* need login. api/public/* are HTTP endpoints.
    admin.*               owner + staff screens
    super-admin.*         LibraryBandhu team screens
    student.tsx           student portal
    pay.$libraryId.tsx    public branch payment page
    [.]well-known/        assetlinks.json for the Android app
  components/
    ui/                   shadcn primitives — reuse, don't fork
    admin/                owner screens' dialogs, dashboard, layout builder, expenses
    glass.tsx             GlassPanel, SectionHeader, Kpi, AuroraBackground
  lib/
    *.functions.ts        server functions (run on the server)
    *.server.ts           server-only helpers
    payments.ts           due-date rule (latest full payment)
    dashboard-metrics.ts  pure maths for dues, overdue cycles, occupancy
    seat-status.ts        seat free/partial/full per shift
    branch-timings.ts     Morning/Evening/Night hours per branch
    shift-selection.ts    shift packages and filters
    student-profile.ts    a student's standing (awaiting/overdue/part-paid/due soon/paid)
    auth.ts, permissions.ts  session, roles, staff permissions
  integrations/supabase/  generated client and types — don't edit by hand
supabase/migrations/      migrations created by Lovable (already applied)
drizzle/migrations/       hand-written SQL proposed from Claude Code; applied by the owner in Lovable
public/                   static files, PWA manifest, icons, service worker
docs/                     this documentation
```

## Architectural rules
- Put business rules in `src/lib` as small **pure functions** and test them; screens call them. Don't re-implement a rule inside a page.
- One rule, one place: due dates → `payments.ts` / `dashboard-metrics.ts`; seat availability → `seat-status.ts`; shift hours → `branch-timings.ts`.
- Anything that needs the service-role key lives in `*.functions.ts` / `*.server.ts` and verifies the caller first.
- Security is enforced in the database (RLS, triggers). UI checks (`usePermissions`) only hide buttons.
- `src/routeTree.gen.ts` and `src/integrations/supabase/types.ts` are generated.
- Don't add Vite plugins; `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`.

## Environments
| Environment | Where |
|---|---|
| Local | `npm run dev` (needs `.env`) |
| Preview | Lovable preview URL |
| Production | librarybandhu.com (Lovable → Publish) |
| Android | Play Console internal testing → production |

There is one Supabase database shared by preview and production. Treat every database change as a production change.
