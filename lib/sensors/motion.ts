export interface MotionSample {
  t: number;
  ax: number;
  ay: number;
  az: number;
  lax: number | null;
  lay: number | null;
  laz: number | null;
  ra: number | null;
  rb: number | null;
  rg: number | null;
}

export type MotionPermissionResult = "granted" | "denied" | "unsupported";

type DeviceMotionEventConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

// iOS はユーザー操作の同期処理内で requestPermission を呼ぶ必要があるため、タップハンドラの先頭で他の await より前に呼び出すこと
export function requestMotionPermission(): Promise<MotionPermissionResult> {
  if (typeof DeviceMotionEvent === "undefined") return Promise.resolve("unsupported");
  const ctor = DeviceMotionEvent as DeviceMotionEventConstructor;
  if (typeof ctor.requestPermission !== "function") return Promise.resolve("granted");
  return ctor
    .requestPermission()
    .then((result): MotionPermissionResult => (result === "granted" ? "granted" : "denied"))
    .catch((): MotionPermissionResult => "denied");
}

function toSample(event: DeviceMotionEvent): MotionSample | null {
  const g = event.accelerationIncludingGravity;
  if (!g || g.x === null || g.y === null || g.z === null) return null;
  const a = event.acceleration;
  const r = event.rotationRate;
  return {
    t: performance.timeOrigin + event.timeStamp,
    ax: g.x,
    ay: g.y,
    az: g.z,
    lax: a?.x ?? null,
    lay: a?.y ?? null,
    laz: a?.z ?? null,
    ra: r?.alpha ?? null,
    rb: r?.beta ?? null,
    rg: r?.gamma ?? null,
  };
}

export function subscribeMotion(onSample: (sample: MotionSample) => void): () => void {
  const handler = (event: DeviceMotionEvent) => {
    const sample = toSample(event);
    if (sample) onSample(sample);
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

// 値の入ったイベントが実際に届くかを確認する
export function waitForMotionData(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let unsubscribe: () => void = () => {};
    const timer = window.setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    unsubscribe = subscribeMotion(() => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}
