import { ConfettiSideCannons } from "@/components/magicui/confetti/confetti-side-cannons";
import { Link } from "@/components/primitives/link-with-transition";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site";
import { ArrowUpRight, CheckCircle } from "lucide-react";

interface DeploymentInfo {
	deploymentDashboardUrl: string;
	deploymentUrl: string;
	productionDeployHookUrl: string;
	projectDashboardUrl: string;
	projectName: string;
	repositoryUrl: string;
}

function extractDeploymentInfo(searchParams: { [key: string]: string }): DeploymentInfo {
	return {
		deploymentDashboardUrl: decodeURIComponent(searchParams["deployment-dashboard-url"] || ""),
		deploymentUrl: decodeURIComponent(searchParams["deployment-url"] || ""),
		productionDeployHookUrl: decodeURIComponent(searchParams["production-deploy-hook-url"] || ""),
		projectDashboardUrl: decodeURIComponent(searchParams["project-dashboard-url"] || ""),
		projectName: decodeURIComponent(searchParams["project-name"] || ""),
		repositoryUrl: decodeURIComponent(searchParams["repository-url"] || ""),
	};
}

export default async function VercelDeployPage({
	searchParams,
}: {
	searchParams: Promise<{ [key: string]: string }>;
}) {
	const deploymentInfo = extractDeploymentInfo(await searchParams);
	console.log(deploymentInfo);

	return (
		<>
			<ConfettiSideCannons />
			<div className="container max-w-2xl mx-auto py-10">
				<Card>
					<CardHeader className="text-center">
						<div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
							<CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
						</div>
						<CardTitle className="text-2xl">Deployment Successful!</CardTitle>
						<CardDescription>
							Your project {deploymentInfo.projectName} has been successfully deployed to Vercel
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<h3 className="text-sm font-medium">Deployment URLs</h3>
							<div className="grid gap-2">
								<Link href={deploymentInfo.deploymentUrl} className="text-sm underline">
									View Live Site →
								</Link>
								<Link href={deploymentInfo.deploymentDashboardUrl} className="text-sm underline">
									View Deployment on Vercel →
								</Link>
							</div>
						</div>

						<div className="space-y-2">
							<h3 className="text-sm font-medium">Project Information</h3>
							<div className="grid gap-2">
								<Link href={deploymentInfo.projectDashboardUrl} className="text-sm underline">
									View Project on Vercel →
								</Link>
								<Link href={deploymentInfo.repositoryUrl} className="text-sm underline">
									GitHub Repository →
								</Link>
							</div>

						</div>
					</CardContent>
					<CardFooter className="flex justify-center gap-4">
						<Link
							className={buttonVariants({ variant: "default" })}
							href={deploymentInfo.deploymentUrl}
						>
							Visit Site <ArrowUpRight className="w-4 h-4" />
						</Link>
						<Button asChild variant="outline">
							<Link href={routes.dashboard}>
								Shipkit Dashboard
							</Link>
						</Button>
					</CardFooter>
				</Card>
			</div>
		</>
	);
}
