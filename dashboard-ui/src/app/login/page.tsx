import nextDynamic from "next/dynamic";

export const dynamic = "force-dynamic";

const LoginContent = nextDynamic(() => import("@/components/login-content"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
});

export default function LoginPage() {
  return <LoginContent />;
}
