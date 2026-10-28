package za.co.farrusco.farrqcharge;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

/**
 * "View from anywhere": sends a copy of the log to the owner's own Google Sheet through a small Google Apps Script
 * (docs/remote-viewing-google-sheet.gs). Works on Wi-Fi or mobile data, so it also works when the owner is abroad.
 * Nothing is sent until a web address and password are entered on the Connections page. Failures never affect charging.
 */
final class Remote {
    private Remote() {}

    static boolean configured(Context c) {
        JSONObject cfg = Store.config(c);
        return cfg.optString("remoteUrl").startsWith("https://") && !cfg.optString("remoteToken").isEmpty();
    }

    /** Sends one payload (built by the app screens or by the background sync). Returns {ok, message}. */
    static synchronized JSONObject push(Context c, JSONObject payload) throws IOException {
        Net.init(c);
        JSONObject cfg = Store.config(c);
        String url = cfg.optString("remoteUrl").trim();
        String token = cfg.optString("remoteToken");
        if (!url.startsWith("https://")) throw new IOException("Enter the Google web address first (it starts with https://).");
        if (token.isEmpty()) throw new IOException("Enter the password first.");
        JSONObject out = new JSONObject();
        try {
            payload.put("token", token);
            payload.put("phone", cfg.optString("remoteName", "").isEmpty() ? "Phone" : cfg.optString("remoteName"));
            payload.put("app", Store.APP_VERSION);
            String reply;
            try { reply = Net.request("POST", url, payload.toString(), null, 25000); }
            catch (Net.HttpError e) { throw new IOException("Google answered " + e.code + ". Check the web address and that access is set to Anyone."); }
            JSONObject r;
            try { r = new JSONObject(reply); }
            catch (JSONException e) { throw new IOException("Google did not send the expected answer. Check that the web address is the Web app address and access is set to Anyone."); }
            boolean ok = r.optBoolean("ok");
            String msg = r.optString("message", ok ? "Sent" : "Refused");
            JSONObject st = new JSONObject();
            st.put("remoteLastMsg", msg);
            if (ok) st.put("remoteLastOk", System.currentTimeMillis());
            Store.mergeConfigQuiet(c, st);
            if (!ok) throw new IOException(msg);
            out.put("ok", true); out.put("message", msg);
            if (r.has("script")) out.put("script", r.optString("script"));
            if (r.has("readings")) out.put("readings", r.get("readings"));   // the other phone's entries, merged by the app screens
            if (r.has("meter")) out.put("meter", r.get("meter"));            // 2.2.4: finished Shelly charges and the last meter reading, copied by the phone at home
        } catch (JSONException e) {
            throw new IOException("Could not prepare the data to send");
        }
        return out;
    }

    /** Background copy of the measured sessions and the last live reading (used after the meter sync at home). */
    static void pushMeter(Context c) {
        if (!configured(c)) return;
        try {
            JSONObject p = new JSONObject();
            p.put("kind", "meter");
            p.put("sent", System.currentTimeMillis());
            JSONArray all = Store.array(c, "sessions"), recent = new JSONArray();
            for (int i = Math.max(0, all.length() - 300); i < all.length(); i++) {
                JSONObject s = all.optJSONObject(i);
                if (s != null && s.optBoolean("from_sheet")) continue;   // 2.2.4: copies that came from the Sheet are never sent back
                recent.put(all.opt(i));
            }
            p.put("sessions", recent);
            JSONObject ll = Store.object(c, "lastLive");
            if (ll.length() > 0) {
                JSONObject live = new JSONObject();
                for (String k : new String[]{"watts", "amps", "charging", "today_kwh", "month_kwh", "total_kwh", "now_ms"})
                    if (ll.has(k)) live.put(k, ll.get(k));
                p.put("live", live);
            }
            push(c, p);
        } catch (Exception ignored) { /* the app screens retry the next time they are opened */ }
    }
}
