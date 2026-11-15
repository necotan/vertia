import { Suspense } from "react";
import { ShareCardScreen } from "@/components/sessions/ShareCardScreen";

// 記録の ID をクエリで受け取り、全記録で 1 つの静的なページを使用する
export default function ShareCardPage() {
  return (
    <Suspense>
      <ShareCardScreen />
    </Suspense>
  );
}
