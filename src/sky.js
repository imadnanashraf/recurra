/* =====================================================================
   SKY on Today: mountains, the sun crossing left → right during the day,
   the moon crossing right → left at night (never both at once), drifting
   clouds, and the real weather where you are: rain, drizzle, snow, fog,
   thunder. Weather comes from Open-Meteo (free, no key) for your rough
   area (the same city-level guess used for the activity log). Updated
   every 30 minutes; the sun and moon move every minute. Gentle motion
   only, and none at all with "reduce motion".
   ===================================================================== */
const Sky = { wx: null, at: 0, timer: null, loading: false };
const SKY_W = 1000, SKY_H = 220;
// what the weather code means (WMO codes)
function wxKind(code) {
  if (code == null) return 'clear';
  if (code >= 95) return 'thunder';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'overcast';
  if (code === 1 || code === 2) return 'partly';
  return 'clear';
}
const WX_TEXT = { clear: 'Clear', partly: 'Partly cloudy', overcast: 'Cloudy', fog: 'Foggy', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', thunder: 'Thunderstorm' };
const WX_ICON = { clear: '☀️', partly: '⛅', overcast: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', thunder: '⛈️' };
async function loadWeather() {
  if (Sky.loading || (Sky.wx && Date.now() - Sky.at < 30 * 60e3)) return;
  try { const c = JSON.parse(localStorage.getItem('rc-wx') || 'null'); if (c && Date.now() - c.at < 30 * 60e3) { Sky.wx = c.wx; Sky.at = c.at; return; } } catch (e) {}
  Sky.loading = true;
  try {
    const net = await Activity.net();
    if (net && net.lat != null && net.lon != null) {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${net.lat}&longitude=${net.lon}&current=temperature_2m,weather_code,cloud_cover,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
      const r = await fetch(u), j = r && r.ok ? await r.json() : null;
      if (j && j.current) {
        const ms = s => { const d = new Date(s); return isNaN(d) ? null : d.getTime(); };
        Sky.wx = { code: j.current.weather_code, temp: Math.round(j.current.temperature_2m), cloud: j.current.cloud_cover, city: net.city || '',
          rise: j.daily && ms(j.daily.sunrise[0]), set: j.daily && ms(j.daily.sunset[0]), offset: j.utc_offset_seconds };
        Sky.at = Date.now();
        try { localStorage.setItem('rc-wx', JSON.stringify({ wx: Sky.wx, at: Sky.at })); } catch (e) {}
      }
    }
  } catch (e) { /* no weather: the sky still follows the clock */ }
  Sky.loading = false;
  if (visible('home')) renderSky();
}
// sunrise and sunset for today (from the weather, else 6:15 and 18:15)
function sunTimes(now) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const wx = Sky.wx;
  const tod = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };   // the time of day only
  const rise = d0.getTime() + (wx && wx.rise ? tod(wx.rise) : 6 * 60 + 15) * 60e3;
  const set = d0.getTime() + (wx && wx.set ? tod(wx.set) : 18 * 60 + 15) * 60e3;
  return { rise, set };
}
// where are we in the day: 'night' | 'dawn' | 'day' | 'dusk', and how far the sun or moon has travelled (0 → 1)
function skyPhase(now) {
  const { rise, set } = sunTimes(now), H = 3600e3;
  if (now >= rise && now <= set) {
    const t = (now - rise) / (set - rise);
    return { phase: now - rise < 0.75 * H ? 'dawn' : set - now < 0.75 * H ? 'dusk' : 'day', sun: t };
  }
  // night: from sunset to the next sunrise (or from yesterday's sunset to today's sunrise)
  const start = now > set ? set : set - 24 * H, end = now > set ? rise + 24 * H : rise;
  return { phase: 'night', moon: (now - start) / (end - start) };
}
const SKY_COLORS = {
  night: ['#0b1537', '#1d2b5c', '#2f3f73'], dawn: ['#4b6fb5', '#f2a7a0', '#ffd8a8'],
  day: ['#4aa3ec', '#8cc8f5', '#d6efff'], dusk: ['#3b4a8f', '#e0788a', '#ffb87a'],
};
const MOUNTAIN_COLORS = { night: ['#22305f', '#18224a', '#101834'], dawn: ['#8b8fbf', '#6a6fa3', '#4c5287'], day: ['#7fb7a8', '#5d9a8a', '#3f7d6d'], dusk: ['#7a5f8f', '#5b4774', '#3f325a'] };
function cloudPath(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 30 Q0 12 18 12 Q22 0 38 2 Q52 -6 64 6 Q82 4 84 20 Q98 22 96 34 Q94 42 82 42 L10 42 Q0 42 0 30z"/></g>`;
}
const rnd = (i, salt) => { const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v); };   // the same 'random' every time
function renderSky() {
  const box = $('sky'), room = $('skyRoom'); if (!box) return;
  const now = Date.now(), P = skyPhase(now), wx = Sky.wx, kind = wxKind(wx && wx.code);
  const gloomy = ['overcast', 'rain', 'drizzle', 'thunder', 'snow', 'fog'].includes(kind);
  const [c1, c2, c3] = SKY_COLORS[P.phase], [m1, m2, m3] = MOUNTAIN_COLORS[P.phase];
  // the sky fills the whole width behind the greeting and ends just under the top of the scene card
  const spark = $('spark'), home = $('home');
  if (spark && home && !home.hidden) {
    const h = spark.getBoundingClientRect().top - box.getBoundingClientRect().top + 36;
    if (h > 120) box.style.setProperty('--sky-h', Math.round(h) + 'px');
  }
  box.className = `sky p-${P.phase} w-${kind}`;
  if (!box.firstElementChild) box.innerHTML = '<div class="sky-bg"></div>';
  const bg = box.firstElementChild, r = bg.getBoundingClientRect();
  const H = SKY_H, W = r.width > 0 && r.height > 0 ? Math.max(320, Math.round(H * r.width / r.height)) : SKY_W;
  const arcY = t => 158 - Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 92;   // low at the edges, high at noon / midnight
  let body = '';
  if (P.phase !== 'night') {
    const x = 40 + (W - 80) * P.sun, y = arcY(P.sun);
    body = `<g class="sky-sun${gloomy ? ' dim' : ''}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="40" class="halo"/><circle r="24" class="core"/></g>`;
  } else {
    const x = W - 40 - (W - 80) * P.moon, y = arcY(P.moon);       // the moon goes right → left
    body = `<g class="sky-moon${gloomy ? ' dim' : ''}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="34" class="halo"/><circle r="19" class="core"/><circle r="19" cx="9" cy="-5" class="bite" fill="${c1}"/></g>`;
  }
  let stars = '';
  const ns = Math.round(W / 30);
  if (P.phase === 'night' && !gloomy) for (let i = 0; i < ns; i++) { const x = (i * 379) % W, y = 8 + (i * 97) % 130; stars += `<circle class="star${i % 4 === 0 ? ' tw' : ''}" cx="${x}" cy="${y}" r="${i % 3 ? 1.1 : 1.7}" style="animation-delay:${(i % 7) * 0.6}s"/>`; }
  const n = Math.max(2, Math.round((kind === 'clear' ? 2 : kind === 'partly' ? 4 : 6) * Math.min(1.6, W / 700)));
  let clouds = '';
  for (let i = 0; i < n; i++) {
    const y = 14 + (i * 31) % 90, s = 0.75 + ((i * 37) % 10) / 12, dur = 80 + (i * 23) % 70, delay = -((i * 41) % dur);
    clouds += `<g class="cloud" style="animation-duration:${dur}s;animation-delay:${delay}s">${cloudPath(0, y, s)}</g>`;
  }
  let fx = '';
  if (kind === 'rain' || kind === 'drizzle' || kind === 'thunder') {
    const k = Math.round((kind === 'drizzle' ? 26 : 60) * W / 1000) + 10;
    for (let i = 0; i < k; i++) { const x = Math.round(rnd(i, 1) * W); fx += `<line class="drop" x1="${x}" y1="-20" x2="${x - 6}" y2="0" style="animation-delay:${(-rnd(i, 2)).toFixed(2)}s;animation-duration:${(0.7 + rnd(i, 3) * 0.35).toFixed(2)}s"/>`; }
  }
  if (kind === 'snow') { const k = Math.round(40 * W / 1000) + 10; for (let i = 0; i < k; i++) { const d = 5 + rnd(i, 3) * 4; fx += `<circle class="flake" cx="${Math.round(rnd(i, 1) * W)}" cy="-6" r="${(1.5 + rnd(i, 4) * 2).toFixed(1)}" style="animation-delay:${(-rnd(i, 2) * d).toFixed(2)}s;animation-duration:${d.toFixed(1)}s"/>`; } }
  const fog = kind === 'fog' ? `<rect class="fog f1" x="-200" y="120" width="${W + 400}" height="40" rx="20"/><rect class="fog f2" x="-200" y="158" width="${W + 400}" height="36" rx="18"/>` : '';
  const sx = (W / 1000).toFixed(3);
  bg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="--sw:${W}px" aria-hidden="true">
      <defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".6" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#skyg)"/>
      ${gloomy ? `<rect width="${W}" height="${H}" class="gloom"/>` : ''}
      ${stars}${body}<g class="clouds">${clouds}</g>
      <g transform="translate(0 34) scale(${sx} .85)">
        <path fill="${m1}" d="M0 150 L90 105 L170 140 L270 80 L380 135 L470 95 L560 140 L660 70 L760 130 L860 90 L1000 140 L1000 260 L0 260z"/>
        <path class="snowcap" d="M270 80 L250 92 L262 90 L272 98 L282 90 L292 92z M660 70 L640 84 L652 82 L662 90 L672 82 L684 86z"/>
        <path fill="${m2}" d="M0 175 L120 130 L230 170 L340 120 L450 165 L560 125 L690 170 L800 128 L920 165 L1000 145 L1000 260 L0 260z"/>
        <path fill="${m3}" d="M0 200 Q160 170 320 195 T640 192 T1000 190 L1000 260 L0 260z"/>
      </g>
      ${fog}<g class="weather">${fx}</g>
      ${kind === 'thunder' ? `<rect class="flash" width="${W}" height="${H}"/>` : ''}
    </svg>`;
  if (room) {
    const icon = P.phase === 'night' && (kind === 'clear' || kind === 'partly') ? (kind === 'clear' ? '🌙' : '☁️') : WX_ICON[kind];
    room.innerHTML = wx ? `<span class="sky-label">${icon} ${wx.temp}°${wx.city ? ` · ${esc(wx.city)}` : ''} · ${WX_TEXT[kind]}</span>` : '';
  }
  box.setAttribute('aria-label', `${P.phase === 'night' ? 'Night sky' : 'Daytime sky'}${wx ? `, ${WX_TEXT[kind]}, ${wx.temp} degrees` : ''}`);
}
function startSky() {
  renderSky(); loadWeather();
  clearInterval(Sky.timer);
  Sky.timer = setInterval(() => { if (visible('home') && !document.hidden) { renderSky(); loadWeather(); } }, 60e3);
}
let skyResize = 0;
window.addEventListener('resize', () => { clearTimeout(skyResize); skyResize = setTimeout(() => { if (visible('home')) renderSky(); }, 150); });
