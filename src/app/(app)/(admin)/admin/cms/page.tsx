"use client";

import { Link } from "@/components/primitives/link-with-transition";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { routes } from "@/config/routes";
import { useState } from "react";
import { seedCMSAction } from "./actions";

export default function CMSPage() {
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);

	const handleSeed = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			setLoading(true);
			setMessage(null);

			const result = await seedCMSAction();

			setMessage({
				type: result.success ? "success" : "error",
				text: result.message,
			});
		} catch (error) {
			setMessage({
				type: "error",
				text: error instanceof Error ? error.message : "An error occurred",
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="container mx-auto py-10">
			<h1 className="mb-8 text-3xl font-bold">CMS Management</h1>

			<div className="mb-6 flex gap-4">
				<Link className={buttonVariants({ variant: "link" })} href={routes.cms.index}>CMS Dashboard</Link>
				<Link className={buttonVariants({ variant: "link" })} href="/cms">Payload CMS Admin</Link>
			</div>

			<Card className="max-w-md">
				<CardHeader>
					<CardTitle>Seed CMS Data</CardTitle>
					<CardDescription>
						Seed the CMS with initial data. This will clear existing data first.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<form onSubmit={handleSeed} className="space-y-4">

						<Button
							type="submit"
							disabled={loading}
							className="w-full"
						>
							{loading ? "Seeding..." : "Seed CMS"}
						</Button>

						{message && (
							<p
								className={`mt-2 text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"
									}`}
							>
								{message.text}
							</p>
						)}
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
