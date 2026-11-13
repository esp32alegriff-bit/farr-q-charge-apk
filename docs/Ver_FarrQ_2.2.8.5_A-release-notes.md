# Ver_FarrQ_2.2.8.5_A

For Antonio's phone only. Estelle's phone stays on Ver_FarrQ_2.2.5 and keeps working.

## Install and going back
- Same signing key and the same version code (46) as Ver_FarrQ_2.2.8.5.
- Install it over 2.2.8.5. The data stays.
- To go back, install the 2.2.8.5 APK over it. Android allows this because the version code is the same.
- New data is kept under one new key only (`farrq.verdicts`). 2.2.8.5 ignores it.
- No Google Sheet script change. Nothing new is asked from the Sheet or the relay.
- This release is not marked "latest", so the in-app update link still points at the normal version.

## Fixed
- Full / Not completed / Not sure is now worked out afterwards from the saved records, not from two live relay reads:
  a battery % typed after the charge, the relay's own log, relays still ON after the stop, the kWh against the % typed before it,
  a restart of charging, and last the Shelly alone. Each verdict shows how it is known.
- A typed 100% after a charge now makes that charge Full.
- The old "Not sure" alerts no longer decide anything. Verdicts from an alert or the relay copy are kept on the phone.
- Odometer estimate: wall kWh per 100 km learned from full-to-full stretches with real odometers (start value 16.5).
  The 12.8 figure, the 10 to 13 filter and the two loss values are gone from the Shelly block.
- Each full charge shows the worked-out odometer next to the real one.
- "Driven at least" no longer shows km for a charge that ended full.
- A charge log typed while the charge was still running is no longer counted a second time from battery %
  (month cost, month bill guess, report totals).
- The trip after a full Shelly charge with no charge log starts at 100% from the end of that charge.
- An unlogged charge that did not end full makes the next trip distance only, not a wrong efficiency.
- The trip time limit is 72 hours (was 24).
- Home: "Charging for" and "Started at" use the real start time from the Sheet. No decimals.
- Home, block D: battery kWh per 100 km from trips, wall kWh per 100 km from the Shelly, and cost per km at the wall.
- Home: "Km since last charge" also knows Shelly charges that have no charge log.
- Home: "Battery after the last charge 100%" after a full charge that was not logged.
- Home: away from home no longer says "Meter not found yet".
- Shelly block header says "charging now" or "last charge ended ... ago".
- Relays and AUTO: clear wording when away from home.
- Relay Info: the log label says ON, OFF and restarts.
- Learning page: counts full charges with the same verdicts. A typed end % counts until the next charge (was 8 hours) when it is a charge log.
- At home: the "not sure" alert says "The relay could not be read" when that is what happened.

## Not fixed here (cannot be fixed in this phone's app alone)
- Estelle's phone (2.2.5) still raises the old alerts and writes its own Sheet rows.
- Sheet script: Phone column, duplicate rows, daily totals by logging time, no "which phone" on alerts.
- Relay firmware: Sheet push timeouts, log reset at 03:00, "shelly last w" -1, slow replies, Waveshare not heard.
- Charge graphs away from home (minute data is not copied to this phone).

## Checks
- Security: no new cloud service, key or login. Supply chain: no new library. Legal: no new image, sound or logo. Android only.
- Tests: tests/remote/shelly_block_test.js (new), tests/v22/full_test.js, tests/remote/relay_info_test.js updated. Browser tests on a laptop only; not tested on a phone.
