import type { Metadata } from "next";
import { Sora } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
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
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className={sora.className}>
        <ConvexClientProvider>
          <Suspense>{children}</Suspense>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
