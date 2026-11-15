export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // click 直後に解放するとダウンロードが始まらないブラウザがあるため、少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
