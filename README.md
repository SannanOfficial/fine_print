# Fine Print

A public, dated record of the terms that healthcare software platforms (EHRs, billing and credentialing services, telehealth networks and directories) ask clinicians to accept, and every change to them, shown as a redline.

Each company's page (`/headway`) is its record at a glance, for judging how it treats the clinicians who rely on it: plain counts (changes recorded, in the last 12 months, shared privately by clinicians, tracked since), then one timeline of every change to every document it publishes, each with its date and summary. **Download the record (PDF)** (`/headway/timeline.pdf`) gives the same content as a PDF to save, print or share; each change in it links to its redline. Fine Print reports what changed; it doesn't score companies.

## How it fits together

```
/admin/platforms        What we track, stored in the database and edited by admins.
src/core/platforms.ts   The starting list (loaded by `npm run db:setup`) and the
                        rules every platform and document must meet.
scripts/crawl.ts        Checks each automatic document, records new versions,
                        and asks an AI model for a summary of each change.
scripts/capture.ts      Imports a page saved in a browser, for sites we can't fetch.
scripts/summarize.ts    Writes missing summaries, or redoes one.
scripts/status.ts       One-screen health report of the record and the jobs.
scripts/admin.ts        Creates and manages admin accounts.
scripts/newsletter.ts   Sends the weekly email of changes to subscribers.
src/app/                The website (Next.js 16): the public record, the private
                        submission form (/submit) and the admin pages (/admin).
deploy/                 systemd units: the website, and timers for the crawler (twice a day) and the weekly newsletter.
```

There are two processes with separate database users:

| Process | Database user | Can write |
| --- | --- | --- |
| Website (`next start`) | `MONGODB_SITE_URI`, role `fineprintSite` | The platform list, new versions (insert only), check status, submissions, summaries, sessions, rate-limit counters. |
| Crawler and scripts | `MONGODB_WRITE_URI`, role `readWrite` | Everything |

The website can add versions, so admins can record them, but its database role has no permission to update or delete one. Even a bug in the website, or a stolen admin password, cannot rewrite what a platform's terms said. A unique index also stops two versions from ever claiming the same predecessor, so the history can't fork.

## Local setup

Needs Node 24+ and MongoDB 7+.

```bash
npm install
cp .env.example .env.local      # fill it in (see below)
npm run db:setup                # create indexes and load the starting platform list
npm run admin -- add you@example.com "Your Name"   # prints a password once
npm run crawl -- --dry-run      # fetch and extract only; saves nothing
npm run crawl                   # first real capture
npm run dev
```

Create the database users once, in `mongosh` as a database admin. The site role can read everything but write only where listed:

```js
use fine_print
db.createRole({
  role: "fineprintSite",
  privileges: [
    { resource: { db: "fine_print", collection: "" }, actions: ["find"] },
    { resource: { db: "fine_print", collection: "platforms" }, actions: ["insert", "update", "remove"] },
    { resource: { db: "fine_print", collection: "versions" }, actions: ["insert"] },
    { resource: { db: "fine_print", collection: "status" }, actions: ["insert", "update", "remove"] },
    { resource: { db: "fine_print", collection: "checks" }, actions: ["insert"] },
    { resource: { db: "fine_print", collection: "submissions" }, actions: ["insert", "update", "remove"] },
    { resource: { db: "fine_print", collection: "submission_files" }, actions: ["insert", "remove"] },
    { resource: { db: "fine_print", collection: "summaries" }, actions: ["insert", "update"] },
    { resource: { db: "fine_print", collection: "sessions" }, actions: ["insert", "remove"] },
    { resource: { db: "fine_print", collection: "rate_limits" }, actions: ["insert", "update"] },
    { resource: { db: "fine_print", collection: "subscribers" }, actions: ["insert", "update", "remove"] },
    { resource: { db: "fine_print", collection: "events" }, actions: ["insert", "remove"] },
  ],
  roles: [],
})
db.createUser({ user: "fineprint_site", pwd: passwordPrompt(), roles: ["fineprintSite"] })
db.createUser({ user: "fineprint_crawler", pwd: passwordPrompt(), roles: [{ role: "readWrite", db: "fine_print" }] })
```

If you created the role earlier, add the newer permissions (admins recording versions, and the newsletter) with:

```js
db.grantPrivilegesToRole("fineprintSite", [
  { resource: { db: "fine_print", collection: "platforms" }, actions: ["insert", "update", "remove"] },
  { resource: { db: "fine_print", collection: "versions" }, actions: ["insert"] },
  { resource: { db: "fine_print", collection: "status" }, actions: ["insert", "update", "remove"] },
  { resource: { db: "fine_print", collection: "checks" }, actions: ["insert"] },
  { resource: { db: "fine_print", collection: "subscribers" }, actions: ["insert", "update", "remove"] },
  { resource: { db: "fine_print", collection: "events" }, actions: ["insert", "remove"] },
])
```

(Use your own database name if it isn't `fine_print`. An older `fineprint_web` user with the `read` role can be dropped once the site uses `fineprint_site`.)

Generate the encryption key for private submissions with `openssl rand -base64 32` and put it in `FINEPRINT_DATA_KEY`. **Back it up somewhere safe, apart from the database.** Without it, stored submissions cannot be read.

## The crawler

- Fetches only `https` URLs from the platform list. Redirects may only go to hosts listed for that document.
- Connects only to public internet addresses. A document address that points at this machine or a private network is refused, whatever an admin enters.
- Identifies itself as `FinePrintBot`, follows robots.txt and pauses 4 seconds between requests.
- Never runs page JavaScript. HTML is parsed as text and only the element named by the document's `selectors` is kept.
- Limits: 30 s timeout, 5 redirects, 5 MB per page.
- **Confirms changes:** when the text differs from the last version, it waits 90 seconds and fetches again. It records a change only if both fetches agree.
- **Rejects broken extractions:** if the text suddenly shrinks by more than half, it flags an extraction failure instead of recording a "change". This usually means the site's layout changed and a selector needs updating. If the document really did get that much shorter, record the new text once by hand at `/admin/record`; the crawler then compares against it.
- **Ignores typography and links:** curly or straight quotes, dashes, link addresses and inline formatting don't count as a change in wording. Pages are decoded in their own character set, so a page served as windows-1252 is stored correctly.
- **Stops when the database is down**, rather than keep loading sites it can't record. It prints a one-line tally at the end of each run and exits non-zero only when every site failed (almost always this server's own network).
- A lock in the database prevents overlapping runs.
- **Help-centre articles:** documents hosted on a Zendesk help centre (Alma's and Rula's provider terms) are marked `source: "zendesk-api"`. The crawler reads them from the help centre's public article API (`/api/v2/help_center/<locale>/articles/<id>.json`), which returns the same text as the page. The page itself sits behind a browser-only Cloudflare check. robots.txt is checked for the API address as usual.

- **Summaries:** after recording a change, it sends the changed paragraphs (never the whole document, never anything private) to OpenAI and stores a short plain-language summary. Default model `gpt-5.4-mini`, about a cent per change; set `OPENAI_MODEL` to change it. A failed summary never fails the crawl. Run `npm run summarize` to fill any gaps.

Every check is logged to the `checks` collection, which keeps 180 days. Each document's latest result, including internal error details, is in `status`. The website shows only a plain-language summary. `npm run status` prints it all in one screen, and exits with code 2 when a document has failed three checks in a row, which a cron job or health-check service can watch.

### Schedule

Twice a day, at 09:00 and 21:00 UTC (around 5 a.m. and 5 p.m. US Eastern), with up to 30 minutes of random delay. See `deploy/`. With cron instead:

```cron
0 9,21 * * *  cd /home/deployment/fine_print/current && /usr/bin/node-24 --env-file=/etc/fineprint/crawler.env scripts/crawl.ts --jitter 30 >> /var/log/fineprint-crawl.log 2>&1
```

### Documents captured by hand

Some sites block automated requests (Headway and TherapyNotes use Cloudflare challenges) or only show their terms after JavaScript runs (SimplePractice). For those, open the document's page under `/admin/platforms` and use **Record a new version**:

1. Get the text: **Fetch from the public page**, upload a page saved from your browser ("Save page as…" → "Webpage, HTML only"), or paste it.
2. Check the text, then **Preview the changes** to see the redline against the current version.
3. **Record this version.** It is marked "Captured by hand" on the site, and the AI summary is written in the background.

The same works from the command line: `npm run capture -- simplepractice/terms-of-service ~/Downloads/terms.html --dry-run`, then again without `--dry-run`.

### Earlier versions and reported events

Versions from before a document joined the record (for example copies kept by the Internet Archive, shown as "From the Internet Archive" with the date the archive first saw them) are added in bulk from a prepared JSON plan, with their change summaries and any reported events:

```sh
npm run import -- plan.json --dry-run
npm run import -- plan.json
```

The format is described at the top of `scripts/import-record.ts`. A history marked `replace` takes the place of the versions recorded so far, so do this only before anyone relies on those versions' addresses. Running the same plan again keeps the versions as they are and only refreshes AI summaries no editor has touched. Single events can also be added and removed on the platform's admin page, under **Reported events**.

## Change summaries

Each change gets an AI draft, shown publicly with the label "not yet checked by an editor". Admins review them at `/admin`: edit the headline and points, then **Publish as reviewed**, or **Hide summary**. A reviewed or hidden summary is never overwritten by the crawler.

The text sent to the model comes from the platform being tracked, which could hide instructions in its page to play a change down. So a draft that names a web or email address (which the instructions forbid) is never published; the change waits on the desk for an editor to summarise by hand. To ask for a fresh draft:

```bash
npm run summarize -- --id <version id> --force
```

## Private submissions

Clinicians can send terms or policy updates they were shown privately at `/submit`, with their contact details so an editor can confirm the submission.

- Everything except the platform name and status is encrypted with AES-256-GCM before it reaches the database, using `FINEPRINT_DATA_KEY`, which only the website holds.
- Files: up to 3, 8 MB in total. PDF, PNG, JPEG and WebP are recognised by their contents, not their names; `.txt` and `.eml` must be valid text. Admins can only download them, never view them on the site.
- Spam: a hidden trap field, plus limits of 5 submissions an hour and 20 a day per IP address, and 500 a day overall.
- Submissions are never sent to an AI service.
- Admins review them at `/admin`. They can set a status, keep private notes, and delete a submission for good. Once confirmed, **Add to the record** opens the matching document's recording form with the submitted text filled in. The version is marked "Shared by a clinician", with no public address, and the submission is marked "Added to the record".

## Newsletter

Anyone can subscribe on the home page to a weekly email about every tracked platform (including ones added later), or on a platform's page (or any of its documents' pages) to that platform alone. Ticking every platform on the manage page counts as following everything. The address they type is kept in the browser tab's `sessionStorage` and filled in on the next platform's form, still editable.

- **Confirmed first.** A sign-up only sends a confirmation email. Nothing else is sent until its owner clicks the link and presses **Confirm** (a plain visit changes nothing, so link scanners can't confirm). Unconfirmed sign-ups delete themselves after 7 days. The reply is the same whether or not an address is already subscribed, and sign-ups are limited per address and per IP.
- **Private.** Addresses are encrypted with `FINEPRINT_DATA_KEY`, and found by a keyed hash. Links in emails are signed with the same key, so they can't be guessed or altered.
- **Weekly.** `npm run newsletter` emails each subscriber the changes recorded since their last email on the platforms they follow: the date, how much changed, the AI summary (labelled, and left out if an editor hid it), and a link to the redline. **Anyone with no changes gets nothing.** Each subscriber's place only moves on once their email is sent, so a failed send is retried next week and running it twice sends nothing twice. `--dry-run` shows who would get what.
- **Bounces.** An address the receiving server refuses outright three weeks running is deleted. A problem on our side (a wrong SMTP password, the provider refusing the sender address, no connection) stops the run instead, and no subscriber is counted as bouncing.
- **Easy to leave.** Every email links to a page to change platforms or unsubscribe (which deletes the address), and carries one-click unsubscribe headers for mail apps.

Email goes out over SMTP, so any provider works (Postmark, Resend, Amazon SES, Mailgun…). Set `MAIL_FROM` and `SMTP_URL` for both the website (confirmation emails) and the newsletter job. For local testing, set `MAIL_OUTBOX_DIR` instead of `SMTP_URL`: emails are written to that folder as `.eml` files and nothing is sent. To schedule it, install `deploy/fineprint-newsletter.timer` (Mondays, 14:00 UTC) like the crawler's.

## Admins

There is no sign-up page. Accounts exist only if someone with database access creates them:

```bash
npm run admin -- add editor@example.com "Editor Name"   # prints a random password once
npm run admin -- reset editor@example.com               # new password, signs out everywhere
npm run admin -- disable editor@example.com             # blocks sign-in, signs out everywhere
npm run admin -- list
```

Sign in at `/admin/login`. Sessions last 12 hours, in an HttpOnly, Secure, SameSite=Strict cookie. Only a hash of the session token is stored. Only failed sign-ins count against the limits: 5 per account from one address, 30 per account and 20 per address every 15 minutes.

## Adding a platform

At `/admin/platforms`: **Add a platform**, then **Add a document** for each agreement to track. For automatic checks, give the document's public address and, under "Where the text is on the page", a CSS selector that holds only the terms text (`main` or `article` fit most sites). Then use **Fetch from the public page** on the document's page to check the selector picks up the right text, and record the first version. The crawler picks up new documents on its next run.

Short names (the `simplepractice` in `/simplepractice/terms-of-service`) can't be changed once created. A platform or document can only be deleted while nothing has been recorded for it.

## Deploying

Production runs on the VPS at `148.230.84.61` (Fedora 42) as the `deployment` user, behind nginx and Cloudflare, at https://fineprint.syedsannan.com.

**Every push to `main` deploys itself** (`.github/workflows/ci-cd.yml`):

1. **Check:** install, audit production dependencies, type-check, lint, unit tests and a full build. Pull requests run this too.
2. **Upload:** the code goes to a new release folder, `~/fine_print/releases/<time>-<commit>`, over SSH with a key that can only be used for this (it's in the `production` environment's secrets, which only `main` can use, with the server's host keys pinned).
3. **Go live:** `deploy/remote-deploy.sh` runs on the server. It installs and builds inside the new folder while the live site keeps running, points `~/fine_print/current` at it, restarts the site and checks that the home page answers 200 and an unknown page 404. If not, it switches back to the previous release. The newest five releases are kept.

**On the server:**

```
~/fine_print/current            The live release (a link into releases/).
~/fine_print/releases/          Recent releases.
/etc/fineprint/*.env            Settings and secrets, root only: web, crawler, newsletter; build.env (public values the build needs).
/etc/fineprint/mongodump.yaml   The backup's database connection.
/etc/systemd/system/fineprint-* The website (port 3005), crawl twice a day, weekly email, nightly backup (from deploy/).
/etc/nginx/sites-enabled/fineprint.syedsannan.com   From deploy/nginx/, with HTTPS added by certbot.
/etc/sudoers.d/fineprint-deploy Lets `deployment` restart the website, and nothing else.
/var/lib/fineprint-backups/     A compressed database dump each night, kept 14 days.
```

- **Node 24** comes from Fedora's `nodejs24` package (`/usr/bin/node-24`); the system's `node` stays at 22 for the other apps.
- **MongoDB 7.0**, listening on localhost with logins required. MongoDB 8.x refuses to start on this server's Linux 6.19 kernel (SERVER-121912, fixed in kernel 7.0.14).
- **The site listens on `localhost`** (`::1` here). Not `127.0.0.1`: given an IP address, Next.js treats its own internal rewrites (the 404 page) as requests to another site and fails them.

Everyday commands, as root:

```bash
systemctl status fineprint-web                 # the website; journalctl -u fineprint-web for its log
systemctl start fineprint-crawl                # check every document now; journalctl -u fineprint-crawl
systemctl list-timers 'fineprint-*'            # when the crawl, email and backup run next
cd /home/deployment/fine_print/current && set -a && . /etc/fineprint/crawler.env && set +a && sudo -u deployment -E node-24 scripts/status.ts
# Roll back by hand: point current at an older release and restart.
sudo -u deployment ln -sfn /home/deployment/fine_print/releases/<id> /home/deployment/fine_print/current && systemctl restart fineprint-web
```

To add an admin, run on the server (the password is printed once, to you):

```bash
cd /home/deployment/fine_print/current && set -a && . /etc/fineprint/crawler.env && set +a && sudo -u deployment -E node-24 scripts/admin.ts add you@example.com "Your Name"
```

To turn on **email** (confirmations, receipts and the Monday email), set `SMTP_URL` in `/etc/fineprint/web.env` and `newsletter.env`, then `systemctl restart fineprint-web` and `systemctl enable --now fineprint-newsletter.timer`. For **AI summaries**, set `OPENAI_API_KEY` in `web.env` and `crawler.env`. Settings changed in `build.env` take effect on the next deploy.

**Back up `FINEPRINT_DATA_KEY`** (in `/etc/fineprint/web.env`) somewhere safe, apart from the server. Without it, stored submissions and subscriber addresses can't be read, from the database or from a backup. Copy the nightly backups off the server too.

General notes, for this or any other server:

- The site caches database reads in memory for up to 10 minutes (the `record` profile in `next.config.ts`), so a busy link barely touches MongoDB. Changes made outside the admin pages (scripts, the crawler) show up within that time.
- Give the web process `MONGODB_SITE_URI`, `FINEPRINT_DATA_KEY`, `FINEPRINT_SITE_URL` (links in emails; with `SMTP_URL` set, no email is sent without it), `MAIL_FROM`, `SMTP_URL`, and `OPENAI_API_KEY` if versions recorded at `/admin` should get AI summaries. Give the crawler `MONGODB_WRITE_URI` and `OPENAI_API_KEY`, and the newsletter `MONGODB_WRITE_URI`, `FINEPRINT_DATA_KEY`, `MAIL_FROM`, `SMTP_URL` and `FINEPRINT_SITE_URL`.
- `FINEPRINT_CONTACT_EMAIL` should be an address a person reads. It appears in the footer, on submission receipts and in the crawler's User-Agent, and is the reply address of every email the site sends.
- Set up SPF, DKIM and DMARC for the sending domain with your email provider, or the weekly emails will land in spam.
- The systemd units forbid writing anywhere but the app's own folder (`ProtectSystem=strict`, home directories hidden). If you ever point the newsletter service at `MAIL_OUTBOX_DIR`, add `ReadWritePaths=` for that folder.
- Rate limits use the visitor's IP address as the proxy reports it: the **last** `X-Forwarded-For` entry. The nginx site here takes the address from Cloudflare's `CF-Connecting-IP` header, but only for requests from Cloudflare's own addresses, and sends it as the only `X-Forwarded-For` entry. Elsewhere: Caddy's `reverse_proxy` does the right thing by default; with nginx alone use `proxy_set_header X-Forwarded-For $remote_addr;`. Headers such as `X-Real-IP` are ignored by the site. `FINEPRINT_CLIENT_IP_HEADER` can name another header if a CDN sets one. IPv6 visitors are limited per /64 block.
- Submissions can be up to 9 MB, so allow that body size in the proxy (`client_max_body_size 10m;` in nginx).
- If you ever run more than one instance of the website, set the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` on all of them.
- Bind MongoDB to localhost or a private network. Never expose it publicly.

## Search engines

- **Every page** has its own title, description, canonical address, link-preview tags (Open Graph and Twitter, with `src/app/opengraph-image.png`) and structured data (schema.org JSON-LD: the site and its publisher on the home page, breadcrumbs everywhere, and which platform's document a page is about).
- **Complete pages for everyone.** `htmlLimitedBots: /.*/` in `next.config.ts` puts every page's metadata in `<head>` and sends the finished page in the first response, so crawlers that don't run JavaScript, link previews and SEO tools see the same page as Google.
- **`/sitemap.xml`** lists every public page and every redline, dated by its last change. **`/robots.txt`** points to it and keeps `/admin` and the newsletter's personal links out; those pages, receipts and 404s also say `noindex`.
- **`/feed.xml`** is an Atom feed of the latest 50 changes, linked from every page, for feed readers and for search engines to find new redlines quickly.
- Addresses typed with capitals (`/Headway`) or a trailing slash redirect to the real page; unknown addresses answer with a real 404.

After going live:

1. Build and run with the same `FINEPRINT_SITE_URL` (`https://fineprint.syedsannan.com`, the default). Some pages are built ahead, so the build needs it too.
2. In [Google Search Console](https://search.google.com/search-console), add the site. A **Domain** property for `syedsannan.com` (verified with a DNS record) covers this subdomain and any others; or add a URL-prefix property for `https://fineprint.syedsannan.com` and set `FINEPRINT_GOOGLE_SITE_VERIFICATION` to the code it gives you, then rebuild.
3. Submit `https://fineprint.syedsannan.com/sitemap.xml` there, and in [Bing Webmaster Tools](https://www.bing.com/webmasters) (which can import from Search Console, or use `FINEPRINT_BING_SITE_VERIFICATION`). Bing's index also feeds DuckDuckGo and others.
4. Link to the site from `syedsannan.com`. A link from your main site is the quickest way for search engines to find and trust a new subdomain.

## Tests

```bash
npm test          # diff, text, crawler checks, links and the newsletter
npm run lint
npm run typecheck # run `npx next typegen` first on a fresh clone
```

Fine Print is not legal advice and is not affiliated with any platform it tracks.

## License

The code is released under the [MIT License](LICENSE). The recorded terms belong to the platforms that publish them; Fine Print keeps copies as a public record. The Source Serif 4 typeface is used under the SIL Open Font License.
