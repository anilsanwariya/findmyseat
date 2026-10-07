<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Seat layouts use uniform seats; do not reintroduce corner or premium seat behavior because the distinction was intentionally retired.
- Keep branch fee-receiving settings separate from marketplace metadata; owner-only RLS protects edits and a narrow public RPC exposes only payment-page fields, so reminders never expose student records or trigger listing reapproval.
- Store owner QR images in a dedicated public image bucket with branch-scoped owner writes; WhatsApp shares a payment-page URL instead of attempting to attach images through text-only wa.me links.
- Share payment-detail formatting across dashboard and profile reminders and choose the allocation's branch, so reassigned students receive the correct payment destination.
- Payment-page previews use loader-fed branch cover metadata from a narrow public RPC; never put shared preview images on the root route, so branches without covers cannot inherit platform artwork.
