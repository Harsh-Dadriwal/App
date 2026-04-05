import { AppFrame } from "@/components/app-frame";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame role="customer" title="Customer workspace">{children}</AppFrame>;
}
