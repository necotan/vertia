export function sessionDetailHref(sessionId: string): string {
  return `/sessions/detail?id=${encodeURIComponent(sessionId)}`;
}
