// 記録詳細で選んだ写真をシェアカード画面へ渡す
// File は URL に載せられず、画面遷移はクライアント内で行うためモジュールに保持する
let pending: { sessionId: string; file: File } | null = null;

export function setPendingShareImage(sessionId: string, file: File): void {
  pending = { sessionId, file };
}

/** React の開発モードでは effect が2回実行されるため、取り出しても消さない */
export function getPendingShareImage(sessionId: string): File | null {
  return pending?.sessionId === sessionId ? pending.file : null;
}
