package com.aethercast.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public class WeatherAlertWorker extends Worker {
    private static final String WORK_NAME = "weather_alert_check";

    public WeatherAlertWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        NotificationHelper notificationHelper = new NotificationHelper(context);
        CityManager cityManager = new CityManager(context);

        String[] defaultCity = cityManager.getDefaultCity();
        if (defaultCity == null) {
            return Result.success();
        }

        double lat = Double.parseDouble(defaultCity[1]);
        double lon = Double.parseDouble(defaultCity[2]);

        WeatherData weather = WeatherApiClient.fetchWeatherSync(lat, lon);
        if (weather == null) {
            return Result.retry();
        }

        WeatherCache cache = new WeatherCache(context);
        cache.save(weather);

        int alertId = 4000;

        if (weather.temperature > 35) {
            notificationHelper.showSevereWeatherAlert(
                    "Alerte canicule",
                    "Température extrême de " + Math.round(weather.temperature) + "°C prévue. Restez hydraté et évitez l'exposition au soleil.");
        }

        if (weather.temperature < -10) {
            notificationHelper.showSevereWeatherAlert(
                    "Alerte grand froid",
                    "Température de " + Math.round(weather.temperature) + "°C prévue. Protégez-vous du froid et limitez les sorties.");
        }

        if (weather.weatherCode >= 95 && weather.weatherCode <= 99) {
            notificationHelper.showSevereWeatherAlert(
                    "Alerte orage",
                    "Orages violents prévus dans votre zone. Mettez-vous à l'abri et évitez les zones exposées.");
        }

        if (weather.windSpeed > 80) {
            notificationHelper.showWeatherAlert(
                    "Alerte vent violent",
                    "Rafales jusqu'à " + Math.round(weather.windSpeed) + " km/h prévues. Sécurisez les objets extérieurs.",
                    alertId++);
        }

        if (weather.uvIndex > 8) {
            notificationHelper.showWeatherAlert(
                    "Alerte UV élevé",
                    "Indice UV de " + Math.round(weather.uvIndex) + ". Protection solaire indispensable, évitez l'exposition entre 12h et 16h.",
                    alertId++);
        }

        if (weather.aqi > 100) {
            notificationHelper.showWeatherAlert(
                    "Alerte qualité de l'air",
                    "Indice de qualité de l'air dégradé (AQI: " + Math.round(weather.aqi) + "). Limitez les activités extérieures.",
                    alertId++);
        }

        if (weather.precipitation > 20) {
            notificationHelper.showWeatherAlert(
                    "Alerte fortes précipitations",
                    "Précipitations de " + Math.round(weather.precipitation) + " mm prévues. Risque d'inondations localisées.",
                    alertId++);
        }

        return Result.success();
    }

    public static void schedulePeriodicWork(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                WeatherAlertWorker.class, 1, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest);
    }

    public static void cancelWork(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
    }
}
