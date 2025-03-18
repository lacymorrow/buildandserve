Error: Mismatching "lexical" dependency versions found: lexical@0.20.2 (Please change this to 0.20.0), @lexical/list@0.22.0 (Please change this to 0.20.0). All "lexical" packages must have the same version. This is an error with your set-up, not a bug in Payload. Please go to your package.json and ensure all "lexical" packages have the same version

## Solution

Verify that any `@lexical/...` and `lexical dependencies are using the version noted.

Also, remove the carets `^` from the packages in your `package.json` file.

```json
"@lexical/list": "0.20.0",
"lexical": "0.20.0"
```

## Backward Compatibility with React/Vite

Force Client Side Rendering

```tsx
'use client';
import dynamic from "next/dynamic";
const ReactApp = dynamic(() => import('./App'), { ssr: false });

export default function Page() {
 return <ReactApp />;
}
```

# Missing Required HTML Tag

The following tags are missing in the Root Layout: <html>, <body>.
Read more at <https://nextjs.org/docs/messages/missing-root-layout-tags>

## Solution

Make sure all of your pages are in the `src/app/(app)` directory.
