import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

interface AuthenticationCardProps extends ComponentPropsWithoutRef<typeof Card> {
	children: ReactNode;
	className?: string;
}

export function AuthenticationCard({ children, className, ...props }: AuthenticationCardProps) {
	return (
		<Card className={cn("overflow-hidden", className)} {...props}>
			{children}
		</Card>
	);
}
