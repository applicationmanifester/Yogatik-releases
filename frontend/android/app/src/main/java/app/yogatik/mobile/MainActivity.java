package app.yogatik.mobile;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                String ua = settings.getUserAgentString();
                if (ua != null && (ua.contains("; wv") || ua.contains("Version/"))) {
                    String cleanUa = ua.replace("; wv", "").replaceAll("Version/\\d+\\.\\d+\\s?", "");
                    settings.setUserAgentString(cleanUa);
                }
            }
        } catch (Exception ignored) {}
    }
}
