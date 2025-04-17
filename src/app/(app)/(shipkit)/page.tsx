import { SuspenseFallback } from "@/components/primitives/suspense-fallback";
import { Suspense } from "react";
import { HeroSection } from "./_components/hero-section";
import { LaunchPageContent } from "./_components/launch-page-content";

export default function LaunchPage() {
	return (
		<>
			<HeroSection />
			<Suspense fallback={<SuspenseFallback />}>
				<LaunchPageContent />
			</Suspense>
		</>
	);
}
