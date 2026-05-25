import type React from "react";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
	return <div className="pt-24 md:pt-36">{children}</div>;
}
