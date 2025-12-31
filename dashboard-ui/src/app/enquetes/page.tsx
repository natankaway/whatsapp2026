"use client";

import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function EnquetesPage() {
  return (
    <DashboardLayout title="Enquetes">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Enquetes Automáticas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Página de enquetes em desenvolvimento...
          </p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
