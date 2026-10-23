/*
 FARR Q Charge - "View from anywhere"
 A copy of the charge log in YOUR Google Sheet. The phones send to it; you open the Sheet from any country.

 ONE-TIME SETUP (about 5 minutes)
 1. Go to sheets.google.com and make a new blank Sheet. Name it "FARR Q Charge log".
 2. In the Sheet: Extensions > Apps Script.
 3. Delete what is there, paste this whole file, change PASSWORD below to your own word, click Save.
 4. Click Deploy > New deployment > the gear > Web app.
      Execute as: Me
      Who has access: Anyone
    Click Deploy. Click Authorise access, choose your Google account,
    then Advanced > Go to project (unsafe) > Allow. (It is your own script.)
 5. Copy the "Web app" address (starts with https://script.google.com/macros/s/ and ends with /exec).
 6. In FARR Q Charge: Connections > View from anywhere.
    Paste the address, type the same password, type the phone's name, tap Save and send now.
 7. Do steps 5-6 on the second phone too (same address, same password, other name).
 8. Both phones now also READ the log back from this Sheet, so odometer, battery %, Anytime log and Charge log entries
    from one phone appear on the other within about 1-2 minutes while the app is open (and when it is opened).
 9. Abroad: open the Google Sheets app, sign in with the same Google account, open "FARR Q Charge log".

 Safe to know:
 - Only someone with the address AND the password can add data. Nobody can read the Sheet unless you share it.
 - Rows are matched by time, so sending twice never doubles anything, and both phones merge into one log.
 - Deleting an entry in the app does not delete it from the Sheet. Delete the row in the Sheet too.
 - If you change this script later: Deploy > Manage deployments > Edit > Version: New version > Deploy.
*/

var PASSWORD = 'CHANGE-ME';

var TABS = {
  charges:  {name: 'Charge log',     head: ['When', 'Where', 'Battery %', 'Stored kWh', 'Wall kWh', 'Cost R', 'Measured', 'Auto (no charge log)', 'Phone', 'Updated'], key: [0, 1]},
  trips:    {name: 'Trips',          head: ['When', 'Km', 'kWh used', 'kWh/100km', 'Odometer', 'Battery %', 'Phone', 'Updated'], key: [0]},
  readings: {name: 'Readings',       head: ['When', 'Type', 'Odometer', 'Battery %', 'Where', 'Car km', 'Phone', 'Updated'], key: [0, 1], fillBlanksOnly: true},
  sessions: {name: 'Meter sessions', head: ['Started', 'Ended', 'kWh', 'Minutes', 'Peak W', 'Why it ended', 'Updated'], key: [0]}
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var p = JSON.parse(e.postData.contents);
    if (!p || p.token !== PASSWORD) return out_(false, 'Wrong password');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var now = new Date(), phone = String(p.phone || 'Phone'), n = 0;

    if (p.kind === 'app') {
      n += upsert_(ss, TABS.charges, (p.charges || []).map(function (r) {
        return [d_(r.ts), r.where, r.pct, r.stored, r.wall, r.cost, r.measured ? 'yes' : 'estimated', r.auto ? 'yes' : '', phone, now];
      }));
      n += upsert_(ss, TABS.trips, (p.trips || []).map(function (r) {
        return [d_(r.ts), r.km, r.kwh, r.cons, r.odo, r.pct, phone, now];
      }));
      n += upsert_(ss, TABS.readings, (p.readings || []).map(function (r) {
        return [d_(r.ts), r.kind, r.odo, r.pct, r.where, r.carKm, phone, now];
      }));
      summary_(ss, p, phone, now);
    }
    if (p.sessions && p.sessions.length) {
      n += upsert_(ss, TABS.sessions, p.sessions.filter(function (s) { return !s.demo; }).map(function (s) {
        return [d_(s.start_ms || s.end_ms), d_(s.end_ms), s.kwh, s.duration_s ? Math.round(s.duration_s / 60) : '', s.peak_w, s.end_reason || '', now];
      }));
    }
    if (p.kind === 'meter' && p.live) live_(ss, p.live, now);
    var extra = {};
    if (p.kind === 'app' && p.wantReadings) extra.readings = readings_(ss);
    return out_(true, 'Sheet updated (' + n + ' rows checked)', extra);
  } catch (err) {
    return out_(false, 'Script error: ' + err);
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() { return out_(true, 'FARR Q Charge sheet is running. Use the app to send data.'); }

function out_(ok, msg, extra) {
  var o = {ok: ok, message: msg};
  if (extra) for (var k in extra) o[k] = extra[k];
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* every logged reading, so the other phone can add the ones it does not have */
function readings_(ss) {
  var sh = ss.getSheetByName(TABS.readings.name), list = [];
  if (!sh || sh.getLastRow() < 2) return list;
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  for (var i = 0; i < data.length; i++) {
    var d = data[i], t = d[0] instanceof Date ? d[0].getTime() : 0;
    if (!t || !d[1]) continue;
    list.push({ts: t, kind: String(d[1]), odo: d[2], pct: d[3], where: d[4] === '' ? '' : String(d[4]), carKm: d[5], phone: String(d[6])});
  }
  return list;
}

function d_(ms) { return ms ? new Date(+ms) : ''; }

function sheet_(ss, tab) {
  var sh = ss.getSheetByName(tab.name);
  if (!sh) {
    sh = ss.insertSheet(tab.name);
    sh.appendRow(tab.head);
    sh.getRange(1, 1, 1, tab.head.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function keyOf_(row, idx) {
  return idx.map(function (i) {
    var v = row[i];
    return v instanceof Date ? v.getTime() : String(v);
  }).join('|');
}

/* rows with the same key are replaced, new ones are added, the newest at the top after sorting */
function upsert_(ss, tab, rows) {
  if (!rows.length) return 0;
  var sh = sheet_(ss, tab), last = sh.getLastRow(), where = {};
  if (last > 1) {
    var data = sh.getRange(2, 1, last - 1, tab.head.length).getValues();
    for (var i = 0; i < data.length; i++) where[keyOf_(data[i], tab.key)] = i + 2;
  }
  var add = [];
  rows.forEach(function (r) {
    var k = keyOf_(r, tab.key);
    if (where[k] > 0) {
      var rng = sh.getRange(where[k], 1, 1, r.length);
      if (tab.fillBlanksOnly) {
        // an existing entry is never changed, only blank cells (Where, Car km) are filled in
        var old = rng.getValues()[0], mixed = old.slice(), changed = false;
        for (var c = 0; c < r.length - 2; c++) if ((old[c] === '' || old[c] === null) && r[c] !== '' && r[c] !== null) { mixed[c] = r[c]; changed = true; }
        if (changed) { mixed[r.length - 1] = r[r.length - 1]; rng.setValues([mixed]); }
      } else rng.setValues([r]);
    }
    else if (!where[k]) { add.push(r); where[k] = -1; }
  });
  if (add.length) {
    sh.getRange(sh.getLastRow() + 1, 1, add.length, tab.head.length).setValues(add);
    sh.getRange(2, 1, sh.getLastRow() - 1, tab.head.length).sort({column: 1, ascending: false});
  }
  return rows.length;
}

function summary_(ss, p, phone, now) {
  var sh = ss.getSheetByName('Summary') || ss.insertSheet('Summary', 0);
  var s = p.summary || {}, a = s.last7 || {}, b = s.last30 || {}, l = s.lastReading || {};
  var v = [
    ['FARR Q Charge summary', ''],
    ['Updated', now],
    ['Sent by', phone],
    ['', ''],
    ['Last reading: odometer', l.odo], ['Last reading: battery %', l.pct], ['Last reading: when', d_(l.ts)],
    ['', ''],
    ['LAST 7 DAYS', ''], ['Trips', a.trips], ['Km', a.km], ['kWh/100km', a.eff], ['Charges', a.charges], ['Wall kWh', a.wall], ['Cost R', a.cost],
    ['', ''],
    ['LAST 30 DAYS', ''], ['Trips', b.trips], ['Km', b.km], ['kWh/100km', b.eff], ['Charges', b.charges], ['Wall kWh', b.wall], ['Cost R', b.cost]
  ];
  sh.clear();
  sh.getRange(1, 1, v.length, 2).setValues(v.map(function (r) { return [r[0], r[1] == null ? '' : r[1]]; }));
  sh.getRange('A1').setFontWeight('bold'); sh.getRange('A9').setFontWeight('bold'); sh.getRange('A17').setFontWeight('bold');
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 180);
}

function live_(ss, live, now) {
  var sh = ss.getSheetByName('Summary');
  if (!sh) return;
  var v = [['EV METER (last check)', ''], ['Updated', now], ['Charging now', live.charging ? 'yes' : 'no'], ['Watts', live.watts], ['Today kWh', live.today_kwh], ['Month kWh', live.month_kwh], ['Meter total kWh', live.total_kwh]];
  sh.getRange(1, 4, v.length, 2).setValues(v.map(function (r) { return [r[0], r[1] == null ? '' : r[1]]; }));
  sh.getRange('D1').setFontWeight('bold'); sh.setColumnWidth(4, 180);
}
