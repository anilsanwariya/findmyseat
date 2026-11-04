# Operations

How LibraryBandhu is watched, backed up and recovered.

## Monitoring

### Health check
`GET https://librarybandhu.com/api/public/health`

| Response | Meaning |
|---|---|
| `200 {"status":"ok","database":"ok"}` | Site and database are working |
| `503 {"status":"degraded","database":"down"}` | Site is up but can't reach the database |
| No response / 5xx | Site is down |

It reads one row from the public `master_exams` table with the publishable key. It never touches
private data and is never cached.

### GitHub uptime check (built in)
`.github/workflows/uptime.yml` runs every 15 minutes (GitHub may start it a few minutes late).
It checks the homepage, the health endpoint and the Android asset links. Each check gets
3 tries, 20 seconds apart.
- **Down** → opens an issue labelled `uptime` titled "librarybandhu.com is down". GitHub emails
  you about new issues, so make sure you're watching the repository with issue notifications on.
  While it stays down, each run adds a comment.
- **Back up** → the issue is closed with a comment.
- Run it by hand: **Actions → Uptime → Run workflow**.

### External monitor (recommended, 5 minutes to set up)
GitHub's schedule can lag, so add a free external monitor too, such as
[UptimeRobot](https://uptimerobot.com) or [Better Stack](https://betterstack.com):
1. Create a free account.
2. Add an **HTTP(s)** monitor for `https://librarybandhu.com/api/public/health`, checking every 5 minutes.
3. Set it to alert when the status code isn't 200 (or when the keyword `"status":"ok"` is missing).
4. Add your email and phone (SMS / mobile app push) as alert contacts.

## Backups

### Database (Lovable Cloud)
Lovable Cloud has built-in database backups, restore and export
([docs](https://docs.lovable.dev/features/database-backups)). In Lovable, open
**Cloud → Database → Backups** and confirm:
- [ ] Automatic backups are switched on, and how many days they're kept.
- [ ] You can see a recent backup with today's or yesterday's date.

Keep your own copy as well, because a backup that only lives in one place can be lost with it:
- **Monthly**, and **before any risky database change** (new migration, bulk data fix), export
  the database from Lovable and save it in a private, password-protected location (e.g. a
  Google Drive folder only you can open).
- The export contains student names, mobile numbers and payments. Never put it in the GitHub
  repository or share it.

### Other things to keep safe
| What | Where it lives | Backup |
|---|---|---|
| Code | GitHub `main` | GitHub (and Lovable) |
| Database | Lovable Cloud | Lovable backups + monthly export |
| Uploaded files (photos, ID cards, receipts, QR codes) | Lovable Cloud storage | Included only if the export covers storage; check in Lovable |
| Server secrets (Razorpay, service role key, email key) | Lovable Cloud secrets | Keep a copy in a password manager |
| Android signing key `android.keystore` + passwords | Owner's Mac | Google Drive / USB, plus a password manager |
| Play Console, Razorpay, domain logins | — | Password manager with 2-step verification |

## Restore (if data is lost or damaged)
1. Stop making changes: don't log payments or edit students until the restore is done.
2. Work out **when** the damage happened (time of the bad change).
3. In Lovable, **Cloud → Database → Backups**, restore the latest backup from **before** that
   time. The database is briefly unavailable during a restore.
4. Anything entered after that backup is lost. Re-enter it from WhatsApp, receipts or your own export.
5. Check a few known students' due dates and payments, then carry on.
6. Write down what happened in `docs/MEMORY.md`.

## When the site is down
1. Open `https://librarybandhu.com/api/public/health`:
   - **No response** → check Lovable (project status, recent publish). Republish the last
     working version if a publish broke it.
   - **`database: down`** → Lovable Cloud database issue; check Lovable's status page and support.
2. Check whether the last change merged on GitHub has a red ❌ in **Actions**, and revert it if so.
3. Students and owners can't log in during an outage; tell owners via WhatsApp if it lasts.
