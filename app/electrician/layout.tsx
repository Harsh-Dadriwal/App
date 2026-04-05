import { AppFrame } from "@/components/app-frame";

export default function ElectricianLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame role="electrician" title="Electrician workspace">{children}</AppFrame>;
}
