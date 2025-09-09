// Actions middleware

import type { z } from "zod";
import { auth } from "@/server/auth";
import type { User } from "@/types/user";

export interface ActionState {
	error?: string;
	success?: string;
	// biome-ignore lint/suspicious/noExplicitAny: This allows for additional properties
	[key: string]: any;
}

const parseFormErrors = (errors: z.ZodError) => {
	const fieldErrors: Record<string, { message: string }> = {};
	for (const issue of errors.issues ?? []) {
		const key = issue.path?.[0];
		if (typeof key === "string" && !fieldErrors[key]) {
			fieldErrors[key] = { message: issue.message };
		}
	}
	return fieldErrors;
};

type ValidatedActionFunction<S extends z.ZodType<any, any>, T> = (
	data: z.infer<S>,
	formData: FormData
) => Promise<T>;

export function validatedAction<S extends z.ZodType<any, any>, T>(
	schema: S,
	action: ValidatedActionFunction<S, T>
) {
	return async (_prevState: ActionState, formData: FormData): Promise<T> => {
		const result = schema.safeParse(Object.fromEntries(formData as any));
		if (!result?.success) {
			return { error: parseFormErrors(result.error) } as T;
		}

		return action(result.data, formData);
	};
}

type ValidatedActionWithUserFunction<S extends z.ZodType<any, any>, T> = (
	data: z.infer<S>,
	formData: FormData,
	user: User
) => Promise<T>;

export function validatedActionWithUser<S extends z.ZodType<any, any>, T>(
	schema: S,
	action: ValidatedActionWithUserFunction<S, T>
) {
	return async (_prevState: ActionState, formData: FormData): Promise<T> => {
		const session = await auth();
		if (!session?.user) {
			throw new Error("User is not authenticated");
		}

		const result = schema.safeParse(Object.fromEntries(formData as any));
		if (!result.success) {
			return { error: result.error.issues?.[0]?.message } as T;
		}

		return action(result.data, formData, session.user);
	};
}

// type ActionWithTeamFunction<T> = (formData: FormData, team: TeamDataWithMembers) => Promise<T>;

// export function withTeam<T>(action: ActionWithTeamFunction<T>) {
//   return async (formData: FormData): Promise<T> => {
//     const user = await getUser();
//     if (!user) {
//       redirect("/sign-in");
//     }

//     const team = await getTeamForUser(user.id);
//     if (!team) {
//       throw new Error("Team not found");
//     }

//     return action(formData, team);
//   };
// }
