export type WakeLockStatus = "idle" | "active" | "unsupported" | "failed";

// 画面スリープ防止（バックグラウンドから戻ると自動解除されるため再取得する）
export class WakeLockKeeper {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private status: WakeLockStatus = "idle";

  constructor(private readonly onStatusChange: (status: WakeLockStatus) => void) {}

  async enable(): Promise<void> {
    this.wanted = true;
    if (!("wakeLock" in navigator)) {
      this.setStatus("unsupported");
      return;
    }
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    await this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel && !sentinel.released) {
      await sentinel.release().catch(() => undefined);
    }
    this.setStatus("idle");
  }

  private async acquire(): Promise<void> {
    if (!this.wanted || document.visibilityState !== "visible") return;
    if (this.sentinel && !this.sentinel.released) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      this.sentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (this.sentinel === sentinel) this.sentinel = null;
        if (this.wanted && document.visibilityState === "visible") this.setStatus("failed");
      });
      this.setStatus("active");
    } catch {
      this.setStatus("failed");
    }
  }

  private readonly handleVisibilityChange = () => {
    if (document.visibilityState === "visible") void this.acquire();
  };

  private setStatus(status: WakeLockStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange(status);
  }
}
