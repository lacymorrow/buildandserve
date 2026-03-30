"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";

/**
 * Sign-up component stub.
 * TODO: Replace with full sign-up form when needed.
 */
export function SignUp() {
  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <h2 className="text-2xl font-semibold">Create an account</h2>
      <p className="text-muted-foreground text-center">
        Sign up for {siteConfig.title} to get started.
      </p>
      <Button
        className="w-full"
        onClick={() => void signIn(undefined, { callbackUrl: routes.app.dashboard })}
      >
        Sign Up
      </Button>
    </div>
  );
}
