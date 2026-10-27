import { RouteData, TelemetrySample } from '../types/cycling';

export interface ActivitySummary {
  name: string;
  startTime: Date;
  totalTimeSeconds: number;
  totalDistanceKm: number;
  avgWatts: number;
  maxWatts: number;
  avgHr: number;
  maxHr: number;
  avgCadence: number;
  avgSpeedKmh: number;
  totalElevationGainM: number;
  caloriesKcal: number;
}

/**
 * Builds a valid Garmin Training Center XML (.TCX) file.
 * Compatible with Garmin Connect, Strava, TrainingPeaks, and Rouvy.
 * Includes official Garmin ActivityExtension/v2 schemas for Watts and Speed.
 */
export function generateTcx(
  route: RouteData,
  samples: TelemetrySample[],
  summary: ActivitySummary
): string {
  const startTimeIso = summary.startTime.toISOString();
  const totalMeters = Math.round(summary.totalDistanceKm * 1000);

  let trackpointsXml = '';

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const ptTime = new Date(summary.startTime.getTime() + s.timeSec * 1000).toISOString();
    const distMeters = Math.round(s.distanceKm * 1000);

    // Find closest route point for GPS position & altitude
    const ptIndex = Math.min(
      route.points.length - 1,
      Math.max(
        0,
        Math.floor((s.distanceKm / Math.max(0.01, route.totalDistanceKm)) * (route.points.length - 1))
      )
    );
    const rPoint = route.points[ptIndex] || { lat: 0, lon: 0, elevationM: 0 };
    const speedMs = (s.speedKmh / 3.6).toFixed(2);

    trackpointsXml += `
        <Trackpoint>
          <Time>${ptTime}</Time>
          ${
            rPoint.lat !== 0 || rPoint.lon !== 0
              ? `<Position>
            <LatitudeDegrees>${rPoint.lat.toFixed(6)}</LatitudeDegrees>
            <LongitudeDegrees>${rPoint.lon.toFixed(6)}</LongitudeDegrees>
          </Position>`
              : ''
          }
          <AltitudeMeters>${rPoint.elevationM.toFixed(1)}</AltitudeMeters>
          <DistanceMeters>${distMeters}</DistanceMeters>
          ${
            s.heartRateBpm > 0
              ? `<HeartRateBpm>
            <Value>${Math.round(s.heartRateBpm)}</Value>
          </HeartRateBpm>`
              : ''
          }
          ${s.cadenceRpm > 0 ? `<Cadence>${Math.round(s.cadenceRpm)}</Cadence>` : ''}
          <Extensions>
            <TPX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
              <Speed>${speedMs}</Speed>
              <Watts>${Math.max(0, Math.round(s.powerWatts))}</Watts>
            </TPX>
          </Extensions>
        </Trackpoint>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startTimeIso}</Id>
      <Lap StartTime="${startTimeIso}">
        <TotalTimeSeconds>${Math.round(summary.totalTimeSeconds)}</TotalTimeSeconds>
        <DistanceMeters>${totalMeters}</DistanceMeters>
        <MaximumSpeed>${(summary.avgSpeedKmh * 1.5 / 3.6).toFixed(2)}</MaximumSpeed>
        <Calories>${summary.caloriesKcal}</Calories>
        ${
          summary.avgHr > 0
            ? `<AverageHeartRateBpm><Value>${Math.round(summary.avgHr)}</Value></AverageHeartRateBpm>`
            : ''
        }
        ${
          summary.maxHr > 0
            ? `<MaximumHeartRateBpm><Value>${Math.round(summary.maxHr)}</Value></MaximumHeartRateBpm>`
            : ''
        }
        <Intensity>Active</Intensity>
        ${summary.avgCadence > 0 ? `<Cadence>${Math.round(summary.avgCadence)}</Cadence>` : ''}
        <TriggerMethod>Manual</TriggerMethod>
        <Track>${trackpointsXml}
        </Track>
        <Extensions>
          <LX xmlns="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
            <AvgSpeed>${(summary.avgSpeedKmh / 3.6).toFixed(2)}</AvgSpeed>
            <AvgWatts>${Math.round(summary.avgWatts)}</AvgWatts>
            <MaxWatts>${Math.round(summary.maxWatts)}</MaxWatts>
          </LX>
        </Extensions>
      </Lap>
      <Creator xsi:type="Device_t">
        <Name>Bkool Smart Pro Simulator</Name>
        <UnitId>38947291</UnitId>
        <ProductID>17</ProductID>
        <Version>
          <VersionMajor>2</VersionMajor>
          <VersionMinor>0</VersionMinor>
        </Version>
      </Creator>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;
}

/**
 * Builds a standard GPX 1.1 file with Garmin TrackPointExtension (hr, cad, power)
 */
export function generateGpx(
  route: RouteData,
  samples: TelemetrySample[],
  summary: ActivitySummary
): string {
  const startTimeIso = summary.startTime.toISOString();

  let trkptsXml = '';

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const ptTime = new Date(summary.startTime.getTime() + s.timeSec * 1000).toISOString();
    const ptIndex = Math.min(
      route.points.length - 1,
      Math.max(
        0,
        Math.floor((s.distanceKm / Math.max(0.01, route.totalDistanceKm)) * (route.points.length - 1))
      )
    );
    const rPoint = route.points[ptIndex] || { lat: 0, lon: 0, elevationM: 0 };

    trkptsXml += `
      <trkpt lat="${rPoint.lat.toFixed(6)}" lon="${rPoint.lon.toFixed(6)}">
        <ele>${rPoint.elevationM.toFixed(1)}</ele>
        <time>${ptTime}</time>
        <extensions>
          <power>${Math.round(s.powerWatts)}</power>
          <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
            ${s.heartRateBpm > 0 ? `<gpxtpx:hr>${Math.round(s.heartRateBpm)}</gpxtpx:hr>` : ''}
            ${s.cadenceRpm > 0 ? `<gpxtpx:cad>${Math.round(s.cadenceRpm)}</gpxtpx:cad>` : ''}
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Rouvy Bkool Simulator"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${summary.name}</name>
    <time>${startTimeIso}</time>
  </metadata>
  <trk>
    <name>${summary.name}</name>
    <type>cycling</type>
    <trkseg>${trkptsXml}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Initiates direct browser download of generated activity file (.tcx or .gpx)
 */
export function downloadFile(content: string, filename: string, mimeType = 'application/xml') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Opens Garmin Connect web import portal in new window
 */
export function openGarminConnectImport() {
  window.open('https://connect.garmin.com/modern/import-data', '_blank');
}
