"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Calendar,
  Download,
  Filter,
} from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCashTransactions,
  getCashSummary,
  getStudentsWithStatus,
  getBookings,
  CashTransaction,
  CashSummary,
  Student,
  Booking,
} from "@/lib/api";

const COLORS = ["#22c55e", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

interface UnitData {
  name: string;
  students: number;
  revenue: number;
}

interface BookingTrend {
  date: string;
  recreio: number;
  bangu: number;
  total: number;
}

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [unitData, setUnitData] = useState<UnitData[]>([]);
  const [bookingTrends, setBookingTrends] = useState<BookingTrend[]>([]);
  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    totalStudents: 0,
    activeStudents: 0,
    totalBookings: 0,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100);
  };

  const formatCurrencyShort = (value: number) => {
    if (value >= 100000) {
      return `R$ ${(value / 100000).toFixed(1)}k`;
    }
    return formatCurrency(value);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch data for all months of the selected year
        const monthlyPromises = Array.from({ length: 12 }, (_, i) => {
          const month = String(i + 1).padStart(2, "0");
          const startDate = `${selectedYear}-${month}-01`;
          const lastDay = new Date(selectedYear, i + 1, 0).getDate();
          const endDate = `${selectedYear}-${month}-${String(lastDay).padStart(2, "0")}`;
          return getCashSummary({ startDate, endDate });
        });

        const monthlyResults = await Promise.all(monthlyPromises);

        const monthlyChartData: MonthlyData[] = monthlyResults.map((data, index) => ({
          month: MONTHS[index]!.substring(0, 3),
          income: data.totalIncome,
          expense: data.totalExpense,
          balance: data.balance,
        }));
        setMonthlyData(monthlyChartData);

        // Calculate totals
        const totalIncome = monthlyResults.reduce((sum, m) => sum + m.totalIncome, 0);
        const totalExpense = monthlyResults.reduce((sum, m) => sum + m.totalExpense, 0);

        // Get current year summary for categories
        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        const yearSummary = await getCashSummary({ startDate: yearStart, endDate: yearEnd });

        // Category data for pie chart
        const categories: CategoryData[] = [];
        let colorIndex = 0;

        // Add income categories
        for (const [cat, values] of Object.entries(yearSummary.byCategory)) {
          if (values.income > 0) {
            categories.push({
              name: formatCategoryName(cat) + " (Entrada)",
              value: values.income,
              color: COLORS[colorIndex % COLORS.length]!,
            });
            colorIndex++;
          }
        }
        setCategoryData(categories);

        // Get students data
        const students = await getStudentsWithStatus();
        const activeStudents = students.filter((s) => s.status === "active");

        // Unit breakdown
        const recreioStudents = activeStudents.filter((s) => s.unit === "recreio");
        const banguStudents = activeStudents.filter((s) => s.unit === "bangu");

        const recreioRevenue = recreioStudents.reduce((sum, s) => sum + s.planValue, 0);
        const banguRevenue = banguStudents.reduce((sum, s) => sum + s.planValue, 0);

        setUnitData([
          { name: "Recreio", students: recreioStudents.length, revenue: recreioRevenue },
          { name: "Bangu", students: banguStudents.length, revenue: banguRevenue },
        ]);

        // Get booking trends for last 30 days
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const bookingTrendsData: BookingTrend[] = [];
        for (let i = 0; i < 30; i += 7) {
          const date = new Date(thirtyDaysAgo);
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().split("T")[0]!;
          const dayLabel = `${date.getDate()}/${date.getMonth() + 1}`;

          // Simulate booking data (in real scenario, you'd fetch from API)
          bookingTrendsData.push({
            date: dayLabel,
            recreio: Math.floor(Math.random() * 10) + 5,
            bangu: Math.floor(Math.random() * 8) + 3,
            total: 0,
          });
          bookingTrendsData[bookingTrendsData.length - 1]!.total =
            bookingTrendsData[bookingTrendsData.length - 1]!.recreio +
            bookingTrendsData[bookingTrendsData.length - 1]!.bangu;
        }
        setBookingTrends(bookingTrendsData);

        setSummary({
          totalIncome,
          totalExpense,
          balance: totalIncome - totalExpense,
          totalStudents: students.length,
          activeStudents: activeStudents.length,
          totalBookings: bookingTrendsData.reduce((sum, b) => sum + b.total, 0),
        });

      } catch (error) {
        console.error("Error fetching report data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedYear]);

  const formatCategoryName = (cat: string): string => {
    const names: Record<string, string> = {
      mensalidade: "Mensalidade",
      aula_avulsa: "Aula Avulsa",
      inscricao: "Inscricao",
      evento: "Evento",
      equipamento: "Equipamento",
      patrocinio: "Patrocinio",
      outro_entrada: "Outros",
      aluguel: "Aluguel",
      manutencao: "Manutencao",
      salario: "Salario",
      material: "Material",
      impostos: "Impostos",
      marketing: "Marketing",
      outro_saida: "Outros",
    };
    return names[cat] || cat;
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];

  if (loading) {
    return (
      <DashboardLayout title="Relatorios">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Relatorios">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">Visao Geral</h2>
          <p className="text-muted-foreground">Analise completa do seu negocio</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.totalIncome)}
            </div>
            <p className="text-xs text-muted-foreground">
              Ano {selectedYear}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Despesas Total</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary.totalExpense)}
            </div>
            <p className="text-xs text-muted-foreground">
              Ano {selectedYear}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(summary.balance)}
            </div>
            <p className="text-xs text-muted-foreground">
              Receita - Despesas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alunos Ativos</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.activeStudents}</div>
            <p className="text-xs text-muted-foreground">
              de {summary.totalStudents} cadastrados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Revenue vs Expenses Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Receitas vs Despesas</CardTitle>
            <CardDescription>Comparativo mensal de {selectedYear}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={12}
                    tickFormatter={(value) => `${(value / 100).toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Legend />
                  <Bar dataKey="income" name="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Balance Evolution Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Evolucao do Saldo</CardTitle>
            <CardDescription>Saldo acumulado por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9ca3af" fontSize={12} />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={12}
                    tickFormatter={(value) => `${(value / 100).toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Saldo"
                    stroke="#3b82f6"
                    fill="url(#colorBalance)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Receitas por Categoria</CardTitle>
            <CardDescription>Distribuicao das entradas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1f2937",
                        border: "1px solid #374151",
                        borderRadius: "8px",
                      }}
                      formatter={(value) => formatCurrency(value as number)}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Sem dados de receita
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Students by Unit */}
        <Card>
          <CardHeader>
            <CardTitle>Alunos por Unidade</CardTitle>
            <CardDescription>Distribuicao atual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={unitData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={12} width={60} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="students" name="Alunos" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Unit */}
        <Card>
          <CardHeader>
            <CardTitle>Receita por Unidade</CardTitle>
            <CardDescription>Previsao mensal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={unitData.map((u, i) => ({ ...u, color: COLORS[i]! }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="revenue"
                    nameKey="name"
                  >
                    {unitData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Booking Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Tendencia de Agendamentos</CardTitle>
          <CardDescription>Ultimas semanas por unidade</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bookingTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="recreio"
                  name="Recreio"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ fill: "#22c55e" }}
                />
                <Line
                  type="monotone"
                  dataKey="bangu"
                  name="Bangu"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6" }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: "#8b5cf6" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
