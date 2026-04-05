import { AppFrame } from "@/components/app-frame";

export default function ArchitectLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame role="architect" title="Architect workspace">{children}</AppFrame>;
}
