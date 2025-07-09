// --- グローバル変数 ---
let map;
let positionMarker;
let lopLayerGroup = L.layerGroup();
let fixLayerGroup = L.layerGroup();

// --- 便利な関数 ---
function toRad(degrees) { return degrees * Math.PI / 180; }
function toDeg(radians) { return radians * 180 / Math.PI; }

/** 地図を初期化する関数 */
function initializeMap() {
  map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  lopLayerGroup.addTo(map);
  fixLayerGroup.addTo(map);
}

/** (AP)マーカーを立てる関数 */
function updatePositionMarker(lat, lon) {
  if (!map) return;
  if (positionMarker) {
    map.removeLayer(positionMarker);
  }
  positionMarker = L.marker([lat, lon]).addTo(map);
  positionMarker.bindPopup("Assumed Position (AP)").openPopup();
  map.setView([lat, lon], 7);
}

/** ある地点から特定の方位と距離にある地点の座標を計算する */
function getDestinationPoint(lat, lon, bearing, distanceNm) {
    const R = 6371 / 1.852;
    const latRad = toRad(lat);
    const lonRad = toRad(lon);
    const bearingRad = toRad(bearing);
    const distRad = distanceNm / R;
    const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(distRad) +
                                Math.cos(latRad) * Math.sin(distRad) * Math.cos(bearingRad));
    const newLonRad = lonRad + Math.atan2(Math.sin(bearingRad) * Math.sin(distRad) * Math.cos(latRad),
                                          Math.cos(distRad) - Math.sin(latRad) * Math.sin(newLatRad));
    return [toDeg(newLatRad), toDeg(newLonRad)];
}

/**
 * 2本の線の交点を計算する関数（修正版）
 */
function findIntersection(p1, p2, p3, p4) {
    const x1 = p1[1], y1 = p1[0];
    const x2 = p2[1], y2 = p2[0];
    const x3 = p3[1], y3 = p3[0];
    const x4 = p4[1], y4 = p4[0];

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return null; // 平行な場合は交点なし

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    
    // ↓ 線分上にあるかどうかのチェックを削除し、無限直線上の交点を計算する
    const intersectX = x1 + t * (x2 - x1);
    const intersectY = y1 + t * (y2 - y1);
    return [intersectY, intersectX];
}


/** 位置の線(LOP)を描画する */
function drawLOP(apLat, apLon, azimuth, interceptNm, lopData) {
  if (!map) return;
  const bearing = interceptNm > 0 ? azimuth : (azimuth + 180) % 360;
  const distance = Math.abs(interceptNm);
  const [ipLat, ipLon] = getDestinationPoint(apLat, apLon, bearing, distance);
  const lopBearing1 = (azimuth - 90 + 360) % 360;
  const lopBearing2 = (azimuth + 90) % 360;
  const lopPoint1 = getDestinationPoint(ipLat, ipLon, lopBearing1, 100);
  const lopPoint2 = getDestinationPoint(ipLat, ipLon, lopBearing2, 100);

  L.polyline([lopPoint1, lopPoint2], { color: 'red', weight: 3 }).addTo(lopLayerGroup);
  L.polyline([[apLat, apLon], [ipLat, ipLon]], { color: 'blue', dashArray: '5, 10' }).addTo(lopLayerGroup);
  L.circleMarker([apLat, apLon], { radius: 3, color: 'blue' }).addTo(lopLayerGroup);

  lopData.p1 = lopPoint1;
  lopData.p2 = lopPoint2;
}

/** 交点(Fix)を描画する */
function drawFix(lat, lon) {
    if (!map) return;
    fixLayerGroup.clearLayers();
    const starIcon = L.divIcon({className: 'fix-marker', html: '★', iconSize: [20, 20]});
    L.marker([lat, lon], {icon: starIcon}).addTo(fixLayerGroup);
}

/** 全ての描画をリセットする */
function resetMap() {
    lopLayerGroup.clearLayers();
    fixLayerGroup.clearLayers();
    if(positionMarker) map.removeLayer(positionMarker);
}

// ページの読み込みが完了したら地図を初期化
document.addEventListener('DOMContentLoaded', initializeMap);