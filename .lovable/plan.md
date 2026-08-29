# Improve the New Branch / Edit Branch dialog

All existing fields, saving behaviour and photo management stay exactly as they are. This is a usability and mobile pass on the same dialog.

## Problems today

- In edit mode you can only save from the last tab (Photos). Changing the phone number means clicking "Next Step" three times before "Save All Changes" appears.
- Closing the dialog accidentally silently throws away everything typed — no warning.
- The four tabs give no hint of what still needs filling; nothing shows which tab has an error or how far along onboarding is.
- On a phone the dialog is a cramped 95vw box with a bottom bar; long forms feel tight.
- Weak validation: phone accepts any text, the Google Maps link is never checked, and closing/opening times can be inverted with no warning.

## What changes

1. Mode-aware footer
   - Edit mode: a persistent `Save changes` button visible on every tab, plus `Previous` / `Next` for navigation. No forced walk to the last tab.
   - Create mode: keeps the wizard feel — `Next Step` through tabs, `Complete Onboarding` on the last one, but also a `Save & finish` shortcut once the required name is filled.
   - Save button disabled (with a subtle "No changes" label) when nothing is dirty in edit mode.

2. Unsaved-changes guard
   - Track a dirty flag against the initially loaded values.
   - Closing via X, overlay click or Escape while dirty opens a small confirm: `Discard changes?` / `Keep editing`.

3. Tab bar with status
   - Each tab shows a small dot: amber when a required/recommended field in it is empty, red when it holds a validation error, teal check when complete.
   - Create mode adds a thin progress line ("Step 2 of 4") above the tabs.
   - Failed validation on save jumps to the offending tab and focuses the field instead of only firing a toast.

4. Validation
   - Branch name required (as today), plus: phone must be 10 digits when filled, Google Maps link must be a valid `http(s)` URL, close time must be after open time unless "Open 24 hours", shift start before shift end.
   - Errors render inline under the field, not just as toasts.

5. Mobile layout
   - Dialog goes near full-screen on phones (`inset-0`, `h-[100dvh]`, no rounding) with safe-area padding top and bottom, same pattern already used by the student profile dialog.
   - Footer bar sticks to the bottom above the safe area; tab strip stays horizontally scrollable with 44px tap targets.

6. Small quality-of-life touches
   - `Use current location` button gets a clearer captured-state (shows resolved coordinates and a "Clear location" link).
   - Amenities tab gets a search box and `Select all` / `Clear` for the exam chips, which currently need a lot of scrolling.
   - Reopening the dialog always starts on `Basic & Location`, and edit-mode prefill re-runs when a different branch is opened.

## Technical notes

- Single file: `src/routes/_authenticated/admin.settings.tsx`, confined to the `LibraryFormDialog` component (plus passing an `onOpenChange` guard from the two `Dialog` wrappers in `SettingsPage` and `BranchCard`).
- The submit payload, `supabase.from("libraries")` insert/update calls, serializers (`serializeOpeningHours`, `serializeShifts`, `serializeClosedOn`) and `PhotoManagerView` are untouched.
- Dirty tracking uses a snapshot of the initial field values captured in the existing prefill `useEffect`; validation lives in one `validate()` helper returning per-field errors keyed by tab.
- Uses existing shadcn `AlertDialog` for the discard confirm; no new dependencies.
