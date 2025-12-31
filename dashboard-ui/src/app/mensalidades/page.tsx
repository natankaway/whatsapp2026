import nextDynamic from "next/dynamic";

export const dynamic = "force-dynamic";

const MensalidadesContent = nextDynamic(
  () => import("@/components/mensalidades-content"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    ),
  }
);

export default function MensalidadesPage() {
  return <MensalidadesContent />;
}
