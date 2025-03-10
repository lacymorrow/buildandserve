# Admin Checking in Shipkit

This document outlines the recommended approach for checking if a user is an admin in the Shipkit application.

## Core Implementation

The core admin checking logic is implemented in `src/config/admin-config.ts`. This file:

- Defines the `AdminConfig` interface
- Provides the `adminConfig` object with the admin emails and domains
- Implements the `isAdmin` function that checks if an email belongs to an admin

This file should only be imported by server components or server actions for security reasons.

## Server-Side Implementation

### Services for Server Components

The admin service is implemented in `src/server/services/admin-service.ts`. This service:

- Provides functions for checking admin status directly from server components
- Includes functions for getting admin emails and domains
- Should be used by server components for data fetching

### Server Actions for Client Components

The server actions for admin checking are implemented in `src/server/actions/admin-actions.ts`. These actions:

- Wrap the core admin checking logic
- Provide a secure way to check admin status from client components
- Should be used by client components via hooks

## Recommended Approaches

### 1. For Client Components: Using the useIsAdmin Hook

The `useIsAdmin` hook in `src/hooks/use-is-admin.tsx` provides a way to check admin status in client components:

```tsx
import { useIsAdmin } from "@/hooks/use-is-admin";

// In your component:
const { isAdmin, isLoading } = useIsAdmin(session?.user?.email);

if (isLoading) {
  return <LoadingSpinner />;
}

if (!isAdmin) {
  return <AccessDenied />;
}

return <AdminDashboard />;
```

For simple UI conditionals:

```tsx
const { isAdmin } = useIsAdmin(session?.user?.email);

return isAdmin ? <AdminFeature /> : null;
```

### 2. For Server Components: Using the Admin Service

For server components, use the admin service directly:

```tsx
import { isAdmin } from "@/server/services/admin-service";
import { auth } from "@/server/auth";

// In your server component:
const session = await auth();
const userIsAdmin = session?.user?.email 
  ? isAdmin(session.user.email)
  : false;

if (!userIsAdmin) {
  redirect("/home");
}
```

## Deprecated Approach

The `siteConfig.admin.isAdmin()` function in `src/config/site.ts` is a client-side stub and should not be used. It will log a warning if called.

## Security Considerations

- Always perform admin checks on the server side when making important decisions
- Client-side admin checks should only be used for UI purposes (showing/hiding elements)
- Any sensitive operations should be protected by server-side admin checks
