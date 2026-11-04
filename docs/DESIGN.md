# Design System

## Style
Dark "glass" look: deep navy background with soft violet/cyan/magenta aurora glows, translucent
panels, bright text. Professional and calm; colour is used for meaning (money, status), not decoration.

## Tokens (defined in `src/styles.css`)
Always use the Tailwind tokens, never raw hex values in components.

| Token | Use |
|---|---|
| `background` / `foreground` | page background / main text |
| `muted-foreground` | secondary text, hints |
| `panel`, `panel-strong`, `panel-border` | glass panels and their borders |
| `violet`, `cyan`, `magenta` | brand accents, links (`text-cyan`), highlights |
| `emerald` | paid / success |
| `amber` / `gold` | part-paid, awaiting first payment, offers |
| `rose` | overdue, destructive, errors |
| `destructive` | destructive buttons |

Theme colour for the browser/Android bar: `#050913`.

## Seat status colours (floor plan)
| Status | Colour |
|---|---|
| Vacant | grey (`muted-foreground`) |
| Paid | emerald |
| Part paid | amber |
| Overdue | rose |
| Pending (awaiting first payment) | cyan |

## Typography
- Inter for text, JetBrains Mono (`font-mono`) for numbers, amounts, labels in caps.
- Small uppercase mono labels: `font-mono text-[10px] uppercase tracking-widest text-muted-foreground`.

## Components
- Wrap content in `GlassPanel` (`src/components/glass.tsx`); page titles use `SectionHeader`; stat tiles use `Kpi`.
- Use shadcn components from `src/components/ui` (Button, Dialog, Select, Table…). Don't create a second button or dialog style.
- Confirmations go through `ConfirmDialog`; notifications through `sonner` toasts.
- Money is shown with `inr()` and dates with `fmtDate()` from `src/lib/format.ts`.
- Radius: `rounded-xl` for panels, `rounded-md`/`rounded-lg` for controls.

## UX requirements
- **Mobile first**: most owners use a phone. Every screen must work at 375px wide with no sideways scrolling.
- Show loading, empty and error states on every list.
- Destructive actions need a confirmation that says exactly what will happen.
- Never show another student's personal details to a student.
- Inside the Android app, hide owner plan purchase buttons (`useIsAndroidApp()`).
