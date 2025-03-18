import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

/**
 * Custom hook to manage synchronized sessions between NextAuth and Payload CMS
 *
 * This hook provides:
 * - The current NextAuth session
 * - Status of Payload CMS authentication
 * - Methods to refresh the session and validate the Payload token
 */
export const useSynchronizedSession = () => {
	const { data: session, status, update: updateSession } = useSession();
	const [isPayloadAuthenticated, setIsPayloadAuthenticated] = useState<boolean>(false);

	// Check if the session has a valid Payload token
	useEffect(() => {
		if (session?.user?.payloadToken && typeof session.user.payloadToken === "string") {
			setIsPayloadAuthenticated(true);
		} else {
			setIsPayloadAuthenticated(false);
		}
	}, [session]);

	/**
	 * Refreshes the session by redirecting to the refresh-session API route
	 * This will trigger a re-authentication with Payload CMS
	 */
	const refreshSession = () => {
		// Redirect to the refresh-session API route
		const currentPath = window.location.pathname;
		window.location.href = `/api/auth/refresh-session?callbackUrl=${encodeURIComponent(currentPath)}`;
	};

	/**
	 * Validates the Payload token by making a request to a protected Payload CMS endpoint
	 * @returns {Promise<boolean>} Whether the token is valid
	 */
	const validatePayloadToken = async (): Promise<boolean> => {
		if (!session?.user?.payloadToken || typeof session.user.payloadToken !== "string") {
			return false;
		}

		try {
			// Make a request to a Payload CMS endpoint that requires authentication
			const response = await fetch("/cms-api/users/me", {
				headers: {
					Authorization: `JWT ${session.user.payloadToken}`,
				},
			});

			if (response.ok) {
				return true;
			}

			// If the token is invalid, refresh the session
			refreshSession();
			return false;
		} catch (error) {
			console.error("Error validating Payload token:", error);
			return false;
		}
	};

	return {
		session,
		status,
		isLoading: status === "loading",
		isPayloadAuthenticated,
		refreshSession,
		validatePayloadToken,
		updateSession,
	};
};
