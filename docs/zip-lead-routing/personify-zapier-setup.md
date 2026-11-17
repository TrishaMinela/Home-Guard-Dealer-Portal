# Personify and Zapier setup for approval

Nothing in this change was configured in Personify or Zapier. Do not enable a premium workflow, create a token, or edit the HGI Master Zap until the steps below are approved.

## Personify / HighLevel Conversations API

Home Guard's Personify tenant is the HighLevel-style CRM. The public API host is `https://services.leadconnectorhq.com`. No separate Personify Conversations API was found. Confirm the tenant's API base before a live token is created. `PERSONIFY_API_BASE` can override the host, and it must be https.

The adapter calls:

`POST /conversations/messages`

- Version header: `2021-07-28`
- Auth: sub-account private integration token (`Authorization: Bearer`)
- Scope: `conversations/message.write`
- Body: an email to a contact id, not an internal user id
- The message contains the ZIP and the Portal review link. It does not contain the homeowner's email, phone, or door details.

Official behavior checked for this change:

- Conversations API access is part of HighLevel plans. Public plan notes list Starter at about $97 per month, Unlimited at about $297, and Founder at about $497. A private integration token does not add a separate Conversations API fee by itself.
- Email and SMS usage still counts against the location's messaging limits. Workflow internal-notification docs cite a default cap of about 500 notifications per user per 5 minutes.
- There is no public API for the workflow action "Send Internal Notification." That request is still an open HighLevel idea. The current workaround people use is an Inbound Webhook trigger, which is a premium workflow feature. This adapter does not call an inbound webhook and does not create one.

### If a Personify workflow is approved later

Do not add an Inbound Webhook trigger.

The workflow people asked about would be built by hand in Personify, not by this pull request:

1. A non-premium trigger that can represent a new main-HGI lead. None is wired here.
2. ZIP If/Else branches that match the Portal territory table.
3. Assign to User for the salesperson who owns that ZIP.
4. Internal Notification with the Portal path `/sales/leads/{leadId}`. The link still requires a Portal login.

Until that non-premium trigger exists, the supported path is the Portal adapter above. Live mode also needs `PERSONIFY_PRIVATE_INTEGRATION_TOKEN`, `PERSONIFY_LOCATION_ID`, `PORTAL_URL`, and a `personify_contact_id` on the salesperson. Those values are not set in this change. If any are missing, live mode records nothing and makes no request.

`disabled` is the default and makes no request. `dry_run` writes a rehearsal row and makes no request.

## Zapier

Door Builder already posts every accepted lead to `ZAPIER_DOOR_BUILDER_WEBHOOK_URL` (the HGI Master Zap). America's Best also posts to `ZAPIER_AB_DOOR_BUILDER_WEBHOOK_URL`. WDM also posts to `ZAPIER_WDM_DOOR_BUILDER_WEBHOOK_URL`. Other slugs, including `/uhr`, use only the master webhook. Their `lead_source` values stay `HGI`, `AB`, `WDM`, or `{slug}-door-builder-lead`.

This pull request does not edit those zaps or those environment variables.

The master zap still receives main-HGI leads at submission. If that zap emails a dealer today, the Portal cannot stop it. Before ZIP routing is turned on in production, the approved zap change is:

- On the HGI Master Zap only, skip dealer assignment and dealer email when `lead_source` is `HGI` and `dealer_slug` is empty.
- Leave the America's Best branch, the WDM branch, and every other dealer-slug path unchanged.
- Do not point the Portal dealer adapter at `hooks.zapier.com`. The adapter rejects that host so it cannot call the master, AB, or WDM catch hooks.

Dealer email after an explicit Send Notification needs a separate approved transport in `DEALER_NOTIFICATION_WEBHOOK_URL`. No webhook is configured. There is no existing Portal mailer for lead delivery. Invitation email stays on the Supabase auth invite path and is not reused for leads.
