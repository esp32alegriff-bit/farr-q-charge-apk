package za.co.farrusco.farrqcharge;
import android.content.Context;
import org.json.*;
/** Test-only access to the package-private Store methods. */
public class StoreTestAccess {
    public static int add(Context c, JSONArray in, String storeId) { return Store.addSessions(c, "sessions", in, storeId, false); }
    public static int count(Context c) { return Store.array(c, "sessions").length(); }
    public static int copies(Context c) { JSONArray a = Store.array(c, "sessions"); int n = 0; for (int i = 0; i < a.length(); i++) if (a.optJSONObject(i).optBoolean("from_sheet")) n++; return n; }
    public static int realCount(Context c) { return count(c) - copies(c); }
}
