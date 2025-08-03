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
  () => import("@/components/blocks/charts-01"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const ChartLine = dynamic(
  () => import("@/components/blocks/chart-line"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const ChartArea = dynamic(
  () => import("@/components/blocks/chart-area"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const ChartPie = dynamic(
  () => import("@/components/blocks/chart-pie"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const ChartBar = dynamic(
  () => import("@/components/blocks/chart-bar"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

// Three.js Components
export const Globe = dynamic(
  () => import("@/components/ui/globe/globe"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const CanvasRevealEffect = dynamic(
  () => import("@/components/ui/canvas-reveal-effect"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

// Large Dashboard Components
export const Dashboard01 = dynamic(
  () => import("@/components/blocks/dashboard-01"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const Dashboard03 = dynamic(
  () => import("@/components/blocks/dashboard-03"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const Dashboard05 = dynamic(
  () => import("@/components/blocks/dashboard-05"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const Dashboard06 = dynamic(
  () => import("@/components/blocks/dashboard-06"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const Dashboard07 = dynamic(
  () => import("@/components/blocks/dashboard-07"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

// Large UI Components
export const DatetimePicker = dynamic(
  () => import("@/components/ui/expansions/datetime-picker"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const MultipleSelector = dynamic(
  () => import("@/components/ui/expansions/multiple-selector"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const FileUpload = dynamic(
  () => import("@/components/inputs/file-upload"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const SearchAI = dynamic(
  () => import("@/components/search/search-ai"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

// Canvas/Animation Components
export const WavyLine = dynamic(
  () => import("@/components/ui/wavy-line"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const Vortex = dynamic(
  () => import("@/components/ui/vortex"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const ShootingStars = dynamic(
  () => import("@/components/ui/shooting-stars"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const Particles = dynamic(
  () => import("@/components/ui/particles"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const Confetti = dynamic(
  () => import("@/components/ui/magicui/confetti/confetti"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

// Data Table Components
export const DataTable = dynamic(
  () => import("@/components/ui/data-table/data-table"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

export const EnhancedLogDataTable = dynamic(
  () => import("@/components/blocks/enhanced-log-datatable"),
  { 
    ssr: false,
    loading: () => <DefaultSkeleton />
  }
);

// Monaco Editor
export const MonacoEditor = dynamic(
  () => import("@monaco-editor/react"),
  { 
    ssr: false,
    loading: () => <div className="h-[400px] w-full bg-muted animate-pulse rounded-md" />
  }
);

// Export a utility function for custom lazy loading
export function lazyLoad<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options?: {
    ssr?: boolean;
    loading?: React.ComponentType;
  }
) {
  return dynamic(importFn, {
    ssr: options?.ssr ?? false,
    loading: options?.loading ?? (() => <DefaultSkeleton />),
  });
}