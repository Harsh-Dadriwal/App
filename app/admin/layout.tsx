import { AppFrame } from "@/components/app-frame";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame role="admin" title="Admin workspace">{children}</AppFrame>;
}
