import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "v0 Component Installer - ShipKit",
    description: "Install v0.dev components into your ShipKit project",
};

export default function InstallLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <>
            <head>
                {/* Important: cross-origin-isolated required for WebContainers */}
                <meta httpEquiv="Cross-Origin-Opener-Policy" content="same-origin" />
                <meta httpEquiv="Cross-Origin-Embedder-Policy" content="require-corp" />
            </head>
            <div className="min-h-screen bg-background">
                <main className="flex-1">{children}</main>
            </div>
        </>
    );
}
