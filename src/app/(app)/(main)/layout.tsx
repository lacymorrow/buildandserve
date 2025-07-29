import type React from "react";
import MainLayout from "@/components/layouts/main-layout";
import { auth } from "@/server/auth";
import FooterSection from "@/app/(app)/(main)/_components/footer";
import { HeroHeader } from "@/app/(app)/(main)/_components/header";

export default async function Layout({ children }: { children: React.ReactNode }) {
	const session = await auth();

	return (
		<MainLayout header={<HeroHeader />} footer={<FooterSection />}>
			{children}
		</MainLayout>
	);
}
