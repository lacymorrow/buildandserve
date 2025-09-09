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
export const Area = dynamic(() => import("recharts").then((mod) => mod.Area as any), { ssr: false });
export const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart as any), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
export const Bar = dynamic(() => import("recharts").then((mod) => mod.Bar as any), { ssr: false });
export const BarChart = dynamic(() => import("recharts").then((mod) => mod.BarChart as any), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
export const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid as any),
  { ssr: false }
);
export const Cell = dynamic(() => import("recharts").then((mod) => mod.Cell as any), { ssr: false });
export const Label = dynamic(() => import("recharts").then((mod) => mod.Label as any), { ssr: false });
export const LabelList = dynamic(() => import("recharts").then((mod) => mod.LabelList as any), {
  ssr: false,
});
export const Line = dynamic(() => import("recharts").then((mod) => mod.Line as any), { ssr: false });
export const LineChart = dynamic(() => import("recharts").then((mod) => mod.LineChart as any), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
export const Pie = dynamic(() => import("recharts").then((mod) => mod.Pie as any), { ssr: false });
export const PieChart = dynamic(() => import("recharts").then((mod) => mod.PieChart as any), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
export const PolarAngleAxis = dynamic(
  () => import("recharts").then((mod) => mod.PolarAngleAxis as any),
  { ssr: false }
);
export const PolarGrid = dynamic(() => import("recharts").then((mod) => mod.PolarGrid as any), {
  ssr: false,
});
export const RadialBar = dynamic(() => import("recharts").then((mod) => mod.RadialBar as any), {
  ssr: false,
});
export const RadialBarChart = dynamic(
  () => import("recharts").then((mod) => mod.RadialBarChart as any),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
export const Rectangle = dynamic(
  () => import("recharts").then((mod) => mod.Rectangle as any),
  { ssr: false }
);
export const ReferenceLine = dynamic(
  () => import("recharts").then((mod) => mod.ReferenceLine as any),
  { ssr: false }
);
export const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer as any),
  { ssr: false }
);
export const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis as any), { ssr: false });
export const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis as any), { ssr: false });
export const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip as any), {
  ssr: false,
});
export const Legend = dynamic(() => import("recharts").then((mod) => mod.Legend as any), {
  ssr: false,
});