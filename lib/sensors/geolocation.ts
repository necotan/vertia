export interface GeoFix {
  t: number;
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  speed: number | null;
  heading: number | null;
}

export type GeoErrorKind = "denied" | "unavailable" | "timeout";

function toErrorKind(error: GeolocationPositionError): GeoErrorKind {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

export function watchGeolocation(
  onFix: (fix: GeoFix) => void,
  onError: (kind: GeoErrorKind) => void,
): () => void {
  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const c = position.coords;
      onFix({
        t: position.timestamp,
        lat: c.latitude,
        lng: c.longitude,
        accuracy: c.accuracy,
        altitude: c.altitude,
        altitudeAccuracy: c.altitudeAccuracy,
        // 端末によっては負値や NaN を返すため無効値として扱う
        speed: c.speed !== null && Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : null,
        heading: c.heading !== null && Number.isFinite(c.heading) ? c.heading : null,
      });
    },
    (error) => onError(toErrorKind(error)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
