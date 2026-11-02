# Ver_FarrQ_2.2.8.4

- New block on Home, under "EV meter, copied from the Sheet": "Shelly meter · true data".
- All other blocks are unchanged.
- Uses only the Shelly's measured charges (copied from the Sheet) and what can be worked out from them.
- 1 Where we start: odometer 1981 km at 11:44 on 2 Nov. Charge 11:47 to 13:24, 4.16 kWh, 91% to 100%, full.
- 2 Odometer estimate: two values, one at 10% loss (app setting) and one at 13.3% loss (learned in the Sheet).
- Efficiency used: the app figure of the last 30 days if it is between 10 and 13 kWh per 100 km. Otherwise 12.8.
- 3 Since the last full charge: kWh charged and the km driven at least.
- 4 Full charges after the start: date, times, kWh, km added, both odometer values.
- 5 Latest Shelly charges: date, start, end, length, kWh, cost, peak W, and Full / Not completed / Not sure.
- 6 Totals for the last 7 days and this month.
- 7 Real odometer box: type it, and it becomes the new start. A button goes back to 1981 km.
- Verdicts use the rule the home phone already has (Shelly at 0 W with both relays on = full; a relay off first = not completed). Missing or undecided = Not sure.
- Km = kWh charged since the last full, minus loss, divided by kWh per km. The odometer only moves at a full charge.
- Phone only. Nothing new sent to the Sheet. Sheet script stays 2.2.5. Estelle's phone need not update.
- Tests: tests/remote/shelly_block_test.js (laptop browser only; not tested on a phone).
