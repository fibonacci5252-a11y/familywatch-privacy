package com.aethercast.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Locale;

public class WeatherCache {
    private static final String PREFS_NAME = "aethercast_cache";
    private static final long CACHE_DURATION = 30 * 60 * 1000;

    private final SharedPreferences prefs;

    public WeatherCache(Context context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public void cacheWeatherData(String cityKey, String jsonData) {
        prefs.edit()
                .putString("data_" + cityKey, jsonData)
                .putLong("time_" + cityKey, System.currentTimeMillis())
                .apply();
    }

    public String getCachedWeatherData(String cityKey) {
        if (!isCacheValid(cityKey)) return null;
        return prefs.getString("data_" + cityKey, null);
    }

    public String getCachedWeatherDataForced(String cityKey) {
        return prefs.getString("data_" + cityKey, null);
    }

    public boolean isCacheValid(String cityKey) {
        long timestamp = prefs.getLong("time_" + cityKey, 0);
        return (System.currentTimeMillis() - timestamp) < CACHE_DURATION;
    }

    public void clearCache() {
        prefs.edit().clear().apply();
    }

    public static String getCityKey(double lat, double lon) {
        return String.format(Locale.US, "%.2f_%.2f", lat, lon);
    }
}
