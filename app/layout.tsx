import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { ThemeController, themeBootScript } from "@/components/common/theme-controller";
import { UndoToast } from "@/components/common/undo-toast";

const instrumentSans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Walk & Plot",
    template: "%s - Walk & Plot",
  },
  description: "Map any building with just your phone. No account needed. Works offline.",
  applicationName: "Walk & Plot",
};

export const viewport: Viewport = {
  themeColor: "#4F46E5",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${bricolage.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the persisted theme before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <ThemeController />
        {children}
        <UndoToast />
      </body>
    </html>
  );
}
