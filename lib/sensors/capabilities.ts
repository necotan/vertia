export interface DriveCapabilities {
  secureContext: boolean;
  geolocation: boolean;
  deviceMotion: boolean;
  motionPermissionRequired: boolean;
  wakeLock: boolean;
}

type DeviceMotionEventConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function detectDriveCapabilities(): DriveCapabilities {
  const hasMotion = typeof window !== "undefined" && "DeviceMotionEvent" in window;
  return {
    secureContext: window.isSecureContext,
    geolocation: "geolocation" in navigator,
    deviceMotion: hasMotion,
    motionPermissionRequired:
      hasMotion && typeof (DeviceMotionEvent as DeviceMotionEventConstructor).requestPermission === "function",
    wakeLock: "wakeLock" in navigator,
  };
}

// API の有無による静的な判定（デスクトップ Chrome は DeviceMotionEvent を持つが値が届かないため、最終判定は走行画面でのセンサー値の受信確認（waitForMotionData）で行う）
export function isDriveSupported(capabilities: DriveCapabilities): boolean {
  return capabilities.secureContext && capabilities.geolocation && capabilities.deviceMotion;
}
