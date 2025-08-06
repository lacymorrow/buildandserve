import { Modal } from "@/components/primitives/modal";
import { CaseStudyModal } from "@/components/ui/case-study-modal";
import { MessageSquare } from "lucide-react";

export default async function Page() {
  return (
    <Modal routeBack={true} className="max-w-5xl">
      <CaseStudyModal
        title="Twilio"
        description="Building innovative communication tools and developer experiences with Twilio's APIs. Created hackathon projects and developer resources that showcase the power of programmable communications."
        image="/static/twilio/hackpack/hackpack.png"
        technologies={[
          "JavaScript",
          "Node.js",
          "Twilio API",
          "WebRTC",
          "Hardware",
          "IoT",
        ]}
        duration="2020-2021"
        scale="Developer"
        role="Hackpack Creator"
        externalUrl="https://twilio.com"
        caseStudyUrl="/work/twilio"
        icon={<MessageSquare className="h-8 w-8 text-red-600" />}
        highlights={[
          "Designed and built physical hackpack combining hardware with Twilio APIs",
          "Created educational resources for developer community workshops",
          "Developed proof-of-concept IoT communication projects",
          "Built interactive demos showcasing SMS, voice, and video capabilities",
          "Contributed to open-source Twilio SDK examples and documentation",
          "Led hackathon workshops teaching developers communication API integration",
        ]}
      />
    </Modal>
  );
}
