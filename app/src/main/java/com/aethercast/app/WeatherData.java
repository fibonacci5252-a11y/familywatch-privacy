package com.aethercast.app;

import java.util.List;

public class WeatherData {

    public static class CurrentWeather {
        public double temperature;
        public double apparentTemperature;
        public int humidity;
        public double precipitation;
        public int weatherCode;
        public double windSpeed;
        public int windDirection;
        public double uvIndex;
        public boolean isDay;

        public CurrentWeather(double temperature, double apparentTemperature, int humidity,
                double precipitation, int weatherCode, double windSpeed, int windDirection,
                double uvIndex, boolean isDay) {
            this.temperature = temperature;
            this.apparentTemperature = apparentTemperature;
            this.humidity = humidity;
            this.precipitation = precipitation;
            this.weatherCode = weatherCode;
            this.windSpeed = windSpeed;
            this.windDirection = windDirection;
            this.uvIndex = uvIndex;
            this.isDay = isDay;
        }
    }

    public static class HourlyForecast {
        public String time;
        public double temperature;
        public int precipitationProbability;
        public double precipitation;
        public int weatherCode;
        public double uvIndex;

        public HourlyForecast(String time, double temperature, int precipitationProbability,
                double precipitation, int weatherCode, double uvIndex) {
            this.time = time;
            this.temperature = temperature;
            this.precipitationProbability = precipitationProbability;
            this.precipitation = precipitation;
            this.weatherCode = weatherCode;
            this.uvIndex = uvIndex;
        }
    }

    public static class DailyForecast {
        public String date;
        public double temperatureMax;
        public double temperatureMin;
        public String sunrise;
        public String sunset;
        public double uvIndexMax;
        public double precipitationSum;
        public int weatherCode;

        public DailyForecast(String date, double temperatureMax, double temperatureMin,
                String sunrise, String sunset, double uvIndexMax, double precipitationSum,
                int weatherCode) {
            this.date = date;
            this.temperatureMax = temperatureMax;
            this.temperatureMin = temperatureMin;
            this.sunrise = sunrise;
            this.sunset = sunset;
            this.uvIndexMax = uvIndexMax;
            this.precipitationSum = precipitationSum;
            this.weatherCode = weatherCode;
        }
    }

    public static class AirQuality {
        public int europeanAqi;
        public int usAqi;
        public double pm10;
        public double pm25;
        public double co;
        public double no2;
        public double so2;
        public double ozone;

        public AirQuality(int europeanAqi, int usAqi, double pm10, double pm25,
                double co, double no2, double so2, double ozone) {
            this.europeanAqi = europeanAqi;
            this.usAqi = usAqi;
            this.pm10 = pm10;
            this.pm25 = pm25;
            this.co = co;
            this.no2 = no2;
            this.so2 = so2;
            this.ozone = ozone;
        }
    }

    public static class MinutelyPrecipitation {
        public String time;
        public double precipitation;

        public MinutelyPrecipitation(String time, double precipitation) {
            this.time = time;
            this.precipitation = precipitation;
        }
    }

    public static class WeatherResponse {
        public CurrentWeather current;
        public List<HourlyForecast> hourly;
        public List<DailyForecast> daily;
        public List<MinutelyPrecipitation> minutely;
        public AirQuality airQuality;
        public String cityName;

        public WeatherResponse(CurrentWeather current, List<HourlyForecast> hourly,
                List<DailyForecast> daily, List<MinutelyPrecipitation> minutely,
                AirQuality airQuality, String cityName) {
            this.current = current;
            this.hourly = hourly;
            this.daily = daily;
            this.minutely = minutely;
            this.airQuality = airQuality;
            this.cityName = cityName;
        }
    }

    public static class City {
        public String name;
        public double latitude;
        public double longitude;
        public String country;
        public boolean isCurrentLocation;

        public City(String name, double latitude, double longitude, String country,
                boolean isCurrentLocation) {
            this.name = name;
            this.latitude = latitude;
            this.longitude = longitude;
            this.country = country;
            this.isCurrentLocation = isCurrentLocation;
        }
    }

    public static String getWeatherDescription(int weatherCode) {
        if (weatherCode == 0) return "Ciel dégagé";
        if (weatherCode >= 1 && weatherCode <= 3) return "Partiellement nuageux";
        if (weatherCode >= 45 && weatherCode <= 48) return "Brouillard";
        if (weatherCode >= 51 && weatherCode <= 55) return "Bruine";
        if (weatherCode >= 56 && weatherCode <= 57) return "Bruine verglaçante";
        if (weatherCode >= 61 && weatherCode <= 65) return "Pluie";
        if (weatherCode >= 66 && weatherCode <= 67) return "Pluie verglaçante";
        if (weatherCode >= 71 && weatherCode <= 75) return "Neige";
        if (weatherCode == 77) return "Grains de neige";
        if (weatherCode >= 80 && weatherCode <= 82) return "Averses";
        if (weatherCode >= 85 && weatherCode <= 86) return "Averses de neige";
        if (weatherCode == 95) return "Orage";
        if (weatherCode >= 96 && weatherCode <= 99) return "Orage avec grêle";
        return "Inconnu";
    }

    public static String getWeatherEmoji(int weatherCode) {
        if (weatherCode == 0) return "☀️";
        if (weatherCode >= 1 && weatherCode <= 2) return "⛅";
        if (weatherCode == 3) return "☁️";
        if (weatherCode >= 45 && weatherCode <= 48) return "🌫️";
        if (weatherCode >= 51 && weatherCode <= 57) return "🌦️";
        if (weatherCode >= 61 && weatherCode <= 67) return "🌧️";
        if (weatherCode >= 71 && weatherCode <= 77) return "❄️";
        if (weatherCode >= 80 && weatherCode <= 82) return "🌦️";
        if (weatherCode >= 85 && weatherCode <= 86) return "🌨️";
        if (weatherCode == 95) return "⛈️";
        if (weatherCode >= 96 && weatherCode <= 99) return "⛈️";
        return "❓";
    }
}
