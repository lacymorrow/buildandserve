import type { User, UserRole } from "@/types/user";
import "next-auth";

declare module "next-auth" {
	interface Session {
		user: User;
	}

	interface JWT extends Omit<User, "email"> {
		email?: string | null;
	}

	// interface User {
	// 	id: string;
	// 	name: string | null;
	// 	email: string;
	// 	emailVerified: Date | null;
	// 	image: string | null;
	// 	role?: UserRole;
	// 	theme?: "light" | "dark" | "system";
	// 	bio?: string | null;
	// 	githubUsername?: string | null;
	// }
}
