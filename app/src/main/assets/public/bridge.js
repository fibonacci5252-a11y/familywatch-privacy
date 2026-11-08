(function() {
    'use strict';

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'bridge.css';
    document.head.appendChild(link);

    // ===== Utilities =====

    function callBridge(fn) {
        return new Promise(function(resolve) {
            setTimeout(function() {
                try { resolve(fn()); } catch(e) { resolve(null); }
            }, 0);
        });
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    var currentLat = null, currentLon = null;

    function getCurrentPosition() {
        return new Promise(function(resolve) {
            if (currentLat !== null) { resolve({ lat: currentLat, lon: currentLon }); return; }
            if (!navigator.geolocation) { resolve(null); return; }
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    currentLat = pos.coords.latitude;
                    currentLon = pos.coords.longitude;
                    resolve({ lat: currentLat, lon: currentLon });
                },
                function() { resolve(null); },
                { timeout: 10000, enableHighAccuracy: false }
            );
        });
    }

    function weatherIcon(code) {
        var icons = {
            0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
            45: '🌫', 48: '🌫', 51: '🌦', 53: '🌦',
            55: '🌧', 56: '🌨', 57: '🌨',
            61: '🌧', 63: '🌧', 65: '🌧',
            66: '🌨', 67: '🌨',
            71: '🌨', 73: '🌨', 75: '❄️',
            77: '❄️', 80: '🌦', 81: '🌧', 82: '🌧',
            85: '🌨', 86: '🌨',
            95: '⛈', 96: '⛈', 99: '⛈'
        };
        return icons[code] || '☁️';
    }

    // ===== SVG icon helpers =====
    function svgIcon(paths, vb) {
        return '<svg viewBox="' + (vb || '0 0 24 24') + '" xmlns="http://www.w3.org/2000/svg">' + paths + '</svg>';
    }
    var ICONS = {
        plus: svgIcon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
        close: svgIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
        search: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
        pin: svgIcon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>'),
        trash: svgIcon('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
        wind: svgIcon('<path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/>'),
        droplet: svgIcon('<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>'),
        sun: svgIcon('<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'),
        radar: svgIcon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/>'),
        bell: svgIcon('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>'),
        city: svgIcon('<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><line x1="9" y1="18" x2="15" y2="18"/>')
    };

    // ===== Panel System =====

    var panels = {};

    function createPanel(id, title) {
        if (panels[id]) return panels[id];
        var el = document.createElement('div');
        el.className = 'ac-ui overlay-panel';
        el.id = 'ac-panel-' + id;
        el.innerHTML =
            '<div class="panel-header">' +
                '<span class="panel-title">' + esc(title) + '</span>' +
                '<button class="panel-close">' + ICONS.close + '</button>' +
            '</div>' +
            '<div class="panel-content"></div>';
        document.body.appendChild(el);
        el.querySelector('.panel-close').addEventListener('click', function() { hidePanel(id); });
        panels[id] = { el: el, content: el.querySelector('.panel-content') };
        return panels[id];
    }

    function showPanel(id) {
        closeFabMenu();
        var p = panels[id];
        if (!p) return;
        p.el.classList.add('visible');
    }

    function hidePanel(id) {
        var p = panels[id];
        if (!p) return;
        p.el.classList.remove('visible');
    }

    function setPanelContent(id, html) {
        var p = panels[id];
        if (p) p.content.innerHTML = html;
    }

    function setPanelLoading(id) {
        setPanelContent(id, '<div class="loading-spinner"></div>');
    }

    // ===== FAB =====

    var fabOpen = false;
    var fab, fabMenu, fabBackdrop;

    function createFab() {
        fabBackdrop = document.createElement('div');
        fabBackdrop.className = 'ac-ui fab-backdrop';
        fabBackdrop.addEventListener('click', closeFabMenu);
        document.body.appendChild(fabBackdrop);

        fabMenu = document.createElement('div');
        fabMenu.className = 'ac-ui fab-menu';
        var items = [
            { label: 'Alertes',          cls: 'btn-alerts',  icon: ICONS.bell,    fn: openAlerts },
            { label: 'Radar',            cls: 'btn-radar',   icon: ICONS.radar,   fn: openRadar },
            { label: 'Précipitations', cls: 'btn-precip',  icon: ICONS.droplet, fn: openPrecip },
            { label: 'Indice UV',        cls: 'btn-uv',      icon: ICONS.sun,     fn: openUV },
            { label: 'Qualité de l’air', cls: 'btn-aqi', icon: ICONS.wind, fn: openAQI },
            { label: 'Villes',           cls: 'btn-cities',  icon: ICONS.city,    fn: openCities }
        ];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var row = document.createElement('div');
            row.className = 'fab-menu-item';
            row.innerHTML = '<span class="fab-menu-label">' + esc(it.label) + '</span>' +
                '<button class="fab-menu-btn ' + it.cls + '">' + it.icon + '</button>';
            (function(fn) {
                row.querySelector('.fab-menu-btn').addEventListener('click', function() { fn(); });
            })(it.fn);
            fabMenu.appendChild(row);
        }
        document.body.appendChild(fabMenu);

        fab = document.createElement('button');
        fab.className = 'ac-ui fab';
        fab.innerHTML = '<svg class="fab-icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        fab.addEventListener('click', toggleFab);
        document.body.appendChild(fab);
    }

    function toggleFab() {
        fabOpen = !fabOpen;
        fab.classList.toggle('open', fabOpen);
        fabMenu.classList.toggle('open', fabOpen);
        fabBackdrop.classList.toggle('open', fabOpen);
    }

    function closeFabMenu() {
        if (!fabOpen) return;
        fabOpen = false;
        fab.classList.remove('open');
        fabMenu.classList.remove('open');
        fabBackdrop.classList.remove('open');
    }

    // ===== Feature: Multi-City Management =====

    function openCities() {
        var panel = createPanel('cities', 'Mes villes');
        showPanel('cities');
        setPanelLoading('cities');
        loadCities();
    }

    var searchTimeout = null;

    function loadCities() {
        callBridge(function() { return typeof Android !== 'undefined' ? Android.getSavedCities() : '[]'; })
        .then(function(raw) {
            var cities = [];
            try { cities = JSON.parse(raw || '[]'); } catch(e) {}
            renderCities(cities);
        });
    }

    function renderCities(cities) {
        var html = '<div class="search-box">' +
            ICONS.search.replace('<svg', '<svg class="search-icon"') +
            '<input class="search-input" placeholder="Rechercher une ville…" id="ac-city-search">' +
            '<div class="search-results" id="ac-city-results"></div></div>' +
            '<ul class="city-list" id="ac-city-list">';

        // Always add current location first
        html += '<li class="city-item" data-lat="current" data-lon="current">' +
            '<div class="city-icon">' + ICONS.pin + '</div>' +
            '<div class="city-info"><div class="city-name">Ma position</div>' +
            '<div class="city-country"><span class="city-current-badge">GPS</span></div></div>' +
            '<span class="city-temp" id="ac-current-temp">--</span></li>';

        for (var i = 0; i < cities.length; i++) {
            var c = cities[i];
            if (c.isCurrentLocation) continue;
            html += '<li class="city-item" data-lat="' + c.latitude + '" data-lon="' + c.longitude + '">' +
                '<div class="city-icon">' + ICONS.city + '</div>' +
                '<div class="city-info"><div class="city-name">' + esc(c.name) + '</div>' +
                '<div class="city-country">' + esc(c.country || '') + '</div></div>' +
                '<span class="city-temp" id="ac-temp-' + i + '">--</span>' +
                '<button class="city-delete" data-name="' + esc(c.name) + '">' + ICONS.trash + '</button></li>';
        }
        html += '</ul>';
        setPanelContent('cities', html);

        // Search
        var input = document.getElementById('ac-city-search');
        if (input) {
            input.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                var q = input.value.trim();
                if (q.length < 2) { document.getElementById('ac-city-results').innerHTML = ''; return; }
                searchTimeout = setTimeout(function() { searchCities(q); }, 400);
            });
        }

        // Delete buttons
        var delBtns = panels.cities.content.querySelectorAll('.city-delete');
        for (var d = 0; d < delBtns.length; d++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var name = btn.getAttribute('data-name');
                    callBridge(function() { Android.removeCity(name); }).then(loadCities);
                });
            })(delBtns[d]);
        }

        // Fetch temps for each city
        fetchCurrentLocationTemp();
        for (var j = 0; j < cities.length; j++) {
            if (!cities[j].isCurrentLocation) fetchCityTemp(cities[j], j);
        }
    }

    function fetchCurrentLocationTemp() {
        getCurrentPosition().then(function(pos) {
            if (!pos) return;
            callBridge(function() { return Android.getWeatherData(pos.lat, pos.lon); }).then(function(raw) {
                try {
                    var d = JSON.parse(raw);
                    var el = document.getElementById('ac-current-temp');
                    if (el && d.current_weather) el.textContent = Math.round(d.current_weather.temperature) + '°';
                } catch(e) {}
            });
        });
    }

    function fetchCityTemp(city, idx) {
        callBridge(function() { return Android.getWeatherData(city.latitude, city.longitude); }).then(function(raw) {
            try {
                var d = JSON.parse(raw);
                var el = document.getElementById('ac-temp-' + idx);
                if (el && d.current_weather) el.textContent = Math.round(d.current_weather.temperature) + '°';
            } catch(e) {}
        });
    }

    function searchCities(query) {
        callBridge(function() { return Android.searchCities(query); }).then(function(raw) {
            var results = [];
            try { results = JSON.parse(raw || '[]'); } catch(e) {}
            var container = document.getElementById('ac-city-results');
            if (!container) return;
            if (results.length === 0) { container.innerHTML = ''; return; }
            var html = '';
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                html += '<div class="search-result-item" data-name="' + esc(r.name) + '" data-lat="' + r.latitude + '" data-lon="' + r.longitude + '" data-country="' + esc(r.country || '') + '">' +
                    '<div class="search-result-name">' + esc(r.name) + '</div>' +
                    '<div class="search-result-country">' + esc(r.country || '') + '</div></div>';
            }
            container.innerHTML = html;
            var items = container.querySelectorAll('.search-result-item');
            for (var j = 0; j < items.length; j++) {
                items[j].addEventListener('click', function() {
                    var n = this.getAttribute('data-name');
                    var la = parseFloat(this.getAttribute('data-lat'));
                    var lo = parseFloat(this.getAttribute('data-lon'));
                    var co = this.getAttribute('data-country');
                    callBridge(function() { Android.addCity(n, la, lo, co); }).then(function() {
                        document.getElementById('ac-city-results').innerHTML = '';
                        document.getElementById('ac-city-search').value = '';
                        loadCities();
                    });
                });
            }
        });
    }

    // ===== Feature: Air Quality =====

    function aqiLevel(v) {
        if (v <= 50) return { label: 'Bon', cls: 'aqi-good', color: '#22c55e' };
        if (v <= 100) return { label: 'Modéré', cls: 'aqi-moderate', color: '#eab308' };
        if (v <= 150) return { label: 'Mauvais pour groupes sensibles', cls: 'aqi-unhealthy-sg', color: '#f97316' };
        if (v <= 200) return { label: 'Mauvais', cls: 'aqi-unhealthy', color: '#ef4444' };
        if (v <= 300) return { label: 'Très mauvais', cls: 'aqi-very-unhealthy', color: '#a855f7' };
        return { label: 'Dangereux', cls: 'aqi-hazardous', color: '#991b1b' };
    }

    function aqiTips(v) {
        if (v <= 50) return [
            { icon: '✅', text: 'Qualité de l’air satisfaisante. Profitez de vos activités en extérieur.' }
        ];
        if (v <= 100) return [
            { icon: '⚠️', text: 'Qualité acceptable. Personnes sensibles : limitez les efforts prolongés.' }
        ];
        if (v <= 150) return [
            { icon: '😷', text: 'Groupes sensibles : réduisez les activités extérieures intenses.' },
            { icon: '🏠', text: 'Gardez les fenêtres fermées si possible.' }
        ];
        return [
            { icon: '🚫', text: 'Évitez toute activité physique en extérieur.' },
            { icon: '😷', text: 'Portez un masque FFP2 si vous devez sortir.' },
            { icon: '🏠', text: 'Restez à l’intérieur autant que possible.' }
        ];
    }

    function openAQI() {
        var panel = createPanel('aqi', 'Qualité de l’air');
        showPanel('aqi');
        setPanelLoading('aqi');

        getCurrentPosition().then(function(pos) {
            if (!pos) { setPanelContent('aqi', emptyState('🌍', 'Position indisponible', 'Activez la géolocalisation pour voir la qualité de l’air.')); return; }
            callBridge(function() { return Android.getAirQuality(pos.lat, pos.lon); }).then(function(raw) {
                renderAQI(raw);
            });
        });
    }

    function renderAQI(raw) {
        var data;
        try { data = JSON.parse(raw); } catch(e) { setPanelContent('aqi', emptyState('📉', 'Données indisponibles', '')); return; }

        var current = data.current || {};
        var aqi = current.european_aqi || current.us_aqi || 0;
        var level = aqiLevel(aqi);

        var pollutants = [
            { key: 'pm2_5', name: 'PM2.5', unit: 'µg/m³', max: 75 },
            { key: 'pm10', name: 'PM10', unit: 'µg/m³', max: 150 },
            { key: 'ozone', name: 'O₃', unit: 'µg/m³', max: 240 },
            { key: 'nitrogen_dioxide', name: 'NO₂', unit: 'µg/m³', max: 200 },
            { key: 'sulphur_dioxide', name: 'SO₂', unit: 'µg/m³', max: 350 },
            { key: 'carbon_monoxide', name: 'CO', unit: 'µg/m³', max: 10000 }
        ];

        var html = '<div class="weather-card" style="text-align:center;padding:24px">' +
            '<div class="big-value">' + Math.round(aqi) + '</div>' +
            '<div style="margin-top:8px"><span class="aqi-badge ' + level.cls + '">' + level.label + '</span></div></div>';

        html += '<div class="section-title">Polluants</div><div class="weather-card">';
        for (var i = 0; i < pollutants.length; i++) {
            var p = pollutants[i];
            var val = current[p.key];
            if (val === undefined || val === null) val = 0;
            var pct = Math.min(100, (val / p.max) * 100);
            var barColor = pct < 33 ? '#22c55e' : pct < 66 ? '#eab308' : '#ef4444';
            html += '<div class="pollutant-row">' +
                '<span class="pollutant-name">' + p.name + '</span>' +
                '<div class="pollutant-bar-track"><div class="pollutant-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>' +
                '<span class="pollutant-val">' + Math.round(val * 10) / 10 + ' <small>' + p.unit + '</small></span></div>';
        }
        html += '</div>';

        var tips = aqiTips(aqi);
        html += '<div class="section-title">Recommandations</div>';
        for (var t = 0; t < tips.length; t++) {
            html += '<div class="health-tip"><span class="health-tip-icon">' + tips[t].icon + '</span><span class="health-tip-text">' + tips[t].text + '</span></div>';
        }

        setPanelContent('aqi', html);
    }

    // ===== Feature: UV Index =====

    function uvLevel(v) {
        if (v <= 2) return { label: 'Faible', cls: 'uv-low', color: '#22c55e' };
        if (v <= 5) return { label: 'Modéré', cls: 'uv-moderate', color: '#eab308' };
        if (v <= 7) return { label: 'Élevé', cls: 'uv-high', color: '#f97316' };
        if (v <= 10) return { label: 'Très élevé', cls: 'uv-very-high', color: '#ef4444' };
        return { label: 'Extrême', cls: 'uv-extreme', color: '#a855f7' };
    }

    function uvTips(v) {
        if (v <= 2) return [
            { icon: '😎', text: 'Aucune protection particulière nécessaire.' }
        ];
        if (v <= 5) return [
            { icon: '🧢', text: 'Portez un chapeau et des lunettes de soleil.' },
            { icon: '🧴', text: 'Appliquez une crème solaire SPF 30.' }
        ];
        if (v <= 7) return [
            { icon: '🧢', text: 'Chapeau, lunettes et crème SPF 50 indispensables.' },
            { icon: '⛱️', text: 'Cherchez l’ombre entre 12h et 16h.' }
        ];
        return [
            { icon: '🚫', text: 'Évitez l’exposition entre 11h et 16h.' },
            { icon: '🧴', text: 'Crème SPF 50+ à renouveler toutes les 2h.' },
            { icon: '👕', text: 'Vêtements couvrants et lunettes UV400.' },
            { icon: '💧', text: 'Hydratez-vous régulièrement.' }
        ];
    }

    function openUV() {
        var panel = createPanel('uv', 'Indice UV');
        showPanel('uv');
        setPanelLoading('uv');

        getCurrentPosition().then(function(pos) {
            if (!pos) { setPanelContent('uv', emptyState('☀️', 'Position indisponible', '')); return; }
            callBridge(function() { return Android.getWeatherData(pos.lat, pos.lon); }).then(function(raw) {
                renderUV(raw);
            });
        });
    }

    function renderUV(raw) {
        var data;
        try { data = JSON.parse(raw); } catch(e) { setPanelContent('uv', emptyState('📉', 'Données indisponibles', '')); return; }

        var daily = data.daily || {};
        var hourly = data.hourly || {};
        var uvMax = (daily.uv_index_max && daily.uv_index_max[0]) || 0;
        var level = uvLevel(uvMax);

        var sunrise = (daily.sunrise && daily.sunrise[0]) || '';
        var sunset = (daily.sunset && daily.sunset[0]) || '';
        var srTime = sunrise ? sunrise.split('T')[1] || '' : '';
        var ssTime = sunset ? sunset.split('T')[1] || '' : '';

        var html = '<div class="weather-card" style="text-align:center;padding:24px">' +
            '<div class="big-value">' + (Math.round(uvMax * 10) / 10) + '</div>' +
            '<div style="margin-top:8px"><span class="uv-badge ' + level.cls + '">' + level.label + '</span></div></div>';

        // Sun arc
        html += '<div class="weather-card"><div class="section-title" style="margin-top:0">Position du soleil</div>';
        html += buildSunArc(sunrise, sunset);
        html += '<div class="stat-row" style="margin-top:12px">' +
            '<div class="stat-item"><div class="stat-value">' + srTime + '</div><div class="stat-label">Lever</div></div>' +
            '<div class="stat-item"><div class="stat-value">' + ssTime + '</div><div class="stat-label">Coucher</div></div>';
        if (srTime) {
            var gh1 = addMinutes(srTime, 60);
            var gh2 = addMinutes(ssTime, -60);
            html += '<div class="stat-item"><div class="stat-value">' + gh1 + '</div><div class="stat-label">Heure dorée AM</div></div>' +
                '<div class="stat-item"><div class="stat-value">' + gh2 + '</div><div class="stat-label">Heure dorée PM</div></div>';
        }
        html += '</div></div>';

        // Hourly UV chart
        if (hourly.uv_index && hourly.time) {
            html += '<div class="section-title">UV par heure (aujourd’hui)</div><div class="weather-card">';
            html += '<div class="precip-bars" style="height:100px">';
            var now = new Date();
            var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            var count = 0;
            for (var i = 0; i < hourly.time.length && count < 24; i++) {
                if (hourly.time[i].indexOf(todayStr) !== 0) continue;
                var uv = hourly.uv_index[i] || 0;
                var uvLvl = uvLevel(uv);
                var h = Math.min(100, (uv / 12) * 100);
                html += '<div class="precip-bar" style="height:' + h + '%;background:' + uvLvl.color + '" data-value="UV ' + (Math.round(uv * 10) / 10) + '"></div>';
                count++;
            }
            html += '</div>';
            html += '<div class="precip-labels"><span class="precip-label">0h</span><span class="precip-label">6h</span><span class="precip-label">12h</span><span class="precip-label">18h</span><span class="precip-label">23h</span></div>';
            html += '</div>';
        }

        // Tips
        var tips = uvTips(uvMax);
        html += '<div class="section-title">Protection</div>';
        for (var t = 0; t < tips.length; t++) {
            html += '<div class="health-tip"><span class="health-tip-icon">' + tips[t].icon + '</span><span class="health-tip-text">' + tips[t].text + '</span></div>';
        }

        setPanelContent('uv', html);
    }

    function buildSunArc(sunrise, sunset) {
        if (!sunrise || !sunset) return '';
        var srMin = timeToMinutes(sunrise.split('T')[1] || '06:00');
        var ssMin = timeToMinutes(sunset.split('T')[1] || '20:00');
        var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        var pct = Math.max(0, Math.min(1, (nowMin - srMin) / (ssMin - srMin)));
        var isDay = nowMin >= srMin && nowMin <= ssMin;

        var cx = 140, cy = 120, r = 100;
        var angle = Math.PI - pct * Math.PI;
        var sx = cx + r * Math.cos(Math.PI);
        var sy = cy - r * Math.sin(Math.PI);
        var ex = cx + r * Math.cos(0);
        var ey = cy - r * Math.sin(0);
        var dotX = cx + r * Math.cos(angle);
        var dotY = cy - r * Math.sin(angle);

        var svg = '<div class="sun-arc-container">' +
            '<svg class="sun-arc-svg" viewBox="0 0 280 140">' +
            '<path d="M ' + sx + ' ' + sy + ' A ' + r + ' ' + r + ' 0 0 1 ' + ex + ' ' + ey + '" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="3" stroke-dasharray="6 4"/>' +
            '<path d="M ' + sx + ' ' + sy + ' A ' + r + ' ' + r + ' 0 0 1 ' + dotX + ' ' + dotY + '" fill="none" stroke="' + (isDay ? '#f59e0b' : '#475569') + '" stroke-width="3"/>';
        if (isDay) {
            svg += '<circle cx="' + dotX + '" cy="' + dotY + '" r="10" fill="#fde047" opacity=".3"/>' +
                '<circle cx="' + dotX + '" cy="' + dotY + '" r="6" fill="#fde047"/>';
        } else {
            svg += '<circle cx="' + dotX + '" cy="' + dotY + '" r="6" fill="#475569"/>';
        }
        svg += '<line x1="40" y1="' + cy + '" x2="240" y2="' + cy + '" stroke="rgba(255,255,255,.06)" stroke-width="1"/>' +
            '</svg></div>';
        return svg;
    }

    function timeToMinutes(t) {
        var parts = t.split(':');
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }

    function addMinutes(t, min) {
        var parts = t.split(':');
        var total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + min;
        if (total < 0) total += 1440;
        var h = Math.floor(total / 60) % 24;
        var m = total % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    // ===== Feature: Precipitation =====

    function openPrecip() {
        var panel = createPanel('precip', 'Précipitations');
        showPanel('precip');
        setPanelLoading('precip');

        getCurrentPosition().then(function(pos) {
            if (!pos) { setPanelContent('precip', emptyState('🌧️', 'Position indisponible', '')); return; }
            callBridge(function() { return Android.getWeatherData(pos.lat, pos.lon); }).then(function(raw) {
                renderPrecip(raw);
            });
        });
    }

    function renderPrecip(raw) {
        var data;
        try { data = JSON.parse(raw); } catch(e) { setPanelContent('precip', emptyState('📉', 'Données indisponibles', '')); return; }

        var minutely = data.minutely_15 || {};
        var hourly = data.hourly || {};
        var html = '';

        // Minutely precipitation (15-min intervals)
        if (minutely.precipitation && minutely.time) {
            var now = new Date();
            var nowISO = now.toISOString().slice(0, 13);
            var bars = [];
            var startIdx = -1;
            for (var i = 0; i < minutely.time.length; i++) {
                if (minutely.time[i] >= nowISO || startIdx >= 0) {
                    if (startIdx < 0) startIdx = i;
                    if (bars.length < 8) bars.push({ time: minutely.time[i], val: minutely.precipitation[i] || 0 });
                }
            }

            var firstRain = -1;
            for (var j = 0; j < bars.length; j++) {
                if (bars[j].val > 0) { firstRain = j; break; }
            }

            var summary;
            if (firstRain === 0) summary = '🌧️ Il pleut actuellement';
            else if (firstRain > 0) summary = '🌦️ Pluie dans ~' + (firstRain * 15) + ' minutes';
            else summary = '☀️ Pas de pluie prévue dans les 2 prochaines heures';

            html += '<div class="minutely-summary">' + summary + '</div>';
            html += '<div class="section-title">Prochaines 2 heures (intervalles de 15 min)</div>';
            html += '<div class="weather-card"><div class="precip-bars">';

            var maxVal = 0;
            for (var k = 0; k < bars.length; k++) { if (bars[k].val > maxVal) maxVal = bars[k].val; }
            if (maxVal === 0) maxVal = 1;

            for (var b = 0; b < bars.length; b++) {
                var pct = Math.max(2, (bars[b].val / maxVal) * 100);
                var intensity = bars[b].val;
                var barColor;
                if (intensity === 0) barColor = 'rgba(56,189,248,.15)';
                else if (intensity < 1) barColor = '#7dd3fc';
                else if (intensity < 4) barColor = '#38bdf8';
                else barColor = '#0284c7';
                html += '<div class="precip-bar" style="height:' + pct + '%;background:' + barColor + '" data-value="' + (Math.round(intensity * 10) / 10) + ' mm"></div>';
            }
            html += '</div><div class="precip-labels">';
            for (var l = 0; l < bars.length; l++) {
                var t = bars[l].time.split('T')[1] || '';
                if (l === 0 || l === bars.length - 1 || l === Math.floor(bars.length / 2)) {
                    html += '<span class="precip-label">' + t.slice(0, 5) + '</span>';
                }
            }
            html += '</div></div>';
        }

        // Hourly precipitation for next 24h
        if (hourly.precipitation_probability && hourly.time) {
            html += '<div class="section-title">Probabilité de pluie (24h)</div>';
            html += '<div class="forecast-scroll">';
            var nowH = new Date();
            var currentHour = nowH.getFullYear() + '-' + String(nowH.getMonth() + 1).padStart(2, '0') + '-' + String(nowH.getDate()).padStart(2, '0') + 'T' + String(nowH.getHours()).padStart(2, '0');
            var shown = 0;
            for (var h = 0; h < hourly.time.length && shown < 24; h++) {
                if (hourly.time[h] < currentHour) continue;
                var prob = hourly.precipitation_probability[h] || 0;
                var precip = (hourly.precipitation && hourly.precipitation[h]) || 0;
                var wc = (hourly.weathercode && hourly.weathercode[h]) || 0;
                var temp = (hourly.temperature_2m && hourly.temperature_2m[h]);
                var hTime = (hourly.time[h].split('T')[1] || '').slice(0, 5);
                var isActive = shown === 0 ? ' active' : '';
                html += '<div class="hour-card' + isActive + '">' +
                    '<div class="hour-time">' + hTime + '</div>' +
                    '<div class="hour-icon">' + weatherIcon(wc) + '</div>' +
                    (temp !== undefined ? '<div class="hour-temp">' + Math.round(temp) + '°</div>' : '') +
                    '<div class="hour-precip">' + ICONS.droplet.replace('<svg', '<svg style="width:10px;height:10px;display:inline;vertical-align:middle;stroke:#38bdf8"') + ' ' + prob + '%</div>' +
                    '</div>';
                shown++;
            }
            html += '</div>';
        }

        if (!html) html = emptyState('🌧️', 'Données indisponibles', 'Les prévisions de précipitations ne sont pas encore disponibles.');
        setPanelContent('precip', html);
    }

    // ===== Feature: Radar =====

    var radarMap = null;
    var radarLayer = null;

    function openRadar() {
        var panel = createPanel('radar', 'Radar & Carte Satellite');
        showPanel('radar');
        setPanelLoading('radar');

        getCurrentPosition().then(function(pos) {
            if (!pos) { setPanelContent('radar', emptyState('🗺️', 'Position indisponible', '')); return; }
            loadLeaflet(function() {
                callBridge(function() { return Android.getWeatherData(pos.lat, pos.lon); }).then(function(raw) {
                    renderRadarMap(raw, pos);
                });
            });
        });
    }

    function loadLeaflet(callback) {
        if (window.L) { callback(); return; }
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(css);
        var js = document.createElement('script');
        js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        js.onload = function() { callback(); };
        js.onerror = function() { callback(); };
        document.head.appendChild(js);
    }

    function renderRadarMap(raw, pos) {
        var data;
        try { data = JSON.parse(raw); } catch(e) { setPanelContent('radar', emptyState('📉', 'Données indisponibles', '')); return; }

        var hourly = data.hourly || {};
        var current = data.current || {};
        var html = '';

        // Map container
        html += '<div class="weather-card" style="padding:0;overflow:hidden;border-radius:16px;position:relative">' +
            '<div id="ac-radar-map" style="width:100%;height:380px;z-index:1"></div></div>';

        // Front/wind analysis
        var windSpeed = current.wind_speed_10m || 0;
        var windDir = current.wind_direction_10m || 0;
        var weatherCode = current.weather_code || 0;
        var frontInfo = analyzeFront(windDir, windSpeed, weatherCode);
        if (frontInfo) {
            html += '<div class="weather-card radar-front-card">' +
                '<div class="radar-front-icon">' + frontInfo.icon + '</div>' +
                '<div class="radar-front-info">' +
                '<div class="radar-front-title">' + frontInfo.title + '</div>' +
                '<div class="radar-front-detail">' + frontInfo.detail + '</div>' +
                '</div></div>';
        }

        // Precipitation chart (12h)
        html += '<div class="section-title">Précipitations (12h)</div>';
        html += '<div class="weather-card"><div class="radar-chart-container">' +
            '<canvas id="ac-radar-canvas"></canvas></div></div>';

        // Wind scroll
        if (hourly.wind_speed_10m && hourly.wind_direction_10m) {
            html += '<div class="section-title">Conditions de vent</div><div class="forecast-scroll">';
            var nowH = new Date();
            var curHour = nowH.getFullYear() + '-' + String(nowH.getMonth() + 1).padStart(2, '0') + '-' + String(nowH.getDate()).padStart(2, '0') + 'T' + String(nowH.getHours()).padStart(2, '0');
            var shown = 0;
            for (var i = 0; i < hourly.time.length && shown < 24; i++) {
                if (hourly.time[i] < curHour) continue;
                var sp = hourly.wind_speed_10m[i] || 0;
                var dr = hourly.wind_direction_10m[i] || 0;
                var hT = (hourly.time[i].split('T')[1] || '').slice(0, 5);
                html += '<div class="hour-card">' +
                    '<div class="hour-time">' + hT + '</div>' +
                    '<div class="hour-icon" style="transform:rotate(' + dr + 'deg);font-size:20px">↑</div>' +
                    '<div class="hour-temp">' + Math.round(sp) + '</div>' +
                    '<div class="hour-precip">km/h</div></div>';
                shown++;
            }
            html += '</div>';
        }

        setPanelContent('radar', html);

        setTimeout(function() {
            initRadarMap(pos);
            drawRadarChart(hourly);
        }, 200);
    }

    function initRadarMap(pos) {
        var mapEl = document.getElementById('ac-radar-map');
        if (!mapEl || !window.L) return;

        if (radarMap) { radarMap.remove(); radarMap = null; }

        radarMap = L.map(mapEl, {
            center: [pos.lat, pos.lon],
            zoom: 8,
            zoomControl: false,
            attributionControl: true
        });

        // Satellite base layer (ESRI World Imagery)
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Esri Satellite',
            maxZoom: 18
        }).addTo(radarMap);

        L.control.zoom({ position: 'topright' }).addTo(radarMap);

        // Location marker
        L.circleMarker([pos.lat, pos.lon], {
            radius: 8, fillColor: '#38bdf8', fillOpacity: 0.9,
            color: '#fff', weight: 2.5
        }).addTo(radarMap);
        L.circleMarker([pos.lat, pos.lon], {
            radius: 22, fillColor: '#38bdf8', fillOpacity: 0.12,
            color: '#38bdf8', weight: 1, opacity: 0.3
        }).addTo(radarMap);

        // RainViewer radar overlay
        loadRainViewerRadar(radarMap);
    }

    function loadRainViewerRadar(map) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://api.rainviewer.com/public/weather-maps.json');
        xhr.onload = function() {
            if (xhr.status !== 200) return;
            try {
                var apiData = JSON.parse(xhr.responseText);
                var radar = apiData.radar;
                if (!radar || !radar.past || radar.past.length === 0) return;
                var latest = radar.past[radar.past.length - 1];

                radarLayer = L.tileLayer(apiData.host + latest.path + '/256/{z}/{x}/{y}/6/1_1.png', {
                    opacity: 0.55,
                    zIndex: 10
                }).addTo(map);

                addRadarOverlays(map, latest.time);
            } catch(e) {}
        };
        xhr.onerror = function() {};
        xhr.send();
    }

    function addRadarOverlays(map, timestamp) {
        var legend = L.control({ position: 'bottomleft' });
        legend.onAdd = function() {
            var div = L.DomUtil.create('div', 'radar-map-legend');
            var date = new Date(timestamp * 1000);
            var timeStr = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
            div.innerHTML =
                '<div class="rml-row">' +
                '<span class="rml-label">Intensité:</span>' +
                '<span class="rml-dot" style="background:#61c8ff"></span>' +
                '<span class="rml-dot" style="background:#3dba3d"></span>' +
                '<span class="rml-dot" style="background:#f5e636"></span>' +
                '<span class="rml-dot" style="background:#f58c36"></span>' +
                '<span class="rml-dot" style="background:#f53636"></span>' +
                '<span class="rml-dot" style="background:#c836e0"></span>' +
                '<span class="rml-label" style="margin-left:2px">>50 dBZ</span>' +
                '</div>' +
                '<div class="rml-time">🕐 ' + timeStr + ' (En direct)</div>';
            return div;
        };
        legend.addTo(map);
    }

    function analyzeFront(windDir, windSpeed, weatherCode) {
        if (windSpeed < 5 && weatherCode === 0) return null;
        var dirs = ['N','NE','E','SE','S','SO','O','NO'];
        var fromIdx = Math.round(windDir / 45) % 8;
        var toIdx = (fromIdx + 4) % 8;
        var icon = '💨', title = 'Flux ' + dirs[fromIdx] + ' → ' + dirs[toIdx];
        var detail = 'Vitesse: ~' + Math.round(windSpeed) + ' km/h';
        if (weatherCode >= 95) {
            icon = '⚡'; title = 'Front orageux ' + dirs[fromIdx] + ' → ' + dirs[toIdx];
            detail += ' · Orages actifs';
        } else if (weatherCode >= 61 && weatherCode <= 67) {
            icon = '🌧️'; title = 'Front pluvieux ' + dirs[fromIdx] + ' → ' + dirs[toIdx];
            detail += ' · Pluie active';
        } else if (weatherCode >= 71 && weatherCode <= 77) {
            icon = '❄️'; title = 'Front neigeux ' + dirs[fromIdx] + ' → ' + dirs[toIdx];
            detail += ' · Neige';
        } else if (windSpeed > 50) {
            icon = '🌬️'; title = 'Vents forts ' + dirs[fromIdx] + ' → ' + dirs[toIdx];
        }
        return { icon: icon, title: title, detail: detail };
    }

    function drawRadarChart(hourly) {
        var canvas = document.getElementById('ac-radar-canvas');
        if (!canvas) return;
        var parent = canvas.parentElement;
        canvas.width = parent.offsetWidth * 2;
        canvas.height = parent.offsetHeight * 2;
        canvas.style.width = parent.offsetWidth + 'px';
        canvas.style.height = parent.offsetHeight + 'px';
        var ctx = canvas.getContext('2d');
        ctx.scale(2, 2);

        var w = parent.offsetWidth, h = parent.offsetHeight;
        var padL = 40, padR = 12, padT = 20, padB = 40;
        var chartW = w - padL - padR;
        var chartH = h - padT - padB;

        var nowH = new Date();
        var curHour = nowH.getFullYear() + '-' + String(nowH.getMonth() + 1).padStart(2, '0') + '-' + String(nowH.getDate()).padStart(2, '0') + 'T' + String(nowH.getHours()).padStart(2, '0');
        var times = [], precip = [];
        for (var i = 0; i < (hourly.time || []).length && times.length < 12; i++) {
            if (hourly.time[i] < curHour) continue;
            times.push((hourly.time[i].split('T')[1] || '').slice(0, 5));
            precip.push((hourly.precipitation && hourly.precipitation[i]) || 0);
        }
        if (times.length === 0) return;

        var maxVal = 0;
        for (var j = 0; j < precip.length; j++) { if (precip[j] > maxVal) maxVal = precip[j]; }
        if (maxVal === 0) maxVal = 1;

        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        ctx.lineWidth = 1;
        for (var g = 0; g <= 4; g++) {
            var gy = padT + (chartH / 4) * g;
            ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + chartW, gy); ctx.stroke();
        }

        ctx.fillStyle = '#475569';
        ctx.font = '11px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'right';
        for (var y = 0; y <= 4; y++) {
            var val = maxVal - (maxVal / 4) * y;
            ctx.fillText((Math.round(val * 10) / 10) + '', padL - 6, padT + (chartH / 4) * y + 4);
        }

        drawAreaCurve(ctx, precip, padL, padT, chartW, chartH, maxVal, 'rgba(56,189,248,.5)', 'rgba(56,189,248,.15)');

        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        var barW = chartW / times.length;
        for (var x = 0; x < times.length; x++) {
            if (x % 2 === 0 || times.length <= 6) {
                ctx.fillText(times[x], padL + barW * x + barW / 2, padT + chartH + 20);
            }
        }

        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.font = '10px Plus Jakarta Sans, sans-serif';
        ctx.fillText('mm', padL, padT - 6);
    }

    function drawAreaCurve(ctx, values, padL, padT, chartW, chartH, maxVal, strokeColor, fillColor) {
        var barW = chartW / values.length;
        ctx.beginPath();
        ctx.moveTo(padL, padT + chartH);
        for (var i = 0; i < values.length; i++) {
            var x = padL + barW * i + barW / 2;
            var y = padT + chartH - (values[i] / maxVal) * chartH;
            if (i === 0) ctx.lineTo(x, y);
            else {
                var px = padL + barW * (i - 1) + barW / 2;
                ctx.bezierCurveTo((px + x) / 2, padT + chartH - (values[i - 1] / maxVal) * chartH, (px + x) / 2, y, x, y);
            }
        }
        ctx.lineTo(padL + barW * (values.length - 1) + barW / 2, padT + chartH);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var j = 0; j < values.length; j++) {
            var x2 = padL + barW * j + barW / 2;
            var y2 = padT + chartH - (values[j] / maxVal) * chartH;
            if (j === 0) ctx.moveTo(x2, y2);
            else {
                var px2 = padL + barW * (j - 1) + barW / 2;
                ctx.bezierCurveTo((px2 + x2) / 2, padT + chartH - (values[j - 1] / maxVal) * chartH, (px2 + x2) / 2, y2, x2, y2);
            }
        }
        ctx.stroke();
    }

    // ===== Feature: Alerts =====

    function openAlerts() {
        var panel = createPanel('alerts', 'Alertes météo');
        showPanel('alerts');
        setPanelLoading('alerts');

        callBridge(function() { return typeof Android !== 'undefined' ? Android.getAlertSettings() : '{}'; }).then(function(raw) {
            renderAlerts(raw);
        });
    }

    function renderAlerts(raw) {
        var settings;
        try { settings = JSON.parse(raw || '{}'); } catch(e) { settings = {}; }

        var enabled = settings.enabled !== false;
        var tempHigh = settings.tempHigh || 35;
        var tempLow = settings.tempLow || -10;
        var wind = settings.windThreshold || 80;
        var uv = settings.uvThreshold || 8;
        var aqi = settings.aqiThreshold || 100;

        var html = '<div class="weather-card">' +
            '<div class="alert-row"><div class="alert-label-group">' +
            '<div class="alert-label">Activer les alertes</div>' +
            '<div class="alert-sublabel">Recevez des notifications pour les conditions extrêmes</div></div>' +
            '<label class="alert-toggle"><input type="checkbox" id="ac-alert-master" ' + (enabled ? 'checked' : '') + '>' +
            '<span class="alert-toggle-track"></span><span class="alert-toggle-thumb"></span></label></div></div>';

        html += '<div id="ac-alert-sliders" style="' + (enabled ? '' : 'opacity:.4;pointer-events:none') + '">';

        html += buildSlider('temp-high', 'Température haute', '°C', tempHigh, 20, 50, 1);
        html += buildSlider('temp-low', 'Température basse', '°C', tempLow, -30, 10, 1);
        html += buildSlider('wind', 'Vent', 'km/h', wind, 20, 150, 5);
        html += buildSlider('uv', 'Indice UV', '', uv, 3, 12, 1);
        html += buildSlider('aqi', 'Qualité de l’air (AQI)', '', aqi, 25, 300, 25);

        html += '</div>';
        html += '<button class="save-btn" id="ac-alert-save">Enregistrer les alertes</button>';

        setPanelContent('alerts', html);

        // Toggle
        document.getElementById('ac-alert-master').addEventListener('change', function() {
            var el = document.getElementById('ac-alert-sliders');
            if (this.checked) { el.style.opacity = ''; el.style.pointerEvents = ''; }
            else { el.style.opacity = '.4'; el.style.pointerEvents = 'none'; }
        });

        // Slider value displays
        var sliders = panels.alerts.content.querySelectorAll('.alert-slider');
        for (var i = 0; i < sliders.length; i++) {
            (function(slider) {
                slider.addEventListener('input', function() {
                    var display = document.getElementById('ac-val-' + slider.getAttribute('data-key'));
                    if (display) display.textContent = slider.value + ' ' + slider.getAttribute('data-unit');
                });
            })(sliders[i]);
        }

        // Save
        document.getElementById('ac-alert-save').addEventListener('click', function() {
            var obj = {
                enabled: document.getElementById('ac-alert-master').checked,
                tempHigh: parseFloat(document.getElementById('ac-slider-temp-high').value),
                tempLow: parseFloat(document.getElementById('ac-slider-temp-low').value),
                windThreshold: parseFloat(document.getElementById('ac-slider-wind').value),
                uvThreshold: parseFloat(document.getElementById('ac-slider-uv').value),
                aqiThreshold: parseInt(document.getElementById('ac-slider-aqi').value, 10)
            };
            callBridge(function() { Android.setAlertSettings(JSON.stringify(obj)); }).then(function() {
                var btn = document.getElementById('ac-alert-save');
                btn.textContent = '✅ Enregistré !';
                setTimeout(function() { btn.textContent = 'Enregistrer les alertes'; }, 2000);
            });
        });
    }

    function buildSlider(key, label, unit, value, min, max, step) {
        return '<div class="alert-slider-row"><div class="alert-slider-header">' +
            '<span class="alert-slider-label">' + label + '</span>' +
            '<span class="alert-slider-value" id="ac-val-' + key + '">' + value + ' ' + unit + '</span></div>' +
            '<input type="range" class="alert-slider" id="ac-slider-' + key + '" data-key="' + key + '" data-unit="' + unit + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"></div>';
    }

    // ===== Helpers =====

    function emptyState(icon, title, desc) {
        return '<div class="empty-state"><div class="empty-state-icon">' + icon + '</div>' +
            '<div class="empty-state-title">' + esc(title) + '</div>' +
            '<div class="empty-state-desc">' + esc(desc) + '</div></div>';
    }

    // ===== Init =====

    function init() {
        createFab();
        getCurrentPosition();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
