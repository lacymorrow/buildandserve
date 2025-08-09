"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Loading component for charts
const ChartSkeleton = () => (
  <div className="w-full h-[350px] flex items-center justify-center">
    <Skeleton className="w-full h-full" />
  </div>
);

// Lazy load all Recharts components
export const Area = dynamic(
  () => import("recharts").then((mod) => mod.Area),
  { ssr: false }
);

export const AreaChart = dynamic(
  () => import("recharts").then((mod) => mod.AreaChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const Bar = dynamic(
  () => import("recharts").then((mod) => mod.Bar),
  { ssr: false }
);

export const BarChart = dynamic(
  () => import("recharts").then((mod) => mod.BarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false }
);

export const Cell = dynamic(
  () => import("recharts").then((mod) => mod.Cell),
  { ssr: false }
);

export const Label = dynamic(
  () => import("recharts").then((mod) => mod.Label),
  { ssr: false }
);

export const LabelList = dynamic(
  () => import("recharts").then((mod) => mod.LabelList),
  { ssr: false }
);

export const Line = dynamic(
  () => import("recharts").then((mod) => mod.Line),
  { ssr: false }
);

export const LineChart = dynamic(
  () => import("recharts").then((mod) => mod.LineChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const Pie = dynamic(
  () => import("recharts").then((mod) => mod.Pie),
  { ssr: false }
);

export const PieChart = dynamic(
  () => import("recharts").then((mod) => mod.PieChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const PolarAngleAxis = dynamic(
  () => import("recharts").then((mod) => mod.PolarAngleAxis),
  { ssr: false }
);

export const PolarGrid = dynamic(
  () => import("recharts").then((mod) => mod.PolarGrid),
  { ssr: false }
);

export const RadialBar = dynamic(
  () => import("recharts").then((mod) => mod.RadialBar),
  { ssr: false }
);

export const RadialBarChart = dynamic(
  () => import("recharts").then((mod) => mod.RadialBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export const Rectangle = dynamic(
  () => import("recharts").then((mod) => mod.Rectangle),
  { ssr: false }
);

export const ReferenceLine = dynamic(
  () => import("recharts").then((mod) => mod.ReferenceLine),
  { ssr: false }
);

export const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false }
);

export const XAxis = dynamic(
  () => import("recharts").then((mod) => mod.XAxis),
  { ssr: false }
);

export const YAxis = dynamic(
  () => import("recharts").then((mod) => mod.YAxis),
  { ssr: false }
);

export const Tooltip = dynamic(
  () => import("recharts").then((mod) => mod.Tooltip),
  { ssr: false }
);

export const Legend = dynamic(
  () => import("recharts").then((mod) => mod.Legend),
  { ssr: false }
);