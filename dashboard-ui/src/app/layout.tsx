import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CT LK Futevôlei - Dashboard",
  description: "Sistema de Gestão CT LK Futevôlei",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
