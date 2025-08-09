import { Modal } from "@/components/primitives/modal";
import { CaseStudyModal } from "@/components/ui/case-study-modal";
import { CreditCard } from "lucide-react";

export default async function Page() {
  return (
    <Modal routeBack={true} className="max-w-5xl">
      <CaseStudyModal
        title="Credit Karma"
        description="Empowering millions of Americans to make financial progress. Built modern web applications for credit monitoring, financial products, and personalized recommendations."
        image="/static/credit-karma/credit-karma-1.png"
        technologies={[
          "React",
          "Redux",
          "TypeScript",
          "Node.js",
          "GraphQL",
          "A/B Testing",
        ]}
        duration="2021-2022"
        scale="120M+ Users"
        role="Senior Frontend Engineer"
        externalUrl="https://creditkarma.com"
        caseStudyUrl="/work/credit-karma"
        icon={<CreditCard className="h-8 w-8 text-blue-600" />}
        highlights={[
          "Built responsive credit monitoring dashboards with real-time score updates",
          "Developed personalized financial product recommendation engines",
          "Implemented A/B testing framework improving conversion rates by 25%",
          "Created accessible mobile-first interfaces serving 70M+ mobile users",
          "Led performance optimization reducing page load times by 40%",
          "Mentored junior developers and established frontend code standards",
        ]}
      />
    </Modal>
  );
}
