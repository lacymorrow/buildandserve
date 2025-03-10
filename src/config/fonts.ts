import { Space_Grotesk as FontSans, Noto_Serif as FontSerif } from "next/font/google";

export const fontSerif = FontSerif({
	weight: ["400", "500", "600", "700"],
	style: ["normal", "italic"],
	subsets: ["latin"],
	variable: "--font-serif",
});

export const fontSans = FontSans({
	display: "swap",
	subsets: ["latin"],
	variable: "--font-sans",
});
