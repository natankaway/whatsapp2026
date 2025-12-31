"use client";

import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function MensalidadesPage() {
  return (
    <DashboardLayout title="Mensalidades">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Controle de Mensalidades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Página de mensalidades em desenvolvimento...
          </p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
