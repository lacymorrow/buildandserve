"use server";

import { z } from "zod";
import { createFeedback } from "@/server/services/feedback-service";

const feedbackSchema = z.object({
	content: z.string().min(1, "Feedback cannot be empty"),
	source: z.enum(["dialog", "popover"]),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export const submitFeedback = async (input: z.infer<typeof feedbackSchema>) => {
	try {
		const validatedInput = feedbackSchema.parse(input);
		const result = await createFeedback(validatedInput, { skipEmail: false });
		return result;
	} catch (error) {
		console.error("Error submitting feedback:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to submit feedback",
		};
	}
};
