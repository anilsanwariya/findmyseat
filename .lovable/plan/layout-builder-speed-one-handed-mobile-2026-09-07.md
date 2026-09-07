# Layout builder: speed + one-handed mobile

Two goals only: make every action feel instant, and make the screen usable with a thumb. No changes to seats, allocations, payments or any data rules.

## 1. Speed

What happens today: after every single action (add a seat, delete a cell, move, renumber, paste) the screen re-fetches the whole section — seats, area cells, all active allocations for those seats, and their partial-payment rows — before the grid updates. So a one-tap edit waits on four round trips. Bulk tools also write one row at a time in a loop, so moving 20 seats is 40 sequential writes.

Changes:

- **Instant feedback (optimistic updates).** The tapped cell changes immediately, then the write happens in the background; if it fails, the cell reverts and a message explains why. No full reload on success.
- **Split the data.** Layout (seats + area cells) and occupancy (who sits where, payment colours) become two separate reads. Editing the layout no longer re-reads occupancy at all; occupancy is only read when the Occupancy view is on.
- **Batch the bulk tools.** Move, renumber, paste and bulk edit send their rows in grouped requests instead of one-by-one, so a 20-seat move is a couple of requests, not forty.
- **Cheaper drawing.** Each cell becomes its own memoised component keyed on what it actually shows, so selecting cells or panning no longer re-renders the entire 15x15 grid.
- **Progress that tells the truth.** Long operations show a single "Moving 20 seats…" state with the buttons that could conflict disabled, instead of several overlapping toasts.

## 2. Mobile ergonomics

What happens today: the toolbar packs mode switch, select, undo, redo, duplicate and save into one wrapping row, and all selection actions (bulk edit, renumber, copy, delete, add area) live in a 320px side panel that sits below the grid on a phone — so you select cells at the top and then scroll away from the grid to act on them.

Changes:

- **Bottom action bar.** When cells are selected on a phone, a fixed bar rises from the bottom with the count and the actions for that selection (Bulk edit, Renumber, Copy, Move, Delete, Clear), respecting the phone's safe area. The grid stays in view.
- **Slimmer top bar.** Keeps only section name, Edit/Occupancy switch, save state and Save. Undo, redo, duplicate section and grid-size options move into a single overflow menu.
- **Bigger, clearer touch targets.** All bar buttons at least 44px tall; selected cells get a stronger outline and a check mark so selection is obvious on a small bright screen; row/column header taps get a larger hit area.
- **Nudge pad.** Moving a selected block uses on-screen arrow buttons in the bottom bar (arrow keys keep working on desktop).
- **Grid gets the room.** On phones the side panel collapses into a sheet opened from the bottom bar, so the canvas uses the full width.
- **Fewer accidental edits.** A quick tap on an empty cell in select mode only toggles selection; adding a seat needs the explicit add action, so panning never creates seats.

## Technical notes

- Split `["seats", sectionId]` into `["layout", sectionId]` (seats + layout_objects) and `["occupancy", sectionId]` (allocations + partial payment rows), the latter `enabled: mode === "occupancy"`. Mutations touch only the layout key with `setQueryData` for the optimistic patch and `onError` rollback; drop the blanket `["allocations"]` invalidation from layout edits.
- Extract `CellView` from `LayoutCanvas.tsx` as a `memo` component receiving primitive props; keep the existing zoom/pan viewport untouched.
- In `src/lib/layout-ops.ts`, replace the per-row `for` loops in `moveBlock` and `renumberSeats` with grouped `upsert` calls (two phases retained: park in negative/temp values, then land), preserving the returned `LayoutAction` shape so undo/redo keeps working.
- New `src/components/admin/layout/SelectionBar.tsx` for the mobile bottom bar; the existing inspector panel is reused inside a `Sheet` under `lg`.
- Undo/redo history, local draft recovery, duplicate-seat warning, cascade-delete confirmations and the occupancy dialog all keep their current behaviour.
