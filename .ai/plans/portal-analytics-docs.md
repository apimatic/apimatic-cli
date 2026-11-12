# Portal analytics: docs draft

A draft for the analytics page under docs.apimatic.io/v4 and the two rows of the CLI reference,
covering what PR 1 ships (apimatic/apimatic-io#2348, "Docs", and #2349's additions). It is not a
docs PR: the reviewer takes it to the apimatic-docs repository. Lines starting with
`> Reviewer:` are notes for that step, not page text. PR 2 (`portal.scripts`) and PR 3 (the
other seven events) each add to this page in their own docs step.

---

## Analytics

The portal loads Google Tag Manager and Google Analytics 4 from `portal.analytics` in
`src/apimatic.json`, and reports its own page views to both. Every setting is optional: set
either vendor, both, or neither.

```json
"portal": {
  "analytics": {
    "googleTagManager": { "containerId": "GTM-ABC123" },
    "googleAnalytics": { "measurementId": "G-ABC123" },
    "keepQueryParams": ["campaign_id"]
  },
  "seo": { "googleSiteVerification": "abc123" }
}
```

| Setting | What it is |
|---|---|
| `googleTagManager.containerId` | The container's ID, from the GTM admin page. |
| `googleTagManager.environment` | `{ "auth": "…", "preview": "env-3" }`: the `gtm_auth` and `gtm_preview` values from a GTM environment's snippet (Admin → Environments → Actions → Get Snippet), so a staging build loads the container's staging version. |
| `googleAnalytics.measurementId` | The GA4 web data stream's measurement ID. |
| `keepQueryParams` | Your own link tags to keep in reported page addresses (see below). |
| `seo.googleSiteVerification` | The content value of Google's site verification meta tag, for Search Console (see below). |

Paste each ID as the console shows it. The CLI checks that an ID is present and not blank, and
nothing else: a wrong ID fails at Google, where the tag does not load, not at build time.

### Reported page addresses

A reported `page_location` is the page's address without its `#` part and without its query
string, except for the tags attribution reads: `utm_*` and `hsa_*` parameters, and `_gl`,
`gclid`, `gbraid`, `wbraid`, `gad_source`, `dclid`, `fbclid`, `msclkid`, `ttclid`, `twclid`,
`li_fat_id`, `mc_cid`, `_hsenc`, `_hsmi` and `ref`. Everything else is dropped before any vendor
sees it. `keepQueryParams` adds your own names to that list.

Never list `code`, `state` or another name an OAuth answer uses. The portal's API playground
signs readers in through OAuth, and a kept answer would be written into every reported address.

### What the portal sends

On every page the portal writes to `window.dataLayer`, the queue both Google tags read. Each
report is two entries: `{ docs: null }`, which clears the previous event's details, then the
event with its details under one `docs` key.

```js
{ docs: null }
{ event: 'docs_page_view', docs: { page_title: 'Quickstart | Acme API', page_location: 'https://docs.acme.com/guides/quickstart' } }
```

| Event | Keys under `docs` | When |
|---|---|---|
| `docs_page_view` | `page_title`, `page_location` | The first page renders, and each later page change, once the new page's title is in place. Never twice for the same address, and never on `/oauth/callback`. |

With `googleAnalytics` set, the portal also sends each event to GA4 directly, under GA4's own
name: `docs_page_view` arrives as `page_view` with the same two parameters.

> Reviewer: PR 3 adds the other seven events (`docs_markdown_copy`, `docs_plugin_install`,
> `docs_sdk_download`, `docs_code_copy`, `docs_search`, `docs_not_found`, `docs_api_request`)
> and extends this table in its own docs step.

### Google Analytics 4

1. Create a web data stream for the portal's address and paste its measurement ID into
   `googleAnalytics.measurementId`.
2. Turn off the stream's own page-change counting: Admin → Data streams → your stream →
   Enhanced measurement (the gear) → Page views → Show advanced settings → untick "Page changes
   based on browser history events". The portal sends one `page_view` per page change itself;
   with the setting on, GA4 sends another, and every page change counts twice. `apimatic portal
   generate` prints a reminder whenever `googleAnalytics` is set.
3. Check it: open the portal with Google's Tag Assistant or the Google Analytics Debugger
   extension, so DebugView shows your session, then move between pages. DebugView must show one
   `page_view` per page change. Two per change means the setting in step 2 is still on; in
   reports, double counting shows as views climbing to about twice what readers saw.
4. Redact `code` and `state`: Admin → Data streams → your stream → Redact data → add both as
   query parameters. The portal never reports them, but GA4's own collection can read a page's
   full address, and this keeps a sign-in answer out of it either way.
5. With `googleAnalytics` set, do not also add a GA4 tag for the same stream inside the GTM
   container: every hit would count twice.

### Google Tag Manager

The container gets the events as GTM-format data layer pushes, so the usual recipe applies.

- **The Google tag** (the GA4 configuration) fires on Initialization – All Pages, as Google
  recommends, so it is ready before the first `docs_page_view`. Turn off "Send a page view event
  when this configuration loads", or the tag counts the first page itself.
- **Data Layer Variables** `docs.page_location` and `docs.page_title`. Every event's details sit
  under `docs`, and the portal clears `docs` before each event, so a variable never carries a
  value from the previous event.
- **A GA4 Event tag** with the event name `page_view`, the parameters `page_location` and
  `page_title` from those variables, and a Custom Event trigger on `docs_page_view`.
- Any other tag that should know about a page change triggers on `docs_page_view` the same way.

A staging build that must still be checked in GTM sets `environment` to the staging
environment's values, and loads that version of the container.

### Previews and staging

`apimatic portal serve` loads the same tags a hosted portal does, and its page views count like
anyone else's. While previewing, run it with `--no-analytics`, or define your own addresses as
internal traffic in GA4 (Admin → Data streams → your stream → Configure tag settings → Define
internal traffic) and filter it from reports.

`apimatic portal generate --no-analytics` builds a portal that loads neither vendor, for a
staging site that must not count.

> Reviewer: PR 2 extends `--no-analytics` to the `analytics` and `marketing` scripts in
> `portal.scripts`.

### Search Console

Verify the portal's domain as a Domain property, with the DNS TXT record Search Console gives
you; it needs nothing in the portal. For a URL-prefix property verified by the HTML tag method
instead, put the tag's content value in `seo.googleSiteVerification`, and every page carries
`<meta name="google-site-verification">`.

Google's Tag Assistant finds the tags on a portal page. Checks that read only the raw HTML do
not, because the portal loads its tags from its scripts once the page is up, not from a script
tag in the HTML.

### Consent

Consent is yours to collect in this release. A consent banner inside the GTM container works as
it does on any site, with Google's Consent Mode deciding what each tag may send. With
`googleAnalytics` set directly, GA4 runs under Consent Mode once your banner sends its update.
A banner of your own, outside GTM, waits for a later portal setting.

### Content Security Policy

If the portal's host sets a CSP, allow the domains in
[Google's CSP guide](https://developers.google.com/tag-platform/security/guides/csp): the
tag manager and Google tag script on `https://www.googletagmanager.com`, and GA4's collection on
`https://*.google-analytics.com` and `https://*.analytics.google.com`, plus whatever each tag
inside the container loads.

### Who can change the container

Access to the GTM container is access to the site's code: a tag can run any script on every
page, and read what readers type. Give it only to people you would give the repository to.

### Session replay

Session replay tools record what readers type. The API playground, where readers paste keys
and tokens, is wrapped in an element carrying the opt-out markers of PostHog (`ph-no-capture`),
FullStory (`fs-exclude`), rrweb (`rr-block`), Amplitude (`amp-block`), Hotjar
(`data-hj-suppress`), Microsoft Clarity (`data-clarity-mask`) and LogRocket (`data-private`),
so a replay shows the page with the playground blank. For any other tool, block the selector
`[data-portal-playground]` in its settings.

### After a sign-in

The playground's OAuth sign-in returns the reader to the endpoint page they left. The answer
never reaches the page's address: the playground takes it over through session storage, so the
reported address, the vendors' own page view and anything else that reads the address are
clean.

> Reviewer: this paragraph holds once fuma-nama/fumadocs#3809 is shipped and picked up, which
> is the PR's merge prerequisite. If the wait of step 1.3 comes back instead, the paragraph
> becomes: the tags start once the playground has removed the answer, up to 5 seconds later, or
> on the next page change.

### Using another tag manager

The portal writes GTM-format events to `window.dataLayer` on every portal, whether or not a
Google tag is set. To use another tag manager, load it through your host or, from PR 2,
through `portal.scripts`; turn on its GTM data-layer option, so it reads `docs_page_view` and
the `docs` details; and turn off its own page-change tracking, or page changes count twice.

---

## CLI reference

In `v4/src/content/apimatic-cli/cli-reference.mdx`, both `apimatic portal generate` and
`apimatic portal serve` gain the row, worded as the flag's description:

| Flag | Description |
|---|---|
| `--no-analytics` | leave out Google Tag Manager, Google Analytics and every analytics or marketing script, for staging. |
