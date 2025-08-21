import type React from "react";
import "./global.css";
import type { Metadata } from "next";
import AdSense from "@/components/AdSense";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Dreampool | Landing Page",
  description: "",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <AdSense />
        {/* Add Google Tag Manager script for gtag */}
        <Script async src="https://www.googletagmanager.com/gtag/js?id=AW-733635438" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-733635438');
          `}
        </Script>
      </head>
      <body>
        {children}
        {/* Add Google conversion tracking script */}
        <Script id="google-conversion-tracking" strategy="afterInteractive">
          {`
            window.addEventListener('load', function() {
              document.addEventListener('click', function(e) {
                if (e.target.closest('button') && e.target.innerText.includes('START ADVENTURING')) {
                  gtag('event', 'conversion', {'send_to': 'AW-733635438/jGXACKz59IgbEO7G6d0C'});
                }
              });
            });
          `}
        </Script>
      </body>
    </html>
  );
}