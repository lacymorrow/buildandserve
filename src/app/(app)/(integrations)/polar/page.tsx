import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscriptionButton } from "./subscription-button";

export default function SubscriptionsPage() {
	const subscriptionTiers = [
		{
			id: process.env.NEXT_PUBLIC_POLAR_SUBSCRIPTION_PRICE_ID || "",
			name: "Basic",
			description: "Perfect for getting started",
			price: "$9/month",
		}
	];

	const oneTimeTiers = [
		{
			id: process.env.NEXT_PUBLIC_POLAR_ONE_TIME_PRICE_ID || "",
			name: "One-Time",
			description: "Perfect for getting started",
			price: "$5",
		}
	];

	const tiers = [...subscriptionTiers, ...oneTimeTiers];
	return (
		<div className="container mx-auto py-12">
			<h1 className="text-4xl font-bold text-center mb-12">Choose Your Plan</h1>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
				{tiers.map((tier) => (
					<Card key={tier.id} className="flex flex-col">
						<CardHeader>
							<CardTitle>{tier.name}</CardTitle>
							<CardDescription>{tier.description}</CardDescription>
						</CardHeader>
						<CardContent className="flex-grow">
							<p className="text-3xl font-bold">{tier.price}</p>
						</CardContent>
						<CardFooter>
							<SubscriptionButton
								tier={tier.id}
								className="w-full"
							/>
						</CardFooter>
					</Card>
				))}
			</div>
		</div>
	);
}
