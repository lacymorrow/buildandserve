import { PolarProvider } from "./polar-provider";

export default function PolarLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <PolarProvider>{children}</PolarProvider>;
}
