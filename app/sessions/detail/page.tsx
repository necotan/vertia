import { Suspense } from "react";
import { SessionDetailScreen } from "@/components/sessions/SessionDetailScreen";

// 記録の ID をクエリで受け取り、全記録で 1 つの静的なページを使用する）
export default function SessionDetailPage() {
  return (
    <Suspense>
      <SessionDetailScreen />
    </Suspense>
  );
}
