# Shadcn UI Minimal Setup

This is a minimal setup for using Shadcn UI components. It contains just enough files and configuration to make the Shadcn CLI work properly.

## Usage

To install Shadcn UI components, use:

```bash
# Navigate to this directory
cd shadcn-minimal

# Install dependencies
pnpm install
# or
npm install
# or
yarn install

# Use Shadcn CLI to add components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
# etc.
```

## What's Included

- Minimal Next.js 14 setup
- Tailwind CSS configuration
- Required Shadcn UI utilities
- TypeScript configuration with path aliases
- CSS variables for theming

## Structure

```
shadcn-minimal/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── ui/  # Shadcn components will be installed here
│   ├── lib/
│   │   └── utils.ts  # Required utilities for Shadcn
│   └── styles/
│       └── globals.css  # CSS with Tailwind directives and variables
├── components.json  # Shadcn configuration
├── next.config.mjs
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Further Resources

- [Shadcn UI Documentation](https://ui.shadcn.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
