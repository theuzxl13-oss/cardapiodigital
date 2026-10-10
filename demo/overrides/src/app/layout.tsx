import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import { DemoChrome } from "@/components/demo/demo-chrome";
import { asset } from "@/lib/asset";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sabor & Arte Bistrô — Demonstração", template: "%s · Sabor & Arte" },
  description: "Demonstração: cardápio digital com realidade aumentada, pedidos pela mesa e gestão completa do restaurante.",
  icons: { icon: asset("/brand/logo.svg") },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <DemoChrome />
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
