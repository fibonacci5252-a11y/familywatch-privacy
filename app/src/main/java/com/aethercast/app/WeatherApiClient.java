package com.aethercast.app;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class WeatherApiClient {
    private static final String TAG = "WeatherApiClient";
    private static final int TIMEOUT_MS = 10000;

    public WeatherData.WeatherResponse fetchWeather(double lat, double lon) {
        try {
            String weatherUrl = String.format(Locale.US,
                    "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
                    + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
                    + "precipitation,weather_code,wind_speed_10m,wind_direction_10m,uv_index,is_day"
                    + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,uv_index"
                    + "&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,"
                    + "precipitation_sum,weather_code"
                    + "&minutely_15=precipitation"
                    + "&timezone=auto&forecast_days=7",
                    lat, lon);

            String weatherJson = httpGet(weatherUrl);
            if (weatherJson == null) return null;

            JSONObject weatherObj = new JSONObject(weatherJson);

            JSONObject currentObj = weatherObj.getJSONObject("current");
            WeatherData.CurrentWeather current = new WeatherData.CurrentWeather(
                    currentObj.getDouble("temperature_2m"),
                    currentObj.getDouble("apparent_temperature"),
                    currentObj.getInt("relative_humidity_2m"),
                    currentObj.getDouble("precipitation"),
                    currentObj.getInt("weather_code"),
                    currentObj.getDouble("wind_speed_10m"),
                    currentObj.getInt("wind_direction_10m"),
                    currentObj.getDouble("uv_index"),
                    currentObj.getInt("is_day") == 1
            );

            JSONObject hourlyObj = weatherObj.getJSONObject("hourly");
            JSONArray hTimes = hourlyObj.getJSONArray("time");
            JSONArray hTemps = hourlyObj.getJSONArray("temperature_2m");
            JSONArray hPrecipProb = hourlyObj.getJSONArray("precipitation_probability");
            JSONArray hPrecip = hourlyObj.getJSONArray("precipitation");
            JSONArray hCodes = hourlyObj.getJSONArray("weather_code");
            JSONArray hUv = hourlyObj.getJSONArray("uv_index");

            List<WeatherData.HourlyForecast> hourly = new ArrayList<>();
            for (int i = 0; i < hTimes.length(); i++) {
                hourly.add(new WeatherData.HourlyForecast(
                        hTimes.getString(i),
                        hTemps.getDouble(i),
                        hPrecipProb.optInt(i, 0),
                        hPrecip.getDouble(i),
                        hCodes.getInt(i),
                        hUv.getDouble(i)
                ));
            }

            JSONObject dailyObj = weatherObj.getJSONObject("daily");
            JSONArray dDates = dailyObj.getJSONArray("time");
            JSONArray dMaxTemps = dailyObj.getJSONArray("temperature_2m_max");
            JSONArray dMinTemps = dailyObj.getJSONArray("temperature_2m_min");
            JSONArray dSunrise = dailyObj.getJSONArray("sunrise");
            JSONArray dSunset = dailyObj.getJSONArray("sunset");
            JSONArray dUvMax = dailyObj.getJSONArray("uv_index_max");
            JSONArray dPrecipSum = dailyObj.getJSONArray("precipitation_sum");
            JSONArray dCodes = dailyObj.getJSONArray("weather_code");

            List<WeatherData.DailyForecast> daily = new ArrayList<>();
            for (int i = 0; i < dDates.length(); i++) {
                daily.add(new WeatherData.DailyForecast(
                        dDates.getString(i),
                        dMaxTemps.getDouble(i),
                        dMinTemps.getDouble(i),
                        dSunrise.getString(i),
                        dSunset.getString(i),
                        dUvMax.getDouble(i),
                        dPrecipSum.getDouble(i),
                        dCodes.getInt(i)
                ));
            }

            List<WeatherData.MinutelyPrecipitation> minutely = new ArrayList<>();
            if (weatherObj.has("minutely_15")) {
                JSONObject minutelyObj = weatherObj.getJSONObject("minutely_15");
                JSONArray mTimes = minutelyObj.getJSONArray("time");
                JSONArray mPrecip = minutelyObj.getJSONArray("precipitation");
                for (int i = 0; i < mTimes.length(); i++) {
                    minutely.add(new WeatherData.MinutelyPrecipitation(
                            mTimes.getString(i),
                            mPrecip.getDouble(i)
                    ));
                }
            }

            WeatherData.AirQuality airQuality = fetchAirQuality(lat, lon);

            return new WeatherData.WeatherResponse(
                    current, hourly, daily, minutely, airQuality, "Ma position");

        } catch (Exception e) {
            Log.e(TAG, "Error fetching weather", e);
            return null;
        }
    }

    private WeatherData.AirQuality fetchAirQuality(double lat, double lon) {
        try {
            String url = String.format(Locale.US,
                    "https://air-quality-api.open-meteo.com/v1/air-quality?"
                    + "latitude=%.4f&longitude=%.4f"
                    + "&current=european_aqi,us_aqi,pm10,pm2_5,"
                    + "carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
                    lat, lon);

            String json = httpGet(url);
            if (json == null) return null;

            JSONObject obj = new JSONObject(json).getJSONObject("current");
            return new WeatherData.AirQuality(
                    obj.optInt("european_aqi", 0),
                    obj.optInt("us_aqi", 0),
                    obj.optDouble("pm10", 0),
                    obj.optDouble("pm2_5", 0),
                    obj.optDouble("carbon_monoxide", 0),
                    obj.optDouble("nitrogen_dioxide", 0),
                    obj.optDouble("sulphur_dioxide", 0),
                    obj.optDouble("ozone", 0)
            );
        } catch (Exception e) {
            Log.e(TAG, "Error fetching air quality", e);
            return null;
        }
    }

    public List<WeatherData.City> searchCities(String query) {
        List<WeatherData.City> cities = new ArrayList<>();
        try {
            String encoded = URLEncoder.encode(query, "UTF-8");
            String url = "https://geocoding-api.open-meteo.com/v1/search?name="
                    + encoded + "&count=10&language=fr";

            String json = httpGet(url);
            if (json == null) return cities;

            JSONObject obj = new JSONObject(json);
            if (!obj.has("results")) return cities;

            JSONArray results = obj.getJSONArray("results");
            for (int i = 0; i < results.length(); i++) {
                JSONObject r = results.getJSONObject(i);
                cities.add(new WeatherData.City(
                        r.getString("name"),
                        r.getDouble("latitude"),
                        r.getDouble("longitude"),
                        r.optString("country", ""),
                        false
                ));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error searching cities", e);
        }
        return cities;
    }

    public String reverseGeocode(double lat, double lon) {
        return "Ma position";
    }

    private String httpGet(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestProperty("Accept", "application/json");

            int code = conn.getResponseCode();
            if (code != 200) {
                Log.e(TAG, "HTTP " + code + " for " + urlStr);
                return null;
            }

            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            return sb.toString();

        } catch (Exception e) {
            Log.e(TAG, "HTTP error for " + urlStr, e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
