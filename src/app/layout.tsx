import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunrise PG | Premium PG Accommodation in Bengaluru",
  description: "Sunrise PG offers premium, fully-furnished PG accommodations with modern amenities, delicious meals, and a vibrant community in Bengaluru.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
