# Ver_FarrQ_2.2.8.5_C (14 Nov 2026)

Antonio's phone only. Same version code 46 as 2.2.8.5, _A and _B. Same signing key. Any of them installs over the other.
Estelle's 2.2.5 is untouched. The Sheet script is unchanged. Nothing new is sent to the Sheet.

## Fixed
- "Not recorded yet" on the battery % of a charge: a charge the Shelly says ended full now gets 100% at its end and a worked-out before %. Other charges say "Waiting for your next log".
- PDF cover: "Covers" now shows the report period (for Today: start of today to now), not the first and last log entry.
- Alert list: one time only, the phone asks the Sheet for every alert it holds (quietly, no notifications) and fills the gaps. The alert cursor can no longer be frozen by a wrong clock in the future.
- Odometer box: every odometer typed there is now kept and counts as a real reading for learning (before, only the latest was kept). Typed right after a full charge it sets the odometer at that charge.

## Not done
- Charge graphs away from home: the minute data lives in the Sheet tab "Minute data", but the script does not send it to a phone. Needs an additive Sheet script change.
- Odometer optional in the Anytime and Charge logs: a blank value would need an estimate stored as if real and sent to the Sheet, where Estelle's phone reads it. Needs a decision first.
