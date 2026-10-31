// This document is constant. Coordinates are delivered through the bridge, never srcDoc/source.
// Keeping one MapLibre vector instance preserves zoom, layers and marker animation on both platforms.
export const TRACKING_MAP_HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css">
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#f1f5f9;font-family:system-ui,sans-serif;overflow:hidden}
.pin{display:flex;align-items:center;justify-content:center;border:3px solid white;border-radius:50%;font-size:23px;box-shadow:0 3px 10px rgba(0,0,0,0.25);width:40px;height:40px}
.home{background:#ef4444}.rider{background:#00b14f}
.rider.live:after{content:'';position:absolute;inset:-3px;border:3px solid #00b14f;border-radius:50%;animation:radar 1.8s infinite;pointer-events:none}
@keyframes radar{from{transform:scale(1);opacity:.8}to{transform:scale(1.8);opacity:0}}
@media(prefers-reduced-motion:reduce){.rider.live:after{animation:none}}
.goong-attribution{position:absolute;top:10px;right:10px;background:rgba(255,255,255,0.88);padding:1px 6px;border-radius:4px;font-size:9px;color:#374151;font-family:system-ui,sans-serif;z-index:900;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.goong-attribution a{color:#0284c7;text-decoration:none;font-weight:700}
#info{position:absolute;bottom:10px;left:10px;right:56px;z-index:900;background:#111827e8;color:white;border-radius:10px;padding:6px 10px;font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px}
#recenter{position:absolute;bottom:10px;right:10px;z-index:900;background:white;border:0;border-radius:10px;width:38px;height:38px;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;display:flex;align-items:center;justify-content:center}
#error-card{display:none;position:absolute;inset:0;background:#f8fafc;z-index:950;flex-direction:column;align-items:center;justify-content:center;padding:16px;text-align:center;color:#64748b;font-size:12px;gap:8px}
.map-retry-btn{background:#16a34a;color:#ffffff;border:none;padding:6px 14px;border-radius:8px;font-weight:700;font-size:12px;cursor:pointer}
</style></head><body>
<div id="map"></div>
<div class="goong-attribution">© <a href="https://goong.io" target="_blank" rel="noopener">Goong Maps</a></div>
<div id="info" role="status">Đang tải bản đồ…</div>
<div id="error-card"><span id="error-msg">Không tải được bản đồ Goong.</span><button class="map-retry-btn" onclick="window.location.reload()">Thử lại</button></div>
<button id="recenter" aria-label="Xem toàn bộ hành trình">🎯</button>
<script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
<script>
(function(){
  var info = document.getElementById('info');
  var errorCard = document.getElementById('error-card');
  var errorMsg = document.getElementById('error-msg');
  function notify(data){
    data.channel = 'greenhouse-tracking';
    if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
    else window.parent.postMessage(data, '*');
  }
  if(!window.maplibregl){
    info.textContent = 'Không tải được thư viện bản đồ';
    errorCard.style.display = 'flex';
    return;
  }

  var goongMapKey = '${process.env.EXPO_PUBLIC_GOONG_MAP_KEY || ''}';
  if(!goongMapKey){
    info.textContent = 'Chưa cấu hình khoá bản đồ Goong';
    errorMsg.textContent = 'Chưa cấu hình EXPO_PUBLIC_GOONG_MAP_KEY.';
    errorCard.style.display = 'flex';
    return;
  }

  var map;
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.goong.io/assets/goong_map_web.json?api_key=' + encodeURIComponent(goongMapKey),
      center: [107.5, 16.0],
      zoom: 12,
      attributionControl: false
    });
  } catch(e) {
    info.textContent = 'Lỗi khởi tạo bản đồ Goong';
    errorCard.style.display = 'flex';
    return;
  }

  // Khắc phục cảnh báo thiếu icon sprite (mountain-11, mountain-15) trong style Goong
  map.on('styleimagemissing', function(e){
    var id = e.id;
    if(!map.hasImage(id)){
      var canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 16, 16);
      map.addImage(id, ctx.getImageData(0, 0, 16, 16));
    }
  });

  map.on('error', function(e){
    console.warn('[Goong Tracking Map] Lỗi:', e);
  });

  var mapLoaded = false;
  var pendingRouteGeoJson = null;

  map.on('load', function(){
    mapLoaded = true;
    map.addSource('route', {
      type: 'geojson',
      data: pendingRouteGeoJson || { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
    });
    map.addLayer({
      id: 'route-border',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#00823a', 'line-width': 8 }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#00b14f', 'line-width': 5 }
    });
    notify({type: 'ready'});
  });

  var customerMarker = null, helperMarker = null, dest = null, state = null, route = null;
  var point = null, frame = 0, version = 0, controller = null, lastFetch = 0, lastMetrics = '';
  var lastDrawAt = 0, initGpsTime = Date.now();
  var lastRouteOrigin = null, routeFails = 0, retryAfter = 0, lastMovedAt = 0, SNAP_MAX = 120;

  function valid(p){
    return p && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 &&
      Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
  }

  function distance(a, b){
    var rad = Math.PI / 180, dlat = (b.lat - a.lat) * rad, dlng = (b.lng - a.lng) * rad;
    var h = Math.sin(dlat / 2)**2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }

  function metrics(value){
    var key = JSON.stringify(value);
    if(key !== lastMetrics){
      lastMetrics = key;
      notify({type: 'metrics', value: value});
    }
  }

  function setRouteGeoJson(coords){
    var geojson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords }
    };
    if(mapLoaded && map.getSource('route')){
      map.getSource('route').setData(geojson);
    } else {
      pendingRouteGeoJson = geojson;
    }
  }

  function clearRoute(){
    setRouteGeoJson([]);
    route = null;
    metrics(null);
  }

  function invalidateRoute(){
    version++;
    if(controller) controller.abort();
    controller = null;
    clearRoute();
    lastFetch = 0;
    lastRouteOrigin = null;
    routeFails = 0;
    retryAfter = 0;
  }

  function createPinElement(kind){
    var el = document.createElement('div');
    el.className = 'pin ' + kind;
    el.innerHTML = kind === 'home' ? '🏠' : '🛵';
    return el;
  }

  function fit(){
    if(!dest) return;
    if(helperMarker){
      var hPos = helperMarker.getLngLat();
      var minLng = Math.min(dest.lng, hPos.lng);
      var maxLng = Math.max(dest.lng, hPos.lng);
      var minLat = Math.min(dest.lat, hPos.lat);
      var maxLat = Math.max(dest.lat, hPos.lat);
      if(minLng === maxLng && minLat === maxLat){
        map.flyTo({ center: [dest.lng, dest.lat], zoom: 16 });
      } else {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
          padding: { top: 48, bottom: 48, left: 48, right: 48 },
          maxZoom: 16
        });
      }
    } else {
      map.flyTo({ center: [dest.lng, dest.lat], zoom: 16 });
    }
  }
  document.getElementById('recenter').onclick = fit;

  function project(p){
    if(!route) return null;
    var best = null, cos = Math.cos(p.lat * Math.PI / 180);
    for(var i = 0; i < route.points.length - 1; i++){
      var a = route.points[i], b = route.points[i + 1];
      var dx = (b.lng - a.lng) * cos, dy = b.lat - a.lat;
      var t = Math.max(0, Math.min(1, ((p.lng - a.lng) * cos * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy || 1)));
      var q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      var gap = distance(p, q);
      if(!best || gap < best.gap){
        best = { point: q, gap: gap, index: i, along: route.lengths[i] + distance(a, q) };
      }
    }
    return best;
  }

  function alongPath(path, t){
    var total = 0, lengths = [0];
    for(var i = 1; i < path.length; i++){
      total += distance(path[i - 1], path[i]);
      lengths.push(total);
    }
    var target = total * t;
    for(var j = 1; j < path.length; j++){
      if(lengths[j] >= target){
        var f = (target - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1);
        return {
          lat: path[j - 1].lat + (path[j].lat - path[j - 1].lat) * f,
          lng: path[j - 1].lng + (path[j].lng - path[j - 1].lng) * f
        };
      }
    }
    return path[path.length - 1];
  }

  function move(p, prev, force){
    if(!force && p.recorded_at && lastMovedAt === p.recorded_at && helperMarker) return;
    var snap = project(p), target = snap && snap.gap <= SNAP_MAX ? snap.point : p;
    if(!helperMarker){
      var el = createPinElement('rider');
      helperMarker = new maplibregl.Marker({ element: el }).setLngLat([target.lng, target.lat]).addTo(map);
      fit();
      lastMovedAt = p.recorded_at || 0;
      return;
    }
    cancelAnimationFrame(frame);
    var fromLngLat = helperMarker.getLngLat();
    var from = { lat: fromLngLat.lat, lng: fromLngLat.lng };
    var path = [from, target], old = project(from);
    if(snap && old && snap.gap <= SNAP_MAX && old.gap <= SNAP_MAX && snap.along >= old.along && snap.along - old.along < 500){
      path = [from].concat(route.points.slice(old.index + 1, snap.index + 1), [target]);
    }
    var cadence = prev && p.recorded_at && prev.recorded_at ? p.recorded_at - prev.recorded_at : 0;
    var now = performance.now(), duration = Math.min(5000, Math.max(800, cadence || (now - lastDrawAt) || 2000));
    lastDrawAt = now;
    lastMovedAt = p.recorded_at || lastMovedAt;
    if(distance(from, target) > 500 || window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      helperMarker.setLngLat([target.lng, target.lat]);
      return;
    }
    function step(time){
      var t = Math.min(1, (time - now) / duration);
      var currentPos = alongPath(path, t);
      helperMarker.setLngLat([currentPos.lng, currentPos.lat]);
      if(t < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
  }

  function remaining(){
    if(!point || !route) return;
    var snap = project(point);
    if(!snap || snap.gap > SNAP_MAX){
      metrics(null);
      info.textContent = 'Đang tính lại tuyến đường…';
      return;
    }
    var left = Math.max(0, route.total - snap.along);
    var km = route.distance * (left / (route.total || 1)) / 1000;
    var mins = Math.max(1, Math.ceil(route.duration * (left / (route.total || 1)) / 60));
    metrics({ distanceKm: Math.round(km * 100) / 100, etaMinutes: mins });
    info.textContent = 'Còn ' + km.toFixed(1) + ' km · khoảng ' + mins + ' phút (ước tính)';

    var restPoints = [snap.point].concat(route.points.slice(snap.index + 1));
    var restCoords = restPoints.map(function(pt){ return [pt.lng, pt.lat]; });
    setRouteGeoJson(restCoords);
  }

  function maybeRoute(p){
    var now = Date.now();
    if(now < retryAfter) return;
    if(!route){
      if(!lastFetch || now - lastFetch >= 5000) routeRequest();
      return;
    }
    var snap = project(p);
    if(snap && snap.gap > 60){
      if(now - lastFetch >= 8000) routeRequest();
      return;
    }
    if(lastRouteOrigin && distance(lastRouteOrigin, p) > 150 && now - lastFetch >= 60000){
      routeRequest();
    }
  }

  function decodePolyline(str){
    var index = 0, lat = 0, lng = 0, coordinates = [];
    var shift, result, byte;
    while(index < str.length){
      shift = 0; result = 0;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while(byte >= 0x20);
      lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
      shift = 0; result = 0;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while(byte >= 0x20);
      lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
      coordinates.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
    }
    return coordinates;
  }

  function routeRequest(){
    if(!point || !dest) return;
    var requestVersion = ++version;
    var origin = { lat: point.lat, lng: point.lng };
    var destination = { lat: dest.lat, lng: dest.lng };
    if(controller) controller.abort();
    controller = new AbortController();
    var requestController = controller;
    var timeout = setTimeout(function(){ requestController.abort(); }, 10000);
    lastFetch = Date.now();

    var goongApiKey = (state && state.goongApiKey) || '${process.env.EXPO_PUBLIC_GOONG_API_KEY || ''}';
    if(!goongApiKey){
      routeFails++;
      info.textContent = 'Chưa cấu hình API chỉ đường Goong';
      return;
    }

    var fetchUrl = 'https://rsapi.goong.io/Direction?origin=' + origin.lat + ',' + origin.lng +
      '&destination=' + destination.lat + ',' + destination.lng +
      '&vehicle=bike&api_key=' + encodeURIComponent(goongApiKey);

    fetch(fetchUrl, { signal: requestController.signal })
      .then(function(res){
        if(!res.ok) throw Error('route failed: ' + res.status);
        return res.json();
      })
      .then(function(data){
        if(requestVersion !== version) return;
        var pts = [], dist = 0, dur = 0;
        if(data.routes && data.routes[0] && data.routes[0].overview_polyline){
          pts = decodePolyline(data.routes[0].overview_polyline.points);
          var leg = data.routes[0].legs && data.routes[0].legs[0];
          dist = leg && leg.distance ? leg.distance.value : 0;
          dur = leg && leg.duration ? leg.duration.value : 0;
        } else {
          throw Error('no overview_polyline');
        }
        if(!pts.length || !pts.every(valid)) throw Error('invalid points');

        var lengths = [0];
        for(var i = 1; i < pts.length; i++){
          lengths.push(lengths[i - 1] + distance(pts[i - 1], pts[i]));
        }

        var geojsonCoords = pts.map(function(pt){ return [pt.lng, pt.lat]; });
        setRouteGeoJson(geojsonCoords);

        route = { points: pts, lengths: lengths, total: lengths[lengths.length - 1], distance: dist, duration: dur };
        lastRouteOrigin = origin;
        routeFails = 0;
        retryAfter = 0;
        if(point){
          move(point, null, true);
          refresh();
        }
      })
      .catch(function(err){
        if(requestVersion !== version) return;
        routeFails++;
        retryAfter = Date.now() + Math.min(60000, 5000 * Math.pow(2, Math.min(4, routeFails - 1)));
        if(!route) info.textContent = 'Chưa tính được đường đi';
      })
      .finally(function(){
        clearTimeout(timeout);
      });
  }

  function refresh(){
    if(!dest){ info.textContent = 'Chưa có tọa độ điểm hẹn'; metrics(null); return; }
    if(!state.tracking){ info.textContent = 'Điểm hẹn làm việc'; metrics(null); return; }
    if(!point){
      if(state && state.gpsError){
        info.innerHTML = '<span style="color:#fca5a5;">Chưa lấy được GPS: ' + (state.gpsErrorReason || 'Lỗi thiết bị') + '</span> <button onclick="window.retryGps && window.retryGps()" style="background:#22c55e;color:#fff;border:none;padding:2px 8px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;margin-left:6px;">Thử lại</button>';
      } else {
        var waitSec = Math.floor((Date.now() - initGpsTime) / 1000);
        if(waitSec > 10){
          info.innerHTML = '<span style="color:#fde047;">Chưa nhận được tín hiệu GPS thật</span> <button onclick="window.retryGps && window.retryGps()" style="background:#22c55e;color:#fff;border:none;padding:2px 8px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;margin-left:6px;">Thử lại</button>';
        } else {
          info.textContent = 'Đang chờ GPS (' + (10 - waitSec) + 's)…';
        }
      }
      metrics(null);
      return;
    }
    var age = Date.now() - point.recorded_at;
    if(helperMarker && helperMarker.getElement()){
      helperMarker.getElement().classList.toggle('live', age <= 30000);
    }
    if(age > 120000){
      point = null;
      cancelAnimationFrame(frame);
      if(helperMarker){ helperMarker.remove(); helperMarker = null; }
      invalidateRoute();
      info.textContent = 'Mất kết nối GPS';
      return;
    }
    if(age > 30000){
      cancelAnimationFrame(frame);
      metrics(null);
      info.textContent = 'GPS chưa cập nhật';
      return;
    }
    if(route) remaining();
    else {
      metrics(null);
      info.textContent = lastFetch ? 'Chưa tính được đường đi' : 'Đang tính tuyến đường…';
    }
  }

  window.applyTrackingState = function(next){
    if(!next || next.channel !== 'greenhouse-tracking' || next.type !== 'state') return;
    var incoming = valid(next.customer) ? next.customer : null;
    var changed = (!dest) !== (!incoming) || (dest && incoming && (dest.lat !== incoming.lat || dest.lng !== incoming.lng));
    if(changed){
      invalidateRoute();
      dest = incoming;
      if(customerMarker){ customerMarker.remove(); customerMarker = null; }
      if(dest){
        var el = createPinElement('home');
        customerMarker = new maplibregl.Marker({ element: el }).setLngLat([dest.lng, dest.lat]).addTo(map);
        fit();
      }
    }
    state = next;
    var p = next.helper;
    if(!next.tracking || !dest || !valid(p) || !Number.isFinite(p.recorded_at) || Date.now() - p.recorded_at > 120000 || p.recorded_at > Date.now() + 10000){
      point = null;
      cancelAnimationFrame(frame);
      if(helperMarker){ helperMarker.remove(); helperMarker = null; }
      invalidateRoute();
      refresh();
      return;
    }
    if(!point || p.recorded_at > point.recorded_at || changed){
      var prevPoint = point;
      point = p;
      move(p, prevPoint, changed);
      maybeRoute(p);
    }
    refresh();
  };

  window.retryGps = function(){
    initGpsTime = Date.now();
    info.textContent = 'Đang thử kết nối lại GPS…';
    notify({type: 'retry_gps'});
  };

  window.addEventListener('message', function(event){
    if(event.source !== window.parent) return;
    window.applyTrackingState(event.data);
  });
  window.addEventListener('resize', function(){
    if(map) map.resize();
  });
  setInterval(refresh, 1000);
  if(mapLoaded) notify({type: 'ready'});
})();
</script></body></html>`;
