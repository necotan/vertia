import type { SessionWeather } from "@/lib/db/schema";
import { haversineMeters } from "@/lib/geo";
import { fetchCurrentWeather } from "./openMeteo";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const REFRESH_DISTANCE_M = 10_000;
const RETRY_INTERVAL_MS = 60 * 1000;

// GPS の測位ごとに呼ばれ、必要なときだけ天気を取りに行く
export class WeatherWatcher {
  private latest: SessionWeather | null = null;
  private nextFetchAt = 0;
  private controller: AbortController | null = null;
  private disposed = false;

  constructor(private readonly onUpdate: (weather: SessionWeather) => void) {}

  get current(): SessionWeather | null {
    return this.latest;
  }

  update(lat: number, lng: number): void {
    if (this.disposed || this.controller || !navigator.onLine) return;
    const moved =
      this.latest !== null && haversineMeters(this.latest.lat, this.latest.lng, lat, lng) >= REFRESH_DISTANCE_M;
    if (Date.now() < this.nextFetchAt && !moved) return;
    void this.run(lat, lng);
  }

  dispose(): void {
    this.disposed = true;
    this.controller?.abort();
    this.controller = null;
    this.latest = null;
  }

  private async run(lat: number, lng: number): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const weather = await fetchCurrentWeather(lat, lng, controller.signal);
    if (this.controller === controller) this.controller = null;
    if (this.disposed) return;

    if (weather) {
      this.latest = weather;
      this.nextFetchAt = Date.now() + REFRESH_INTERVAL_MS;
      this.onUpdate(weather);
    } else {
      this.nextFetchAt = Date.now() + RETRY_INTERVAL_MS;
    }
  }
}
