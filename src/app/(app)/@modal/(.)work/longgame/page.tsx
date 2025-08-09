import { Modal } from "@/components/primitives/modal";
import { CaseStudyModal } from "@/components/ui/case-study-modal";
import { Gamepad2 } from "lucide-react";

export default async function Page() {
  return (
    <Modal routeBack={true} className="max-w-5xl">
      <CaseStudyModal
        title="Long Game"
        description="Making personal finance fun through gamification. Built mobile-first experiences that turn saving money into an engaging game with real financial rewards."
        image="/static/long-game/longgame.png"
        technologies={[
          "React Native",
          "TypeScript",
          "Redux",
          "Firebase",
          "Stripe",
          "Game Design",
        ]}
        duration="2020-2021"
        scale="100k+ Downloads"
        role="Senior Mobile Engineer"
        externalUrl={undefined}
        caseStudyUrl="/work/longgame"
        icon={<Gamepad2 className="h-8 w-8 text-purple-600" />}
        highlights={[
          "Built cross-platform mobile app with React Native serving 100k+ users",
          "Developed interactive mini-games with smooth 60fps animations",
          "Implemented secure financial integrations with banking APIs and Stripe",
          "Created gamification systems with achievements, streaks, and rewards",
          "Built real-time multiplayer gaming features with Firebase",
          "Designed user onboarding flow increasing retention by 35%",
        ]}
      />
    </Modal>
  );
}
