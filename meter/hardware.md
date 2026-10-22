# Meter hardware

| Item | Value |
|---|---|
| Board | ESP32-S3 Super Mini, HW-747 V0.02 |
| Chip | ESP32-S3 (QFN56), revision v0.2 |
| Flash | 4 MB (XMC), confirmed by esptool |
| PSRAM | 2 MB reported by esptool |
| MAC address (Wi-Fi/station) | e0:72:a1:e9:8c:48 |
| USB | USB-Serial/JTAG, shows as /dev/ttyACM0 on the owner's Debian laptop |
| Current sensor | Emporia 200 A clamp, 25 mm opening, sleeve and tip wires to the S3 |
| Clamp pin (planned) | ADC1, GPIO4 (confirmed when wired) |

Notes:
- The MAC address is hardware, not a secret, so it may be stored in the repo.
- Wi-Fi passwords are never stored here.
