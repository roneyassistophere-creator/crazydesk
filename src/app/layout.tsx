import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crazy Desk | Assistophere",
  description: "Team management system for Assistophere",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex h-screen bg-base-100 text-base-content`}
      >
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8 relative bg-base-100">
           {/* Top bar placeholder for mobile menu or user profile later */}
          {children}
        </main>
      </body>
    </html>
  );
}
