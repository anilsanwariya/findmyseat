# Layout Builder Rework

A full rework of the seat layout screen: a proper zoomable canvas, faster bulk editing tools, a read-only occupancy map, and clearer save/undo safety. No changes to how allocations or payments work — the occupancy map is view-only.

## 1. Canvas that works on phone and tablet

- Wrap the grid in a zoom/pan viewport: pinch-to-zoom and two-finger pan on touch, ctrl/trackpad pinch and wheel zoom on desktop, plus `+` / `−` / "Fit to screen" buttons.
- Zoom anchors on the pinch midpoint or cursor so the seat you're looking at stays put; zoom range roughly 40%–250%.
- Cell size scales with zoom instead of being fixed, so a 15x15 grid can be viewed whole or zoomed in for accurate taps.
- Toolbar becomes a sticky top bar (branch/section pickers, mode switch, save, undo) and selection actions move to a bottom action bar on mobile so they're always reachable with a thumb.
- Row/column headers stay pinned while panning; long-press on a cell opens its quick menu.

## 2. Faster editing tools

- **Selection helpers:** tap row/column header to select a whole row or column, "select all empty cells", "invert selection", and a live counter of selected cells.
- **Move selection:** nudge a selected block by arrow keys or on-screen arrows, so a mis-placed block of seats can be relocated without delete + recreate.
- **Copy / paste block:** copy a selected rectangle of seats and area cells, then paste at another anchor cell (seat numbers auto-generated to avoid clashes).
- **Renumber:** re-run seat numbering over a selection with the existing order options (left-right, right-left, top-bottom, bottom-top, ascending/descending) and a prefix/start number.
- **Duplicate section:** copy an entire section's layout (grid size, seats, area objects, shift/fee config) into a new section, optionally in another branch.
- **Bulk edit stays** but gains facing/corner/reserved toggles applied to the whole selection at once.

## 3. Occupancy view (read-only)

- Mode switch on the toolbar: **Edit layout** / **Occupancy**.
- In Occupancy mode the same grid colours seats by status — vacant, occupied, partially paid, overdue — with a shift filter (Morning / Afternoon / Evening / Full day / Any) so you can see who is where in each shift.
- Tapping a seat opens a small read-only card: student name, shift, fee, due date, and a link that opens the existing student profile dialog. No allocate/free actions here.
- Header strip shows totals: seats, occupied, vacant, occupancy %, for the selected section and shift.
- Editing controls are hidden in this mode so nothing can be destroyed by accident while browsing.

## 4. Safety and clarity

- Persistent save state indicator: "All changes saved" / "N unsaved actions", with the save button emphasised only when there is something to save.
- Multi-step undo (full history stack) plus redo, with each step labelled ("Added 12 seats", "Deleted 3 items") in a small history popover.
- Confirmation dialogs list exactly what will be affected, naming students who will lose a seat before any destructive delete or grid shrink.
- Validation: duplicate seat numbers within a section are blocked and highlighted; shrinking a grid warns when seats fall outside the new bounds.
- Draft recovery banner keeps working, now showing when the draft was saved and how many pending actions it holds.

## Technical notes

- Split `src/routes/_authenticated/admin.layout-builder.tsx` (~2.1k lines) into `src/components/admin/layout/` parts: `LayoutToolbar`, `LayoutCanvas` (zoom/pan + grid), `CellView`, `InspectorPanel`, `OccupancyOverlay`, and the existing dialogs. The route file becomes state + data wiring only.
- Zoom/pan implemented with a non-passive native `wheel` listener and Pointer Events for pinch, `transform: translate() scale()` with `transform-origin: 0 0` on the grid wrapper, and cursor/midpoint anchoring so content doesn't drift.
- Occupancy data comes from a new query joining `allocations` (active) + shifts to seats for the selected section, reusing the partial/overdue status logic already used on the allocations screen; strictly read-only.
- Copy/paste, move, renumber and duplicate-section go through batched inserts/updates and the existing `shift_section_layout` / `delete_seats_cascade` RPCs, and each records a `LayoutAction` so undo covers them.
- Existing seat, section, shift and allocation records are untouched; no schema changes except, if needed, additive-only helper RPCs for block copy.
