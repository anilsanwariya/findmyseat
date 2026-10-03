# Remove corner-seat functionality

Remove the corner/premium-seat concept from all current app experiences while preserving every existing seat, allocation, payment, and layout position.

## What will change

- Remove corner/premium controls from single-seat creation, bulk seat generation, bulk editing, and the selected-seat inspector.
- Remove corner legends, gold styling, premium badges, and star markers from the layout builder, allocation map, seat selectors, and student view.
- Treat every seat uniformly; seat number, direction, position, availability, occupancy, and payment status continue working unchanged.
- Remove `is_corner` from current seat queries, shared layout types, clipboard/duplicate operations, and undo/redo snapshots so the app no longer reads or writes the setting.
- Keep bulk editing useful for changing seat direction after the corner option is removed.

## Data safety

- Preserve the existing database field rather than perform a destructive column drop; mark it deprecated and stop using it everywhere in current application code.
- Keep old migration history unchanged because it documents the schema that was originally created.
- Do not alter existing seat or allocation rows, so no bookings, fees, payment history, or layouts are affected.

## Verification

- Confirm creating one seat and generating seats in bulk no longer offers a corner option.
- Confirm layout copy/paste, section duplication, undo/redo, renumbering, moving, and direction edits still work.
- Confirm allocation maps and seat selectors show ordinary seat numbers with no corner legend, stars, or gold distinction.
- Confirm the student view shows the assigned seat normally.
- Check desktop and mobile rendering, then verify the preview builds without errors.

## Technical notes

- Update the layout-builder route, shared canvas/types/history/operations, allocation dialogs and page, and student route.
- Add a schema-only migration that comments `public.seats.is_corner` as deprecated; the column remains for backward compatibility but has no active application behavior.
- Regenerated database types may still contain the deprecated physical field; application code will not reference it.
