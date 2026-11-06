# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView
-keepclassmembers class android.webkit.WebView {
    public *;
}

-dontwarn android.webkit.**
