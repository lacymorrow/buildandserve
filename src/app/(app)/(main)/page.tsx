
import CallToAction from "@/app/(app)/(main)/_components/call-to-action";
import FAQsTwo from "@/app/(app)/(main)/_components/faqs-2";
import IntegrationsSection from "@/app/(app)/(main)/_components/integrations-7";
import FeaturesSection1 from "@/app/(app)/(main)/_components/features-8";
import FeaturesSection from "@/app/(app)/(main)/_components/features-eleven";
import FeaturesSection2 from "@/app/(app)/(main)/_components/features-six";
import HeroSection from "@/app/(app)/(main)/_components/hero-section";
import PricingSection from "@/app/(app)/(main)/_components/pricing";

export default function BuildAndServePage() {
	return (
		<div className="min-h-screen container mx-auto">
			<HeroSection />
			<FeaturesSection />
			<FeaturesSection1 />
			<FeaturesSection2 />
			<IntegrationsSection />
			{/* <PricingSection /> */}
			<a id="faq" />
			<FAQsTwo />
			<a id="cta" />
			<CallToAction />

		</div>
	);
}
