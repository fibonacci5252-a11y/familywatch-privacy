package com.aethercast.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class CityManager {
    private static final String PREFS_NAME = "aethercast_cities";
    private static final String KEY_CITIES = "cities";
    private static final String KEY_CURRENT_LOCATION = "current_location";

    private final SharedPreferences prefs;

    public CityManager(Context context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public List<WeatherData.City> getSavedCities() {
        List<WeatherData.City> cities = new ArrayList<>();
        try {
            String json = prefs.getString(KEY_CITIES, "[]");
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                cities.add(new WeatherData.City(
                        obj.getString("name"),
                        obj.getDouble("latitude"),
                        obj.getDouble("longitude"),
                        obj.optString("country", ""),
                        false
                ));
            }
        } catch (Exception ignored) {
        }
        return cities;
    }

    public void addCity(WeatherData.City city) {
        List<WeatherData.City> cities = getSavedCities();
        for (WeatherData.City c : cities) {
            if (c.name.equals(city.name)) return;
        }
        cities.add(city);
        saveCities(cities);
    }

    public void removeCity(String cityName) {
        List<WeatherData.City> cities = getSavedCities();
        cities.removeIf(c -> c.name.equals(cityName));
        saveCities(cities);
    }

    public void setCurrentLocation(double lat, double lon) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("name", "Ma position");
            obj.put("latitude", lat);
            obj.put("longitude", lon);
            obj.put("country", "");
            obj.put("isCurrentLocation", true);
            prefs.edit().putString(KEY_CURRENT_LOCATION, obj.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    public WeatherData.City getCurrentLocation() {
        try {
            String json = prefs.getString(KEY_CURRENT_LOCATION, null);
            if (json == null) return null;
            JSONObject obj = new JSONObject(json);
            return new WeatherData.City(
                    obj.getString("name"),
                    obj.getDouble("latitude"),
                    obj.getDouble("longitude"),
                    obj.optString("country", ""),
                    true
            );
        } catch (Exception e) {
            return null;
        }
    }

    public WeatherData.City getDefaultCity() {
        WeatherData.City current = getCurrentLocation();
        if (current != null) return current;
        List<WeatherData.City> saved = getSavedCities();
        if (!saved.isEmpty()) return saved.get(0);
        return null;
    }

    private void saveCities(List<WeatherData.City> cities) {
        try {
            JSONArray arr = new JSONArray();
            for (WeatherData.City city : cities) {
                JSONObject obj = new JSONObject();
                obj.put("name", city.name);
                obj.put("latitude", city.latitude);
                obj.put("longitude", city.longitude);
                obj.put("country", city.country);
                arr.put(obj);
            }
            prefs.edit().putString(KEY_CITIES, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }
}
