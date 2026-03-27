import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
// import { ProjectsList } from "@/app/(app)/(dashboard)/projects/_components/projects-list";
import { NavUser } from "@/components/blocks/nav-user";
<<<<<<< HEAD:src/components/blocks/app-sidebar.tsx
import { TeamSwitcher } from "@/components/blocks/team-switcher";
||||||| bac2439d:src/components/modules/sidebar/app-sidebar.tsx
import { TeamSwitcher } from "@/components/blocks/team-switcher";
import { ProjectsList } from "@/components/modules/projects/projects-list";
=======
>>>>>>> upstream/main:src/components/modules/sidebar/app-sidebar.tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar, SidebarContent, SidebarFooter, SidebarRail } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";

const appSidebarVariants = cva("", {
  variants: {
    variant: {
      sidebar: "",
      inset: "bg-muted/50",
      floating: "shadow-lg",
    },
    size: {
      default: "w-64",
      sm: "w-48",
      lg: "w-72",
    },
  },
  defaultVariants: {
    variant: "sidebar",
    size: "default",
  },
});

interface AppSidebarProps
<<<<<<< HEAD:src/components/blocks/app-sidebar.tsx
	extends Omit<React.ComponentProps<typeof Sidebar>, "variant">,
	VariantProps<typeof appSidebarVariants> {
	variant?: "inset" | "floating" | "sidebar";
	size?: "default" | "sm" | "lg";
||||||| bac2439d:src/components/modules/sidebar/app-sidebar.tsx
	extends Omit<React.ComponentProps<typeof Sidebar>, "variant">,
		VariantProps<typeof appSidebarVariants> {
	variant?: "inset" | "floating" | "sidebar";
	size?: "default" | "sm" | "lg";
=======
  extends Omit<React.ComponentProps<typeof Sidebar>, "variant">,
    VariantProps<typeof appSidebarVariants> {
  variant?: "inset" | "floating" | "sidebar";
  size?: "default" | "sm" | "lg";
>>>>>>> upstream/main:src/components/modules/sidebar/app-sidebar.tsx
}

export const AppSidebar = React.forwardRef<HTMLDivElement, AppSidebarProps>(
<<<<<<< HEAD:src/components/blocks/app-sidebar.tsx
	({ className, variant = "sidebar", size = "default", ...props }, ref) => {
		return (
			<>
				<Sidebar
					id="app-sidebar"
					ref={ref}
					variant={variant}
					collapsible="icon"
					className={cn(appSidebarVariants({ variant, size }), className)}
					{...props}
				>
					<SidebarHeader>
						<TeamSwitcher />
					</SidebarHeader>
					<SidebarContent>
						<ScrollArea className="[&>div>div]:!block">
							<NavMain />
							{/* <ProjectsList /> */}
						</ScrollArea>
					</SidebarContent>
					<SidebarFooter className="p-2">
						<NavSecondary />
||||||| bac2439d:src/components/modules/sidebar/app-sidebar.tsx
	({ className, variant = "sidebar", size = "default", ...props }, ref) => {
		const sidebarId = useId();

		return (
			<Sidebar
				id={sidebarId}
				ref={ref}
				variant={variant}
				collapsible="icon"
				className={cn(appSidebarVariants({ variant, size }), "select-none", className)}
				{...props}
			>
				<SidebarHeader>
					<TeamSwitcher />
				</SidebarHeader>
				<SidebarContent>
					<ScrollArea className="[&>div>div]:!block">
						<NavMain />
						<ProjectsList />
					</ScrollArea>
				</SidebarContent>
				<SidebarFooter className="p-2">
					<div>
						<NavSecondary />
=======
  ({ className, variant = "sidebar", size = "default", ...props }, ref) => {
    const sidebarId = useId();

    return (
      <Sidebar
        id={sidebarId}
        ref={ref}
        variant={variant}
        collapsible="icon"
        className={cn(appSidebarVariants({ variant, size }), "select-none", className)}
        {...props}
      >
        <SidebarContent>
          <ScrollArea className="[&>div>div]:!block">
            <NavMain />
          </ScrollArea>
        </SidebarContent>
        <SidebarFooter className="p-2">
          <div>
            <NavSecondary />
>>>>>>> upstream/main:src/components/modules/sidebar/app-sidebar.tsx

            {/*
						<div className="overflow-hidden group-data-[collapsible=icon]:hidden flex flex-col gap-2">
							<SidebarOptInForm />
							<CardUpgrade />
<<<<<<< HEAD:src/components/blocks/app-sidebar.tsx
						</div> */}
						<NavUser />
					</SidebarFooter>
					<SidebarRail />
				</Sidebar>
			</>
		);
	}
||||||| bac2439d:src/components/modules/sidebar/app-sidebar.tsx
							</div> */}
						<NavUser />
					</div>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
		);
	}
=======
							</div> */}
            <NavUser />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    );
  }
>>>>>>> upstream/main:src/components/modules/sidebar/app-sidebar.tsx
);
AppSidebar.displayName = "AppSidebar";
