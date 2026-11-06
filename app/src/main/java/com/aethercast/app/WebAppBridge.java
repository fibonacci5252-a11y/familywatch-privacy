package com.aethercast.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

public class WebAppBridge {
    private final Context context;
    private final CityManager cityManager;
    private final WeatherApiClient apiClient;
    private final WeatherCache cache;
    private OnLocationRequestListener locationListener;

    public interface OnLocationRequestListener {
        void onLocationRequested();
    }

    public WebAppBridge(Context context) {
        this.context = context;
        this.cityManager = new CityManager(context);
        this.apiClient = new WeatherApiClient();
        this.cache = new WeatherCache(context);
    }

    public void setLocationListener(OnLocationRequestListener listener) {
        this.locationListener = listener;
    }

    @JavascriptInterface
    public String getSavedCities() {
        try {
            List<WeatherData.City> cities = cityManager.getSavedCities();
            JSONArray arr = new JSONArray();
            for (WeatherData.City city : cities) {
                JSONObject obj = new JSONObject();
                obj.put("name", city.name);
                obj.put("latitude", city.latitude);
                obj.put("longitude", city.longitude);
                obj.put("country", city.country);
                obj.put("isCurrentLocation", city.isCurrentLocation);
                arr.put(obj);
            }
            return arr.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    @JavascriptInterface
    public void addCity(String name, double lat, double lon, String country) {
        WeatherData.City city = new WeatherData.City(name, lat, lon, country, false);
        cityManager.addCity(city);
    }

    @JavascriptInterface
    public void removeCity(String name) {
        cityManager.removeCity(name);
    }

    @JavascriptInterface
    public String searchCities(String query) {
        try {
            List<WeatherData.City> results = apiClient.searchCities(query);
            if (results == null) return "[]";
            JSONArray arr = new JSONArray();
            for (WeatherData.City city : results) {
                JSONObject obj = new JSONObject();
                obj.put("name", city.name);
                obj.put("latitude", city.latitude);
                obj.put("longitude", city.longitude);
                obj.put("country", city.country);
                arr.put(obj);
            }
            return arr.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    @JavascriptInterface
    public String getWeatherData(double lat, double lon) {
        String key = WeatherCache.getCityKey(lat, lon);
        String cached = cache.getCachedWeatherData(key);
        if (cached != null) return cached;

        try {
            String data = apiClient.fetchWeatherRaw(lat, lon);
            if (data != null) {
                cache.cacheWeatherData(key, data);
                return data;
            }
            return cache.getCachedWeatherDataForced(key);
        } catch (Exception e) {
            String forced = cache.getCachedWeatherDataForced(key);
            return forced != null ? forced : "{}";
        }
    }

    @JavascriptInterface
    public String getAirQuality(double lat, double lon) {
        try {
            String data = apiClient.fetchAirQualityRaw(lat, lon);
            return data != null ? data : "{}";
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void requestLocation() {
        if (locationListener != null) {
            locationListener.onLocationRequested();
        }
    }

    @SuppressWarnings("deprecation")
    @JavascriptInterface
    public boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager)
                    context.getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception e) {
            return false;
        }
    }

    @JavascriptInterface
    public String getAlertSettings() {
        SharedPreferences prefs = context.getSharedPreferences("aethercast_alerts", Context.MODE_PRIVATE);
        try {
            JSONObject obj = new JSONObject();
            obj.put("enabled", prefs.getBoolean("enabled", true));
            obj.put("tempHigh", prefs.getFloat("temp_high", 35f));
            obj.put("tempLow", prefs.getFloat("temp_low", -10f));
            obj.put("windThreshold", prefs.getFloat("wind_threshold", 80f));
            obj.put("uvThreshold", prefs.getFloat("uv_threshold", 8f));
            obj.put("aqiThreshold", prefs.getInt("aqi_threshold", 100));
            return obj.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void setAlertSettings(String json) {
        try {
            JSONObject obj = new JSONObject(json);
            SharedPreferences.Editor editor = context.getSharedPreferences("aethercast_alerts", Context.MODE_PRIVATE).edit();
            if (obj.has("enabled")) editor.putBoolean("enabled", obj.getBoolean("enabled"));
            if (obj.has("tempHigh")) editor.putFloat("temp_high", (float) obj.getDouble("tempHigh"));
            if (obj.has("tempLow")) editor.putFloat("temp_low", (float) obj.getDouble("tempLow"));
            if (obj.has("windThreshold")) editor.putFloat("wind_threshold", (float) obj.getDouble("windThreshold"));
            if (obj.has("uvThreshold")) editor.putFloat("uv_threshold", (float) obj.getDouble("uvThreshold"));
            if (obj.has("aqiThreshold")) editor.putInt("aqi_threshold", obj.getInt("aqiThreshold"));
            editor.apply();
        } catch (Exception ignored) {
        }
    }
}
