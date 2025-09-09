"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Default loading component
const DefaultSkeleton = () => (
  <div className="w-full h-[400px] flex items-center justify-center">
    <Skeleton className="w-full h-full" />
  </div>
);

// Chart Components
export const Charts01 = dynamic(
  () => import("@/components/blocks/charts-01").then((m) => m.default || m),
  {
    ssr: false,
    loading: () => <DefaultSkeleton />,
  }
);

export const ChartLine = dynamic(
  () => import("@/components/blocks/chart-line").then((m) => m.ChartLine),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const ChartArea = dynamic(
  () => import("@/components/blocks/chart-area").then((m) => m.ChartArea),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const ChartPie = dynamic(
  () => import("@/components/blocks/chart-pie").then((m) => m.ChartPie),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const ChartBar = dynamic(
  () => import("@/components/blocks/chart-bar").then((m) => m.ChartBar),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);

// Three.js Components
// Globe component path not present; skip export until available
// export const Globe = dynamic(() => import("@/components/ui/globe/globe"), {
//   ssr: false,
//   loading: () => <DefaultSkeleton />,
// });

export const CanvasRevealEffect = dynamic(
  () => import("@/components/ui/canvas-reveal-effect").then((m) => m.CanvasRevealEffect),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);

// Large Dashboard Components
export const Dashboard01 = dynamic(
  () => import("@/components/blocks/dashboard-01").then((m) => m.default || m),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const Dashboard03 = dynamic(
  () => import("@/components/blocks/dashboard-03").then((m) => m.default || m),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const Dashboard05 = dynamic(
  () => import("@/components/blocks/dashboard-05").then((m) => m.default || m),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const Dashboard06 = dynamic(
  () => import("@/components/blocks/dashboard-06").then((m) => m.default || m),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const Dashboard07 = dynamic(
  () => import("@/components/blocks/dashboard-07").then((m) => m.default || m),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);

// Large UI Components
export const DatetimePicker = dynamic(
  () => import("@/components/ui/expansions/datetime-picker").then((m) => m.DateTimePicker),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const MultipleSelector = dynamic(
  () => import("@/components/ui/expansions/multiple-selector").then((m) => m.default || m),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const FileUpload = dynamic(
  () => import("@/components/inputs/file-upload").then((m) => m.default || m),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const SearchAI = dynamic(
  () => import("@/components/search/search-ai").then((m) => m.SearchAi),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);

// Canvas/Animation Components
export const WavyLine = dynamic(
  () => import("@/components/ui/wavy-line").then((m) => m.WavyLine),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const Vortex = dynamic(
  () => import("@/components/ui/vortex").then((m) => m.Vortex),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const ShootingStars = dynamic(
  () => import("@/components/ui/shooting-stars").then((m) => m.ShootingStars),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const Particles = dynamic(
  () => import("@/components/ui/particles").then((m) => m.Particles),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const Confetti = dynamic(
  () => import("@/components/ui/magicui/confetti/confetti").then((m) => m.Confetti),
  { ssr: false, loading: () => <div className="h-[400px] w-full bg-muted animate-pulse rounded-md" /> }
);

// Data Table Components
export const DataTable = dynamic(
  () => import("@/components/ui/data-table/data-table").then((m) => m.DataTable),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);
export const EnhancedLogDataTable = dynamic(
  () => import("@/components/blocks/enhanced-log-datatable").then((m) => m.EnhancedLogDatatable),
  { ssr: false, loading: () => <DefaultSkeleton /> }
);

// Monaco Editor
export const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="h-[400px] w-full bg-muted animate-pulse rounded-md" />,
});

// Export a utility function for custom lazy loading
export function lazyLoad<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }> | Promise<T>,
  options?: { ssr?: boolean; loading?: React.ComponentType }
) {
  return dynamic(importFn as any, {
    ssr: options?.ssr ?? false,
    loading: options?.loading ?? (() => <DefaultSkeleton />),
  } as any);
}