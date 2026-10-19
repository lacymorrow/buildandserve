import { Icon } from "@/components/assets/icon";
import { siteConfig } from "@/config/site-config";

/**
 * Shown instead of the auth card when no sign-in control would render.
 *
 * A heading over a hole reads as a broken page, so a deployment with nothing
 * configured says so. Both `/sign-in` and `/sign-up` share this so the two
 * pages cannot drift into different empty states.
 */
export const AuthUnavailable = () => (
  <div className="flex w-full max-w-sm flex-col gap-6">
    <div className="flex items-center gap-2 self-center font-medium">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Icon />
      </div>
      {siteConfig.title}
    </div>
    <div className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
      <span aria-hidden="true">&gt;</span>
      <span>Login and sign-up are not available at this time.</span>
    </div>
  </div>
);
