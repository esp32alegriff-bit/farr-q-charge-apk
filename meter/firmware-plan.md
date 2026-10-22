# Meter firmware plan (agreed)

Target: firmware version FQM_1.0, data contract version 1. Plain English summary of what it must do.

## Measuring
- Reads current from the clamp and turns it into watts (watts = raw reading × calibration factor × 230).
- Calibration factor starts at 1.000 and is changed from the app; it is saved on the meter.
- Adds up energy from every sample, so kWh is measured, not estimated.

## Charging sessions
- A session starts when power is above 100 W for 10 seconds.
- A session ends when power is below 50 W for 60 seconds.
- A sudden drop from above 1000 W to nearly nothing raises a "charging stopped abruptly" warning.

## Memory that survives problems
- Saves the running session and totals to flash every 60 seconds and at the end of each session.
- After a power cut it loses at most about one minute.
- An interrupted session is closed with the reason "power_loss".
- Keeps every session and event with a number that only goes up and survives reboots.
- Keeps at least the last 2000 sessions.
- Creates a random store ID the first time its memory is set up; a changed ID means the numbering starts again.

## Time
- Gets the time from the internet (pool.ntp.org, South African time).
- Until the time is known, it stamps events from uptime and corrects them once the time arrives.

## Works on its own
- Keeps measuring and recording with no Wi-Fi, no Pi, no phone and no relay board.
- Charging is never blocked by the relay board.

## Wi-Fi and network
- Joins the 2.4 GHz "Farrusco" network only, on channel 6.
- Uses the fixed address 192.168.1.128.
- Uses maximum transmit power.
- Wi-Fi passwords live in a git-ignored secrets file, never in the repo.

## Talking to the app and displays
- Serves plain JSON pages for live readings, sessions, events, settings and diagnostics.
- Sends a short ESP-NOW broadcast every 2 seconds and on every change, for the Waveshare and CrowPanel displays.
- Publishes to the Pi over MQTT only, on its own topic set, and only when switched on in the app.
- Never receives commands over MQTT or ESP-NOW.

## AUTO (safety)
- Starts in MANUAL mode.
- In AUTO it may only switch Relay 2 (EV charger) off, never on, and never touches Relay 1 (Eskom).
- It switches Relay 2 off once after charging finishes, or after 10 minutes if the car never starts drawing power.
- If power still flows 30 seconds after the off command, it raises a warning.
- It raises a critical alert if the current stays above 14 A for 10 seconds.

## Rules for the build
- The first firmware is loaded over USB; over-the-air updates come later.
- Nothing is flashed to the board without the owner's approval.
- Compile and inspect freely; ask before any upload.
