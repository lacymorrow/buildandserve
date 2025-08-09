import { Modal } from "@/components/primitives/modal";
import { CaseStudyModal } from "@/components/ui/case-study-modal";
import { Zap } from "lucide-react";

export default async function Page() {
  return (
    <Modal routeBack={true} className="max-w-5xl">
      <CaseStudyModal
        title="Swell Energy"
        description="Building the future of distributed energy with advanced battery storage and solar solutions. Led development of customer-facing platforms and internal management tools."
        image="/static/swell-energy/swell-program.jpeg"
        technologies={[
          "React",
          "Node.js",
          "TypeScript",
          "PostgreSQL",
          "AWS",
          "D3.js",
        ]}
        duration="2022-2023"
        scale="10k+ Users"
        role="Senior Frontend Lead"
        externalUrl="https://swellenergy.com"
        caseStudyUrl="/work/swell-energy"
        icon={<Zap className="h-8 w-8 text-green-600" />}
        highlights={[
          "Built responsive customer enrollment and management portals",
          "Developed real-time energy monitoring dashboards with D3.js visualizations",
          "Implemented complex data tables for internal operations teams",
          "Created automated testing suites improving code reliability by 40%",
          "Led migration from legacy systems to modern React architecture",
        ]}
      />
    </Modal>
  );
}
