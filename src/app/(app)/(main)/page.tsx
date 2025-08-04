
import CallToAction from "@/app/(app)/(main)/_components/call-to-action";
import FAQsTwo from "@/app/(app)/(main)/_components/faqs-2";
import IntegrationsSection from "@/app/(app)/(main)/_components/integrations-7";
import FeaturesSection1 from "@/app/(app)/(main)/_components/features-8";
import FeaturesSection from "@/app/(app)/(main)/_components/features-eleven";
import FeaturesSection2 from "@/app/(app)/(main)/_components/features-six";
import HeroSection from "@/app/(app)/(main)/_components/hero-section";
import PricingSection from "@/app/(app)/(main)/_components/pricing";
import { CaseStudyMarquee } from "@/components/ui";

const caseStudies = [
	{
		id: 1,
		title: "Project One",
		image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
		href: "/case-studies/project-one",
	},
	{
		id: 2,
		title: "Project Two",
		image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
		href: "/case-studies/project-two",
	},
	{
		id: 3,
		title: "Project Three",
		image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
		href: "/case-studies/project-three",
	},
	{
		id: 4,
		title: "Project Four",
		image: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
		href: "/case-studies/project-four",
	},
	{
		id: 5,
		title: "Project Five",
		image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=2072&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
		href: "/case-studies/project-five",
	},
];

export default function BuildAndServePage() {
	return (
		<div className="min-h-screen container mx-auto">
			<HeroSection />
			<FeaturesSection />
			<FeaturesSection1 />
			<FeaturesSection2 />
			<IntegrationsSection />
			<CaseStudyMarquee studies={caseStudies} />
			{/* <PricingSection /> */}
			<a id="faq" />
			<FAQsTwo />
			<a id="cta" />
			<CallToAction />

		</div>
	);
}
