
import HeroSection from "@/app/(app)/(main)/_components/hero-section";
import IntegrationsSection from "@/app/(app)/(main)/_components/integrations-7";
import CallToAction from "@/app/(app)/(main)/_components/call-to-action";
import FAQsTwo from "@/app/(app)/(main)/_components/faqs-2";

export default function ShipkitOnboardingPage() {
	return (
		<div className="min-h-screen">
			<HeroSection />
			<IntegrationsSection />
			<FAQsTwo />
			<CallToAction />

		</div>
	);
}
