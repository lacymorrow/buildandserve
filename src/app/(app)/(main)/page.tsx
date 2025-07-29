
import CallToAction from "@/app/(app)/(main)/_components/call-to-action";
import FAQsTwo from "@/app/(app)/(main)/_components/faqs-2";
import IntegrationsSection from "@/app/(app)/(main)/_components/integrations-7";
import FeaturesSection1 from "@/components/features-8";
import FeaturesSection from "@/components/features-eleven";
import FeaturesSection2 from "@/components/features-six";
import HeroSection from "@/app/(app)/(main)/_components/hero-section";

export default function BuildAndServePage() {
	return (
		<div className="min-h-screen container mx-auto">
			<HeroSection />
			<FeaturesSection2 />
			<FeaturesSection1 />
			<FeaturesSection />
			<IntegrationsSection />
			<FAQsTwo />
			<CallToAction />

		</div>
	);
}
