"use server";

import { deleteAccount } from "@/server/actions/settings";
import { auth } from "@/server/auth";

/**
 * Server action for deleting an account that matches the FormData action signature
 */
export async function handleDeleteAccount(formData: FormData) {
	const session = await auth();
	if (!session?.user?.id) {
		return;
	}

	await deleteAccount();
}
