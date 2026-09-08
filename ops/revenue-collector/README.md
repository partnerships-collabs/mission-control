# Revenue collector host migration runbook

This directory owns the operating template for moving the daily revenue
collector out of a logged-in macOS user session. It does **not** install, load,
or enable anything by itself.

## Target and standby architecture

The final scheduler is a system LaunchDaemon on the always-on Mac Mini. It runs
as the named non-root user `ari`. Before cutover, stage the same new collector
runtime on the Mac Studio as an unloaded standby LaunchDaemon running as
`aurora`. The two candidates must use the same reviewed production commit.

| Item | Final Mac Mini | Staged Mac Studio standby |
| --- | --- | --- |
| Service user | `ari` | `aurora` |
| Clean checkout | `/Users/ari/Services/mission-control` | `/Users/aurora/Services/mission-control` |
| Virtual environment | `/Users/ari/Services/venvs/mission-control-revenue` | `/Users/aurora/Services/venvs/mission-control-revenue` |
| Approved secret loader | `/Users/ari/.openclaw/workspace/scripts/secret_loader.py` | `/Users/aurora/.openclaw/workspace/scripts/secret_loader.py` |
| Private logs | `/Users/ari/Library/Logs/CreatorsAgency/revenue-collector` | `/Users/aurora/Library/Logs/CreatorsAgency/revenue-collector` |
| Runtime state/config | `/Users/ari/Library/Application Support/CreatorsAgency/revenue-collector` | `/Users/aurora/Library/Application Support/CreatorsAgency/revenue-collector` |
| Installed plist | `/Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist` | `/Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist` |
| Schedule | Daily at 12:00 PM in the host's local time zone | Daily at 12:00 PM if activated for failover |

The wrapper uses a non-blocking process lock and makes at most three complete
attempts, with five- and fifteen-minute delays. It sends a Telegram failure
alert only after all attempts fail. The Telegram destination is read from a
private, service-user-owned mode-`0600` file; it is not stored in this public
repository or in the plist. The plist sends inherited stdout and stderr to
`/dev/null` because the wrapper already captures collector output in its private
`collector.log`.

If the MSN credential is absent or unreadable, the wrapper still starts the
collector. That allows the collector to POST an honest degraded attempt to the
versioned `/revenue/collection-run` route. A degraded attempt must not become a
verified/public snapshot.

## Current scheduler and alerting

The old live job is still a login-session LaunchAgent on the Mac Studio:

- Plist: `/Users/aurora/Library/LaunchAgents/com.ari.revenue-collector.plist`
- GUI-domain label: `gui/501/com.ari.revenue-collector`
- Schedule: daily at 12:00 PM Central
- Detailed log: `/tmp/revenue_collector.log`
- launchd stdout/stderr: `/tmp/revenue_collector_launchd.log`

The old wrapper sends a best-effort Telegram alert only on non-zero exit. It has
no success heartbeat, its logs are volatile across reboot, and it depends on
the `aurora` GUI session. Keep this job disabled once the new runtime owns the
schedule.

## Hard pre-cutover gates

Do not disable the old job or load either new LaunchDaemon until every gate
below passes:

1. Deploy the reviewed Convex schema and the versioned
   `/revenue/collection-run` ingestion route through the approved production
   path, together with the matching health and Smiirl read routes.
2. Stage the new runtime on **both** the Mac Mini and Mac Studio at the exact
   same reviewed production SHA. Both checkouts must be clean.
3. On both hosts, the approved `secret_loader.py` must resolve
   `mission_control_activity`, `close`, `impact_sid`,
   `impact_reporting_password`, `redventures_client_id`,
   `redventures_client_secret`, `adsbymoney`, and `ari_telegram_bot` without a
   plaintext fallback.
4. On both hosts, provision a dedicated read-only MSN Google identity and the
   private Telegram destination file. Do not copy a broad legacy Google
   credential.
5. On both hosts, the pinned tests and a `--dry-run` must pass with fresh,
   accepted values for Close, Impact, RedVentures, AdsByMoney, and MSN. A
   failed, reused, unexpectedly zero, wrong-currency, or wrong-period source
   blocks cutover.
6. Record the current production snapshot and public Smiirl number. Schedule
   cutover outside 11:45 AM–1:30 PM Central.

## One-time staging on the Mac Mini

Run these commands as `ari` unless a command explicitly uses `sudo`.

1. Create and pin a clean checkout:

   ```bash
   mkdir -p /Users/ari/Services /Users/ari/Services/venvs
   git clone https://github.com/partnerships-collabs/mission-control.git \
     /Users/ari/Services/mission-control
   cd /Users/ari/Services/mission-control
   git fetch --prune origin
   git checkout --detach <reviewed-production-sha>
   git status -sb
   git rev-parse HEAD
   ```

2. Build the dedicated virtual environment:

   ```bash
   /opt/homebrew/bin/python3 -m venv \
     /Users/ari/Services/venvs/mission-control-revenue
   /Users/ari/Services/venvs/mission-control-revenue/bin/python -m pip \
     install --upgrade pip
   /Users/ari/Services/venvs/mission-control-revenue/bin/python -m pip \
     install --requirement \
     /Users/ari/Services/mission-control/ops/revenue-collector/requirements.txt
   /Users/ari/Services/venvs/mission-control-revenue/bin/python -m pip check
   ```

3. Create the private directories and wrapper log:

   ```bash
   umask 077
   mkdir -p \
     /Users/ari/Library/Logs/CreatorsAgency/revenue-collector \
     "/Users/ari/Library/Application Support/CreatorsAgency/revenue-collector"
   touch /Users/ari/Library/Logs/CreatorsAgency/revenue-collector/collector.log
   chmod 700 /Users/ari/Library/Logs/CreatorsAgency/revenue-collector \
     "/Users/ari/Library/Application Support/CreatorsAgency/revenue-collector"
   chmod 600 /Users/ari/Library/Logs/CreatorsAgency/revenue-collector/collector.log
   ```

4. Create the private Telegram destination without placing its value in shell
   history or command arguments:

   ```bash
   umask 077
   read -r -s -p "Telegram chat ID: " revenue_telegram_chat_id
   printf '\n'
   printf '%s\n' "$revenue_telegram_chat_id" > \
     "/Users/ari/Library/Application Support/CreatorsAgency/revenue-collector/telegram-chat-id"
   unset revenue_telegram_chat_id
   chmod 600 \
     "/Users/ari/Library/Application Support/CreatorsAgency/revenue-collector/telegram-chat-id"
   stat -f '%Su:%Sg %Lp' \
     "/Users/ari/Library/Application Support/CreatorsAgency/revenue-collector/telegram-chat-id"
   ```

   The final line must report owner `ari` and mode `600`. Never print the file.

5. Provision the dedicated read-only MSN credential through the approved
   private secret-sync path at:

   ```text
   /Users/ari/Library/Application Support/CreatorsAgency/revenue-collector/msn-google-service-account.json
   ```

   It must be owned by `ari:staff`, mode `0600`, and limited to read-only access
   to the required Counter sheet. Do not paste its contents into a shell or log.

6. Verify 1Password authority without printing values:

   ```bash
   for key in \
     mission_control_activity close impact_sid impact_reporting_password \
     redventures_client_id redventures_client_secret adsbymoney ari_telegram_bot
   do
     if /opt/homebrew/bin/python3 \
       /Users/ari/.openclaw/workspace/scripts/secret_loader.py "$key" \
       >/dev/null 2>&1
     then
       echo "$key: ready"
     else
       echo "$key: unavailable"
       exit 1
     fi
   done
   ```

7. Run the tests and connector dry run:

   ```bash
   cd /Users/ari/Services/mission-control
   /Users/ari/Services/venvs/mission-control-revenue/bin/python \
     scripts/test_revenue_collector.py

   HOME=/Users/ari \
   PYTHONPATH=/Users/ari/.openclaw/workspace \
   MSN_GOOGLE_SERVICE_ACCOUNT_FILE="/Users/ari/Library/Application Support/CreatorsAgency/revenue-collector/msn-google-service-account.json" \
   /Users/ari/Services/venvs/mission-control-revenue/bin/python \
     scripts/revenue_collector.py --dry-run
   ```

8. Install, but do not load, the root-owned plist:

   ```bash
   plutil -lint \
     /Users/ari/Services/mission-control/ops/revenue-collector/co.creatorsagency.revenue-collector.plist
   sudo install -o root -g wheel -m 0644 \
     /Users/ari/Services/mission-control/ops/revenue-collector/co.creatorsagency.revenue-collector.plist \
     /Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist
   sudo plutil -lint \
     /Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist
   ```

## One-time staging on the Mac Studio standby

Complete this before cutover too. Run as `aurora` unless a command uses `sudo`.

1. Create and pin the clean checkout and dedicated venv:

   ```bash
   mkdir -p /Users/aurora/Services /Users/aurora/Services/venvs
   git clone https://github.com/partnerships-collabs/mission-control.git \
     /Users/aurora/Services/mission-control
   cd /Users/aurora/Services/mission-control
   git fetch --prune origin
   git checkout --detach <the-same-reviewed-production-sha>
   git status -sb
   git rev-parse HEAD

   /opt/homebrew/bin/python3 -m venv \
     /Users/aurora/Services/venvs/mission-control-revenue
   /Users/aurora/Services/venvs/mission-control-revenue/bin/python -m pip \
     install --upgrade pip
   /Users/aurora/Services/venvs/mission-control-revenue/bin/python -m pip \
     install --requirement \
     /Users/aurora/Services/mission-control/ops/revenue-collector/requirements.txt
   /Users/aurora/Services/venvs/mission-control-revenue/bin/python -m pip check
   ```

2. Repeat Mini staging steps 3–7 with `/Users/ari` replaced by
   `/Users/aurora`, and verify the private files report owner `aurora`, mode
   `600`. The Studio `--dry-run` must pass all five connectors independently.

3. Render and install an unloaded Studio copy of the new plist. This changes
   only the service user and home path; it does not use the legacy collector:

   ```bash
   /usr/bin/sed \
     -e 's#/Users/ari#/Users/aurora#g' \
     -e 's#<string>ari</string>#<string>aurora</string>#' \
     /Users/aurora/Services/mission-control/ops/revenue-collector/co.creatorsagency.revenue-collector.plist \
     > /tmp/co.creatorsagency.revenue-collector.studio.plist
   plutil -lint /tmp/co.creatorsagency.revenue-collector.studio.plist
   sudo install -o root -g wheel -m 0644 \
     /tmp/co.creatorsagency.revenue-collector.studio.plist \
     /Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist
   sudo plutil -lint \
     /Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist
   rm /tmp/co.creatorsagency.revenue-collector.studio.plist
   ```

4. Compare `git rev-parse HEAD` from both hosts. Do not proceed unless the SHAs
   match and both system plists remain unloaded.

## Cut over without overlapping writers

Perform this in one maintenance window. Never leave both schedulers loaded
across noon.

1. On the Mac Studio, stop and persistently disable the old GUI job. Keep its
   plist on disk only for the narrow pre-verification rollback described below:

   ```bash
   sudo launchctl bootout gui/501/com.ari.revenue-collector
   sudo launchctl disable gui/501/com.ari.revenue-collector
   ```

2. On the Mac Mini, load the new system job:

   ```bash
   sudo launchctl bootstrap system \
     /Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist
   sudo launchctl enable system/co.creatorsagency.revenue-collector
   sudo launchctl print system/co.creatorsagency.revenue-collector
   ```

3. Start one controlled production run and inspect the wrapper-owned log. This
   POSTs one attempt to `/revenue/collection-run`; it publishes a verified
   snapshot only if all five sources are fresh:

   ```bash
   sudo launchctl kickstart -k system/co.creatorsagency.revenue-collector
   sudo launchctl print system/co.creatorsagency.revenue-collector
   tail -n 100 /Users/ari/Library/Logs/CreatorsAgency/revenue-collector/collector.log
   ```

4. Run the authenticated health check:

   ```bash
   HOME=/Users/ari \
   /bin/bash /Users/ari/Services/mission-control/ops/revenue-collector/check-revenue-health.sh
   ```

   Pass criteria are `healthy: true`, latest attempt published and verified,
   every source fresh, and `smiirlNumber` equal to the rounded verified total.
   Also confirm the public endpoint returns HTTP 200 and
   `Cache-Control: no-store`:

   ```bash
   curl --fail --show-error --dump-header - \
     https://healthy-bison-550.convex.site/revenue/smiirl
   ```

5. Record the timestamp and run identifier of this first verified snapshot.
   This is the irreversible rollback boundary: the legacy ingestion path is no
   longer a valid display authority after this point.

6. Repeat the health check shortly after the next scheduled noon run. Only then
   treat the Mini as the durable owner.

## Rollback and failover

First stop the Mini writer:

```bash
sudo launchctl bootout system/co.creatorsagency.revenue-collector
sudo launchctl disable system/co.creatorsagency.revenue-collector
```

### Only before the first verified snapshot

If and only if the new collector has never published a verified snapshot, the
old Studio GUI LaunchAgent can be restored temporarily:

```bash
sudo launchctl enable gui/501/com.ari.revenue-collector
sudo launchctl bootstrap gui/501 \
  /Users/aurora/Library/LaunchAgents/com.ari.revenue-collector.plist
```

### After the first verified snapshot

Never re-enable the old `com.ari.revenue-collector` LaunchAgent and never run
the legacy OpenClaw collector. New verified snapshots always win, so the honest
fallback is the already-staged **new collector** on the Mac Studio:

```bash
sudo launchctl disable gui/501/com.ari.revenue-collector
sudo launchctl bootstrap system \
  /Library/LaunchDaemons/co.creatorsagency.revenue-collector.plist
sudo launchctl enable system/co.creatorsagency.revenue-collector
sudo launchctl kickstart -k system/co.creatorsagency.revenue-collector
sudo launchctl print system/co.creatorsagency.revenue-collector
tail -n 100 /Users/aurora/Library/Logs/CreatorsAgency/revenue-collector/collector.log
HOME=/Users/aurora \
  /bin/bash /Users/aurora/Services/mission-control/ops/revenue-collector/check-revenue-health.sh
```

Do not manually write a replacement database snapshot. The Studio standby must
use the same reviewed new collector and `/revenue/collection-run` contract as
the Mini; it is not permission to revive legacy ingestion.
