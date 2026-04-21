import { useState, useEffect, useCallback } from 'react';
import './App.css';

const WMO_DESC = {
  0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
  77:'Snow grains',80:'Light showers',81:'Showers',82:'Heavy showers',
  85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm + hail',99:'Severe thunderstorm'
};
const WMO_ICON = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌧️',61:'🌦️',63:'🌧️',65:'🌧️',
  71:'🌨️',73:'❄️',75:'❄️',77:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',
  85:'🌨️',86:'🌨️',95:'⛈️',96:'⛈️',99:'⛈️'
};
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TIP_COLORS = { blue:'#E6F1FB', amber:'#FAEEDA', green:'#EAF3DE', coral:'#FAECE7', teal:'#E1F5EE', purple:'#EEEDFE' };

function App() {
  const [input, setInput] = useState('');
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [tips, setTips] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | locating | fetching | tipping | done | error
  const [error, setError] = useState('');

  // Accepts either { city } or { lat, lon } — never both.
  const fetchWeather = useCallback(async ({ city, lat, lon } = {}) => {
    setPhase('locating');
    setError('');
    setWeather(null);
    setForecast([]);
    setTips([]);

    try {
      let resolvedLat, resolvedLon, name, country;

      if (lat !== undefined && lon !== undefined) {
        resolvedLat = lat;
        resolvedLon = lon;
        // Reverse-geocode coordinates to a display name (no API key required).
        const revRes = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
        );
        if (!revRes.ok) throw new Error('Could not determine your location name.');
        const revData = await revRes.json();
        name = revData.city || revData.locality || revData.principalSubdivision || 'Your Location';
        country = revData.countryCode || '';
      } else {
        if (!city?.trim()) return;
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
        );
        if (!geoRes.ok) throw new Error('Geocoding service unavailable. Please try again.');
        const geoData = await geoRes.json();
        if (!geoData.results?.length) throw new Error(`City "${city}" not found. Try a different spelling.`);
        ({ latitude: resolvedLat, longitude: resolvedLon, name, country } = geoData.results[0]);
      }

      setPhase('fetching');

      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${resolvedLat}&longitude=${resolvedLon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&daily=weather_code,temperature_2m_max,precipitation_probability_max` +
        `&wind_speed_unit=ms&timezone=auto&forecast_days=5`
      );
      if (!wRes.ok) throw new Error('Weather service unavailable. Please try again.');
      const wData = await wRes.json();
      const c = wData.current;
      const d = wData.daily;

      const current = {
        name, country,
        temp: Math.round(c.temperature_2m),
        feels: Math.round(c.apparent_temperature),
        humidity: Math.round(c.relative_humidity_2m),
        wind: Math.round(c.wind_speed_10m),
        code: c.weather_code,
        desc: WMO_DESC[c.weather_code] || 'Unknown',
        icon: WMO_ICON[c.weather_code] || '🌤️',
      };

      const dailyForecast = d.time.map((dt, i) => ({
        label: DAYS[new Date(dt).getUTCDay()],
        icon: WMO_ICON[d.weather_code[i]] || '🌤️',
        temp: Math.round(d.temperature_2m_max[i]),
        rain: d.precipitation_probability_max[i],
      }));

      setWeather(current);
      setForecast(dailyForecast);
      setInput(name);
      setPhase('tipping');

      const tipsRes = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather: current }),
      });
      if (!tipsRes.ok) throw new Error('Failed to generate tips. Check that the API server is running.');
      const tipsData = await tipsRes.json();
      setTips(tipsData.tips);
      setPhase('done');
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => fetchWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        ()  => fetchWeather({ city: 'London' }) // denied or unavailable — fall back
      );
    } else {
      fetchWeather({ city: 'London' });
    }
  }, [fetchWeather]);

  const handleSubmit = () => {
    if (input.trim()) fetchWeather({ city: input });
  };

  const isLoading = ['locating', 'fetching', 'tipping'].includes(phase);
  const loadLabel = {
    locating: 'Detecting location…',
    fetching: 'Fetching weather…',
    tipping:  'Generating tips…',
  }[phase] || '';

  return (
    <div className="app">
      <div className="app-inner">
        <header className="app-header">
          <h1 className="app-title">Weather Advisor</h1>
          <p className="app-subtitle">Live conditions + smart tips for your day</p>
        </header>

        <div className="search-row">
          <input
            className="city-input"
            type="text"
            placeholder="Enter city…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            disabled={isLoading}
          />
          <button className="go-btn" onClick={handleSubmit} disabled={isLoading}>
            Get advice
          </button>
        </div>

        {phase === 'error' && <div className="error-box">{error}</div>}

        {isLoading && (
          <div className="loading-state">
            <div className="spinner" />
            <span className="loading-text">{loadLabel}</span>
          </div>
        )}

        {weather && (
          <>
            <div className="weather-card">
              <div className="weather-icon">{weather.icon}</div>
              <div className="weather-info">
                <div className="weather-city">{weather.name}, {weather.country}</div>
                <div className="weather-desc">{weather.desc}</div>
                <div className="weather-stats">
                  <div className="stat"><span className="stat-val">{weather.temp}°C</span><span className="stat-lbl">Temp</span></div>
                  <div className="stat"><span className="stat-val">{weather.feels}°C</span><span className="stat-lbl">Feels like</span></div>
                  <div className="stat"><span className="stat-val">{weather.humidity}%</span><span className="stat-lbl">Humidity</span></div>
                  <div className="stat"><span className="stat-val">{weather.wind} m/s</span><span className="stat-lbl">Wind</span></div>
                </div>
              </div>
            </div>

            <div className="forecast-row">
              {forecast.map((d, i) => (
                <div className="forecast-day" key={i}>
                  <div className="f-label">{d.label}</div>
                  <div className="f-icon">{d.icon}</div>
                  <div className="f-temp">{d.temp}°C</div>
                  <div className="f-rain">{d.rain > 0 ? `${d.rain}% rain` : '—'}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {(tips.length > 0 || phase === 'tipping') && (
          <div className="tips-section">
            <div className="tips-label">Today's recommendations</div>
            {phase === 'tipping' && tips.length === 0 ? (
              <div className="loading-state" style={{ padding: '1rem 0' }}>
                <div className="spinner" />
                <span className="loading-text">Crafting your tips…</span>
              </div>
            ) : (
              <div className="tips-grid">
                {tips.map((t, i) => (
                  <div
                    className="tip-card"
                    key={t.title}
                    style={{ animationDelay: `${i * 0.07}s` }}
                  >
                    <div className="tip-icon" style={{ background: TIP_COLORS[t.color] || TIP_COLORS.blue }}>
                      {t.icon}
                    </div>
                    <div className="tip-body">
                      <strong>{t.title}</strong>
                      {t.tip}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
