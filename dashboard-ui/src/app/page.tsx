import nextDynamic from "next/dynamic";

export const dynamic = "force-dynamic";

// Dynamic import to avoid SSR issues with navigation hooks
const DashboardContent = nextDynamic(() => import("@/components/dashboard-content"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  return <DashboardContent />;
}
