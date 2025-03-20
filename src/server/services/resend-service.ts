import { RESEND_FROM } from "@/config/constants";
import { siteConfig } from "@/config/site-config";
import { resend } from "@/lib/resend";

export const sendFeedbackEmail = async (content: string): Promise<void> => {
	try {
		if (!resend) {
			console.warn("Resend client not initialized - AUTH_RESEND_KEY not set");
			return;
		}

		const result = await resend.emails.send({
			from: `🍱 ${siteConfig.name} <${RESEND_FROM}>`,
			to: [siteConfig.creator.email],
			subject: "New Feedback Received",
			html: `<p>${content}</p>`,
		});

		console.debug("Feedback sent successfully", result);
	} catch (error) {
		console.error("Error sending feedback:", error);
		throw new Error("Failed to send feedback email");
	}
};
