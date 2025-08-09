# Lazy Loading Components

This directory contains lazy-loaded versions of heavy components to improve initial page load performance.

## Usage

Instead of importing components directly, use the lazy-loaded versions:

```tsx
// ❌ Don't do this - loads entire recharts library
import Charts01 from "@/components/blocks/charts-01";

// ✅ Do this - loads component only when needed
import { Charts01 } from "@/components/lazy";
```

## Available Components

### Chart Components
- `Charts01` - Main charts showcase
- `ChartLine` - Line chart component
- `ChartArea` - Area chart component
- `ChartPie` - Pie chart component
- `ChartBar` - Bar chart component

### 3D/WebGL Components
- `Globe` - Three.js globe component
- `CanvasRevealEffect` - Canvas-based reveal effect

### Dashboard Components
- `Dashboard01` through `Dashboard07` - Large dashboard layouts

### UI Components
- `DatetimePicker` - Complex datetime picker
- `MultipleSelector` - Multi-select component
- `FileUpload` - File upload with preview
- `SearchAI` - AI-powered search

### Animation Components
- `WavyLine` - Animated wavy line
- `Vortex` - Vortex animation
- `ShootingStars` - Shooting stars effect
- `Particles` - Particle system
- `Confetti` - Confetti animation

### Data Components
- `DataTable` - Complex data table
- `EnhancedLogDataTable` - Enhanced logging table
- `MonacoEditor` - Monaco code editor

## Custom Lazy Loading

Use the `lazyLoad` utility for custom components:

```tsx
import { lazyLoad } from "@/components/lazy";

const MyHeavyComponent = lazyLoad(
  () => import("@/components/my-heavy-component"),
  {
    ssr: false,
    loading: () => <div>Loading...</div>
  }
);
```

## Performance Impact

- Reduces initial bundle size by ~500KB+
- Improves LCP (Largest Contentful Paint) scores
- Components load on-demand when scrolled into view
- Better Core Web Vitals scores