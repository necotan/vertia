import { useEffect } from "react";

// iOS 26 の Safari は画面上部のぼかしを body の background-color の値で色づけるため、モーダル表示中は暗くした背景と同じ色を指定する
// 見た目は background-image で元のページ背景色を重ね、オーバーレイの backdrop-brightness で1回だけ暗くなるようにする
// brightness はオーバーレイの backdrop-brightness と同じ値を渡す
export function useDimmedPageBackground(active: boolean, brightness: number): void {
  useEffect(() => {
    if (!active) return;
    const { style } = document.body;
    const previousColor = style.backgroundColor;
    const previousImage = style.backgroundImage;
    style.backgroundColor = `color-mix(in srgb, var(--background) ${brightness}%, black)`;
    style.backgroundImage = "linear-gradient(var(--background), var(--background))";
    return () => {
      style.backgroundColor = previousColor;
      style.backgroundImage = previousImage;
    };
  }, [active, brightness]);
}
