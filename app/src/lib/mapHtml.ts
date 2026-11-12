/**
 * The page the Today map draws in a WebView: Leaflet with OpenStreetMap
 * tiles (no Google key). The app sends the pins with `setData(...)` and the
 * page answers taps with a message, so it never reloads as addresses come
 * in. Leaflet and the tiles come over the internet; with no signal the page
 * says so and the list under the map still works.
 */

export type PinKind = 'next' | 'stop' | 'done' | 'owed' | 'quote';

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  /** "1", "$" or "Q". */
  label: string;
  kind: PinKind;
  /** Placed by ZIP only: drawn dashed. */
  approx?: boolean;
}

export interface MapData {
  pins: MapPin[];
  /** The day's stops in order, for the line between them. */
  route: [number, number][];
  /** Move the view to show every pin (only when the set of pins changes). */
  fit: boolean;
  /** The pin to ring. */
  selected?: string;
}

/** What the page sends back. */
export type MapMessage = { type: 'ready' } | { type: 'offline' } | { type: 'pick'; id: string };

export function parseMapMessage(raw: string): MapMessage | null {
  try {
    const m = JSON.parse(raw) as { type?: unknown; id?: unknown };
    if (m.type === 'ready' || m.type === 'offline') return { type: m.type };
    if (m.type === 'pick' && typeof m.id === 'string') return { type: 'pick', id: m.id };
  } catch {
    // Not ours.
  }
  return null;
}

/** The line the app runs in the page to update it. JSON is valid JavaScript, so the data can't break out. */
export function setDataScript(d: MapData): string {
  return `window.setData && window.setData(${JSON.stringify(d)}); true;`;
}

export const LEAFLET_VERSION = '1.9.4';

export function mapHtml(brand: string): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css">
<style>
html,body,#map{margin:0;height:100%;background:#E9EDE6;font-family:system-ui,sans-serif}
.pin{display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:900;box-sizing:border-box;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.pin.next{background:${brand};color:#fff;font-size:18px}
.pin.stop{background:#0B0B0B;color:#fff;font-size:16px}
.pin.done{background:#E3E3E3;color:#0B0B0B;font-size:16px;border-color:#0B0B0B}
.pin.owed{background:#FFD000;color:#0B0B0B;font-size:15px;border-color:#0B0B0B}
.pin.quote{background:#fff;color:#0B0B0B;font-size:15px;border-color:#0B0B0B}
.pin.approx{border-style:dashed;opacity:.8}
.pin.sel{outline:4px solid #FFD000;outline-offset:2px}
#off{display:none;position:absolute;inset:0;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:18px;font-weight:800;color:#0B0B0B}
</style>
</head><body>
<div id="map"></div>
<div id="off">The map needs internet. The stops are listed below it.</div>
<script src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"></script>
<script>
(function(){
  function send(m){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  if (!window.L) { document.getElementById('off').style.display='flex'; send({type:'offline'}); return; }
  var map = L.map('map', { zoomControl: false }).setView([39.5, -98.35], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  function icon(p, sel){
    var big = p.kind === 'next' ? 44 : p.kind === 'owed' || p.kind === 'quote' ? 34 : 40;
    var el = document.createElement('div');
    el.className = 'pin ' + p.kind + (p.approx ? ' approx' : '') + (sel ? ' sel' : '');
    el.style.width = big + 'px'; el.style.height = big + 'px';
    el.textContent = p.label;
    return L.divIcon({ html: el.outerHTML, className: '', iconSize: [big, big], iconAnchor: [big/2, big/2] });
  }
  window.setData = function(d){
    layer.clearLayers();
    if (d.route && d.route.length > 1) L.polyline(d.route, { color: '${brand}', weight: 6, opacity: 0.9 }).addTo(layer);
    var pts = [];
    (d.pins || []).forEach(function(p){
      var m = L.marker([p.lat, p.lon], { icon: icon(p, p.id === d.selected), zIndexOffset: p.kind === 'next' ? 1000 : p.kind === 'stop' ? 500 : 0, keyboard: false });
      m.on('click', function(){ send({ type: 'pick', id: p.id }); });
      m.addTo(layer); pts.push([p.lat, p.lon]);
    });
    if (d.fit && pts.length === 1) map.setView(pts[0], 14);
    else if (d.fit && pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 15 });
  };
  send({ type: 'ready' });
})();
</script>
</body></html>`;
}
