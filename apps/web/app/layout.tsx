import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brewnanza - Specialty Coffee Search",
  description: "Search specialty coffees from top roasters worldwide",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={sora.className}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
