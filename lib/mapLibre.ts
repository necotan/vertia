import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useSyncExternalStore } from "react";

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export async function loadMapLibre(): Promise<typeof import("maplibre-gl")> {
  const maplibre = await import("maplibre-gl");
  // 相対 URL は Worker 側で解決できない
  maplibre.setWorkerUrl(new URL(WORKER_URL, window.location.href).href);
  // Worker を使い回し、2回目以降の地図の生成を速くする
  maplibre.prewarm();
  return maplibre;
}

// OpenFreeMap の dark スタイルが sprite にない画像（wood-pattern）を参照して警告が出るため、透明な画像で埋める
export function fillMissingStyleImages(map: MapLibreMap): void {
  map.setMissingStyleImageResolver((id) => {
    if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
}

const ATTRIBUTION_SHOW_CLASS = "maplibregl-compact-show";
const ATTRIBUTION_ANIMATION_MS = 250;
// 自動で閉じる時刻とタップが重なったり連打されたりしても、アニメーションを二重に始めない
const animatingAttributions = new WeakSet<HTMLElement>();

type AttributionBox = { width: string; height: string; paddingLeft: string; paddingRight: string };

function measureAttribution(element: HTMLElement): AttributionBox {
  const { width, height } = element.getBoundingClientRect();
  const { paddingLeft, paddingRight } = getComputedStyle(element);
  return { width: `${width}px`, height: `${height}px`, paddingLeft, paddingRight };
}

// MapLibre はクラスを付け外しするだけで一瞬で開閉するため、展開と丸ボタンの間を補間する
function toggleAttribution(attribution: HTMLElement, expand: boolean): void {
  if (animatingAttributions.has(attribution)) return;
  // details の既定の開閉を止めているため、MapLibre が開くときに付け直す open をここで付ける
  if (expand) attribution.setAttribute("open", "");
  const inner = attribution.querySelector<HTMLElement>(".maplibregl-ctrl-attrib-inner");
  const button = attribution.querySelector<HTMLElement>(".maplibregl-ctrl-attrib-button");
  if (!inner || !button || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    attribution.classList.toggle(ATTRIBUTION_SHOW_CLASS, expand);
    return;
  }

  attribution.classList.remove(ATTRIBUTION_SHOW_CLASS);
  const collapsed = measureAttribution(attribution);
  const collapsedButtonColor = getComputedStyle(button).backgroundColor;
  // 中身はアニメーション中も表示しておく必要があるため、展開した状態で始める
  attribution.classList.add(ATTRIBUTION_SHOW_CLASS);
  const expanded = measureAttribution(attribution);
  const expandedButtonColor = getComputedStyle(button).backgroundColor;

  // 幅を固定しないと、途中で文字が折り返して高さが変わる
  inner.style.width = `${inner.getBoundingClientRect().width}px`;
  // 測った幅と高さは padding 込みのため
  attribution.style.boxSizing = "border-box";
  attribution.style.overflow = "hidden";

  animatingAttributions.add(attribution);
  // 閉じる向きのキーフレームを開くときは逆再生する
  const options = {
    duration: ATTRIBUTION_ANIMATION_MS,
    easing: "ease-in-out",
    fill: "forwards",
    direction: expand ? "reverse" : "normal",
  } as const;
  const animations = [
    attribution.animate([expanded, collapsed], options),
    inner.animate([{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], options),
    button.animate([{ backgroundColor: expandedButtonColor }, { backgroundColor: collapsedButtonColor }], options),
  ];
  animations[0].onfinish = () => {
    attribution.classList.toggle(ATTRIBUTION_SHOW_CLASS, expand);
    for (const animation of animations) animation.cancel();
    inner.style.removeProperty("width");
    attribution.style.removeProperty("box-sizing");
    attribution.style.removeProperty("overflow");
    animatingAttributions.delete(attribution);
  };
}

export function collapseAttribution(container: HTMLElement): void {
  const attribution = container.querySelector<HTMLElement>(`.maplibregl-ctrl-attrib.${ATTRIBUTION_SHOW_CLASS}`);
  if (attribution) toggleAttribution(attribution, false);
}

// 開閉ボタンのタップを横取りし、開くときも閉じるときもアニメーションさせる
export function interceptAttributionTap(container: HTMLElement): () => void {
  const handleClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const attribution = event.target.closest(".maplibregl-ctrl-attrib-button")?.parentElement;
    if (!attribution?.classList.contains("maplibregl-compact")) return;
    // 祖先のキャプチャで止めないと、ボタンに付いた MapLibre のリスナーと details の開閉が先に動く
    event.preventDefault();
    event.stopPropagation();
    toggleAttribution(attribution, !attribution.classList.contains(ATTRIBUTION_SHOW_CLASS));
  };
  container.addEventListener("click", handleClick, true);
  return () => container.removeEventListener("click", handleClick, true);
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

// Safari は画面上部のぼかしをページの背景色で色づけるため
export function useMapPageBackground(color: string | null): void {
  useEffect(() => {
    if (color === null) return;
    const targets = [document.documentElement, document.body];
    const previous = targets.map((element) => element.style.backgroundColor);
    for (const element of targets) element.style.backgroundColor = color;
    return () => {
      targets.forEach((element, index) => {
        element.style.backgroundColor = previous[index];
      });
    };
  }, [color]);
}
