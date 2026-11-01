# Ver_FarrQ_2.2.8.3

- Fix: "Home charging this month" now counts energy by when it was charged, not by the date a charge was logged.
- Before: a charge logged on 1 Nov for 31 Oct energy (9.21 kWh) showed as November.
- Now: the part of a meter session inside the month counts. Last month stays out.
- The old row is replaced by group B below.
- EV meter block (Home) has five new groups under the old rows:
  - A Today: charging for, started at, this charge so far, full at, charges today.
  - B This month: month cost, measured, estimated, average per day, month bill guess, meter sessions, meter total.
  - C Last finished charge: kWh and Rands, start and end, pauses this month (gaps under 10 min).
  - D Car use this month: km, kWh per 100 km, cost per km, km since last charge.
  - E Settings and health: Home rate, charging loss setting, home phone last sent, odometer.
- Items marked "about" or "a guess" are estimates from the block, the log and meter sessions.
- Charging loss is the app setting. The Sheet's learned loss is not shown (the phone does not hold it).
- Rands = kWh x your Home rate setting. It is not the Eskom bill.
- Nothing new sent to the Sheet. Sheet script stays 2.2.5. Works with phones on 2.2.5.
- Only the phone that shows the block changes. Estelle's phone does not need the update.
- Tests: tests/remote/home_month_test.js (laptop browser only; not tested on a phone).
