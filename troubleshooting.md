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

## Vercel 250MB Function Size Limit

If your deployment to Vercel fails with the error "Serverless Function has exceeded the unzipped maximum size of 250 MB", follow these steps:

1. **Check Next.js Configuration**: Ensure `outputFileTracing` is properly configured in `next.config.ts` to exclude unnecessary files from being bundled with serverless functions.

```js
// next.config.ts
outputFileTracing: true,
outputFileTracingExcludes: {
  "*": [
    // Exclude test files and documentation
    "**/*.test.*",
    "**/*.spec.*",
    "**/tests/**",
    "**/docs/**",
    // Exclude development files
    "**/.git/**",
    "**/.vscode/**",
    // Exclude large packages not needed on the server
    "**/node_modules/@huggingface/transformers/**",
    "**/node_modules/three/**",
  ]
},
```

2. **Optimize Dynamic Imports**: Look for repeated dynamic imports in server code and optimize them to be called once per function rather than inside loops.

3. **Review Large Services**: Look for large service files and consider splitting them into smaller, more focused services.

4. **Check Dependencies**: Review package.json to identify and eliminate unused or oversized dependencies.

5. **Use vercel.json**: Configure excludeFiles in vercel.json to exclude unnecessary files from function deployment:

```json
{
  "functions": {
    "src/app/api/**/*": {
      "excludeFiles": "{.next,*.cache,node_modules/prettier/**,node_modules/@types/**}/**"
    }
  }
}
```

For more details, see [Vercel's official guide](https://vercel.com/guides/troubleshooting-function-250mb-limit).
