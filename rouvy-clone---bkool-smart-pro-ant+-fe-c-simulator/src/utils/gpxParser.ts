import { GpxPoint, RouteData } from '../types/cycling';

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371.0; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180.0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

/**
 * Parses GPX XML text into structured RouteData with smoothed elevations and instant slopes
 */
export function parseGpxXml(xmlText: string, routeName = 'Ruta Personalizada'): RouteData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  // Check parsing errors
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('El archivo no es un GPX XML válido: ' + parseError.textContent?.slice(0, 100));
  }

  // Extract track name if present
  const nameEl = xmlDoc.querySelector('trk > name') || xmlDoc.querySelector('metadata > name');
  const actualName = nameEl?.textContent?.trim() || routeName;

  // Extract all <trkpt> points (or <rtept> fallback)
  let ptNodes = Array.from(xmlDoc.querySelectorAll('trkpt'));
  if (ptNodes.length === 0) {
    ptNodes = Array.from(xmlDoc.querySelectorAll('rtept'));
  }

  if (ptNodes.length === 0) {
    throw new Error('El archivo GPX no contiene puntos de track (<trkpt> o <rtept>).');
  }

  const rawPts: { lat: number; lon: number; elevation: number; time?: string }[] = [];

  for (const node of ptNodes) {
    const lat = parseFloat(node.getAttribute('lat') || '0');
    const lon = parseFloat(node.getAttribute('lon') || '0');
    const eleNode = node.querySelector('ele');
    const elevation = eleNode ? parseFloat(eleNode.textContent || '0') : 0;
    const timeNode = node.querySelector('time');
    const time = timeNode?.textContent || undefined;

    if (!isNaN(lat) && !isNaN(lon)) {
      rawPts.push({ lat, lon, elevation: isNaN(elevation) ? 0 : elevation, time });
    }
  }

  if (rawPts.length === 0) {
    throw new Error('No se encontraron coordenadas válidas en el track GPX.');
  }

  // Compute cumulative distances and smoothed slopes
  const points: GpxPoint[] = [];
  let cumDist = 0.0;
  let totalAscent = 0.0;
  let maxSlope = 0.0;

  for (let i = 0; i < rawPts.length; i++) {
    if (i > 0) {
      const d = haversineKm(
        rawPts[i - 1].lat,
        rawPts[i - 1].lon,
        rawPts[i].lat,
        rawPts[i].lon
      );
      cumDist += d;

      const dEle = rawPts[i].elevation - rawPts[i - 1].elevation;
      if (dEle > 0) {
        totalAscent += dEle;
      }
    }

    // Moving window slope smoothing (up to 3 points forward and back, ~50m-100m window)
    const win = Math.min(3, Math.min(i, rawPts.length - 1 - i));
    let slope = 0.0;

    if (win > 0) {
      const pPrev = rawPts[i - win];
      const pNext = rawPts[i + win];
      const dWinKm = haversineKm(pPrev.lat, pPrev.lon, pNext.lat, pNext.lon);
      if (dWinKm > 0.005) {
        // at least 5 meters to prevent division by near-zero GPS noise
        const dEleM = pNext.elevation - pPrev.elevation;
        slope = (dEleM / (dWinKm * 1000.0)) * 100.0;
        // Clamp to realistic cycling grades (-25% to +25%)
        slope = Math.max(-25.0, Math.min(25.0, slope));
      }
    }

    if (slope > maxSlope) {
      maxSlope = slope;
    }

    points.push({
      distanceKm: Math.round(cumDist * 10000) / 10000,
      elevationM: Math.round(rawPts[i].elevation * 10) / 10,
      slopePct: Math.round(slope * 10) / 10,
      lat: rawPts[i].lat,
      lon: rawPts[i].lon,
      time: rawPts[i].time,
    });
  }

  const totalDistanceKm = points[points.length - 1]?.distanceKm || 0;

  return {
    id: `route-${Date.now()}`,
    name: actualName,
    totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
    totalElevationGainM: Math.round(totalAscent),
    maxSlopePct: Math.round(maxSlope * 10) / 10,
    points,
  };
}

/**
 * Fast binary search interpolation to find elevation, slope, and position at a given distance
 */
export function interpolateRoutePoint(points: GpxPoint[], distanceKm: number): {
  elevationM: number;
  slopePct: number;
  lat: number;
  lon: number;
  progressPct: number;
  remainingKm: number;
} {
  if (!points || points.length === 0) {
    return { elevationM: 0, slopePct: 0, lat: 0, lon: 0, progressPct: 0, remainingKm: 0 };
  }

  const totalDist = points[points.length - 1].distanceKm;
  const clampedDist = Math.max(0, Math.min(totalDist, distanceKm));
  const progressPct = totalDist > 0 ? (clampedDist / totalDist) * 100 : 0;
  const remainingKm = Math.max(0, totalDist - clampedDist);

  let low = 0;
  let high = points.length - 1;
  let idx = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].distanceKm <= clampedDist) {
      idx = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const p1 = points[idx];
  const p2 = points[Math.min(idx + 1, points.length - 1)];

  if (p2.distanceKm > p1.distanceKm) {
    const t = (clampedDist - p1.distanceKm) / (p2.distanceKm - p1.distanceKm);
    const ele = p1.elevationM + t * (p2.elevationM - p1.elevationM);
    const slope = p1.slopePct + t * (p2.slopePct - p1.slopePct);
    const lat = p1.lat + t * (p2.lat - p1.lat);
    const lon = p1.lon + t * (p2.lon - p1.lon);
    return {
      elevationM: Math.round(ele * 10) / 10,
      slopePct: Math.round(slope * 10) / 10,
      lat,
      lon,
      progressPct: Math.round(progressPct * 10) / 10,
      remainingKm: Math.round(remainingKm * 100) / 100,
    };
  }

  return {
    elevationM: p1.elevationM,
    slopePct: p1.slopePct,
    lat: p1.lat,
    lon: p1.lon,
    progressPct: Math.round(progressPct * 10) / 10,
    remainingKm: Math.round(remainingKm * 100) / 100,
  };
}
