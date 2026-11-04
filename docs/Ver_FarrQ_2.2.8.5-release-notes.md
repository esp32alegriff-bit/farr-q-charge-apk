# Ver_FarrQ_2.2.8.5

- New button in Settings, under "EV meter and relays": "Relay Info".
- New page shows everything the relay board reports (status page only, nothing else is asked of the relay).
- Firmware, uptime, boot number, restart reason.
- Wi-Fi signal, channel, connects, drops, TX power.
- ESP-NOW signal and age for CrowPanel and Waveshare.
- Relay 1 and 2 state, latched state, LED states, LED corrections, ignored frames.
- Free memory and lowest memory, real time valid, flash log OK.
- Any new field a later firmware adds is listed automatically.
- OFF and restart log, newest first, as many entries as the relay sends (50 comes with relay firmware 2.5).
- Buttons: Refresh and Copy as text.
- Area "Last seen from the Sheet": empty until a phone at home has copied the relay data.
- At home: Refresh reads the relay and copies the data to the Sheet (only when the phone taps Refresh, no background polling).
- Away (for example Pemba): the relay is not reachable, so the page shows the last copy from the Sheet.
- Sheet script 2.2.8.5: new tab "Relay info" (newest 500 rows, newest first). Needs redeploy: Deploy > Manage deployments > Edit > New version.
- Sheet script is additive: Estelle's phone on 2.2.5 keeps working. It never uses the new tab.
- Relay token stays as typed in Connections. No OTA password in the app.
- Android only. Tests: tests/remote/relay_info_test.js, sheet_script_test.js (laptop browser only; not tested on a phone).
