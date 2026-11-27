# Draft email templates — not applied

These files are drafts for Trisha to approve. They are **not** connected to Supabase, and this change does **not** update the live email templates or authentication settings.

The portal already asks Supabase to send mail:

- Dealer invitations use Supabase `inviteUserByEmail`. The link sends the person to `/auth/invite` on the production portal (`https://home-guard-dealer-portal.vercel.app/auth/invite`), unless `PORTAL_INVITE_REDIRECT_URL` or `PORTAL_URL` is set on the server.
- Password resets use Supabase `resetPasswordForEmail`. The link sends the person to `/auth/reset-password` on the production portal, except when the request is made from a developer’s own computer.

Supabase still uses its own built-in Invite user and Reset password templates until someone pastes an approved draft into the Supabase dashboard. Do that only after review. Do not change the Site URL or redirect allow list as part of this draft.

## Suggested sender

- Sender name: **Home Guard Industries**
- Sender address to verify later: `noreply@homeguardindustries.com`

The address has to be a sender Supabase is allowed to use. This draft does not verify or change it.

## Subjects

| Email | Subject |
| --- | --- |
| Invitation | You're invited to the Home Guard Industries Dealer Portal |
| Password reset | Reset your Home Guard Industries Dealer Portal password |

## How to apply later

1. Open the Supabase project used by the dealer portal.
2. Go to Authentication, then Email Templates.
3. For **Invite user**, paste `dealer-invite.html` and set the subject above.
4. For **Reset password**, paste `password-reset.html` and set the subject above.
5. Send a test invitation to a Home Guard address before inviting a dealer.

The templates use Supabase’s `{{ .ConfirmationURL }}` link. Leave that placeholder as written so the secure link still works.
