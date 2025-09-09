"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import type { NewPayment, Payment } from "@/server/db/schema";
import { payments } from "@/server/db/schema";
import { siteConfig } from "@/config/site-config";
import { deployPrivateRepository, type DeploymentResult } from "./deploy-private-repo";

const SHIPKIT_REPO = `${siteConfig.repo.owner}/${siteConfig.repo.name}`;

type Deployment = Payment;
const deployments = payments;

type NewDeployment = Omit<NewPayment, "id" | "createdAt" | "updatedAt"> & {
	projectName: string;
	description?: string | null;
	status: string;
	userId?: string;
};

export async function initiateDeployment(formData: FormData): Promise<DeploymentResult> {
	const projectName = formData.get("projectName") as string;
	if (!projectName) {
		return { success: false, error: "Project name is required" };
	}

	const description = `Deployment of ${projectName}`;
	const newDeployment = await createDeployment({
		projectName,
		description,
		status: "deploying",
	});

	deployPrivateRepository({
		templateRepo: SHIPKIT_REPO,
		projectName,
		newRepoName: projectName,
		description,
		githubToken: "",
	}).catch((error) => {
		console.error(`Deployment failed for ${projectName}:`, error);
	});

	return {
		success: true,
		message: "Deployment initiated successfully! You can monitor the progress on this page.",
		data: { githubRepo: undefined, vercelProject: undefined },
	};
}

export async function getUserDeployments(): Promise<Deployment[]> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	if (!db) throw new Error("Database not available");

	const userDeployments = await db
		.select()
		.from(deployments as any)
		.where(eq((deployments as any).userId, session.user.id))
		.orderBy(desc((deployments as any).createdAt));
	return userDeployments as any;
}

export async function createDeployment(
	data: Omit<NewDeployment, "id" | "userId" | "createdAt" | "updatedAt">
): Promise<Deployment> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	if (!db) throw new Error("Database not available");

	const [newDeployment] = await (db as any)
		.insert(deployments as any)
		.values({ ...data, userId: session.user.id })
		.returning();

	revalidatePath("/deployments");
	return newDeployment as any;
}

export async function updateDeployment(
	id: string,
	data: Partial<Omit<Deployment, "id" | "userId" | "createdAt">>
): Promise<Deployment | null> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	if (!db) throw new Error("Database not available");

	const [updatedDeployment] = await (db as any)
		.update(deployments as any)
		.set({ ...data, updatedAt: new Date() })
		.where(and(eq((deployments as any).id, id), eq((deployments as any).userId, session.user.id)))
		.returning();

	if (updatedDeployment) revalidatePath("/deployments");
	return (updatedDeployment as any) || null;
}

export async function deleteDeployment(id: string): Promise<boolean> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	if (!db) throw new Error("Database not available");

	await (db as any)
		.delete(deployments as any)
		.where(and(eq((deployments as any).id, id), eq((deployments as any).userId, session.user.id)));

	revalidatePath("/deployments");
	return true;
}

export async function initializeDemoDeployments(): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Unauthorized");
	if (!db) throw new Error("Database not available");

	const existingDeployments = await (db as any)
		.select()
		.from(deployments as any)
		.where(eq((deployments as any).userId, session.user.id))
		.limit(1);
	if (existingDeployments.length > 0) return;

	const demoDeployments: any[] = [
		{ userId: session.user.id, projectName: "my-shipkit-app", description: "Production deployment", status: "completed" },
		{ userId: session.user.id, projectName: "shipkit-staging", description: "Staging environment", status: "completed" },
		{ userId: session.user.id, projectName: "shipkit-dev", description: "Development environment", status: "failed" },
	];

	await (db as any).insert(deployments as any).values(demoDeployments);
	revalidatePath("/deployments");
}
