package com.aethercast.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WeatherWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_AUTO_UPDATE = "com.aethercast.app.ACTION_AUTO_UPDATE";
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int widgetId : appWidgetIds) {
            executor.execute(() -> updateWidget(context, appWidgetManager, widgetId));
        }
    }

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        WeatherAlertWorker.schedulePeriodicWork(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_AUTO_UPDATE.equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, WeatherWidgetProvider.class));
            for (int widgetId : ids) {
                executor.execute(() -> updateWidget(context, manager, widgetId));
            }
        }
    }

    public static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_weather);

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_city, pendingIntent);
        views.setOnClickPendingIntent(R.id.widget_temp, pendingIntent);
        views.setOnClickPendingIntent(R.id.widget_description, pendingIntent);

        CityManager cityManager = new CityManager(context);
        String[] defaultCity = cityManager.getDefaultCity();

        if (defaultCity == null) {
            views.setTextViewText(R.id.widget_city, "Aucune ville");
            views.setTextViewText(R.id.widget_temp, "--°");
            views.setTextViewText(R.id.widget_description, "Configurez une ville");
            manager.updateAppWidget(widgetId, views);
            return;
        }

        String cityName = defaultCity[0];
        double lat = Double.parseDouble(defaultCity[1]);
        double lon = Double.parseDouble(defaultCity[2]);

        WeatherCache cache = new WeatherCache(context);
        WeatherData weather = cache.load();

        if (weather == null) {
            weather = WeatherApiClient.fetchWeatherSync(lat, lon);
            if (weather != null) {
                cache.save(weather);
            }
        }

        if (weather != null) {
            views.setTextViewText(R.id.widget_city, getWeatherEmoji(weather.weatherCode) + " " + cityName);
            views.setTextViewText(R.id.widget_temp, Math.round(weather.temperature) + "°");
            views.setTextViewText(R.id.widget_description, weather.description);
            views.setTextViewText(R.id.widget_high_low,
                    "↑" + Math.round(weather.tempMax) + "° ↓" + Math.round(weather.tempMin) + "°");
            views.setTextViewText(R.id.widget_humidity, "💧 " + Math.round(weather.humidity) + "%");
            views.setTextViewText(R.id.widget_wind, "💨 " + Math.round(weather.windSpeed) + " km/h");
        } else {
            views.setTextViewText(R.id.widget_city, cityName);
            views.setTextViewText(R.id.widget_temp, "--°");
            views.setTextViewText(R.id.widget_description, "Pas de connexion");
        }

        manager.updateAppWidget(widgetId, views);
    }

    private static String getWeatherEmoji(int code) {
        if (code == 0) return "☀️";
        if (code <= 3) return "⛅";
        if (code <= 49) return "🌫️";
        if (code <= 59) return "🌧️";
        if (code <= 69) return "❄️";
        if (code <= 79) return "🌨️";
        if (code <= 82) return "🌧️";
        if (code <= 86) return "❄️";
        if (code <= 99) return "⚡";
        return "🌤️";
    }
}
