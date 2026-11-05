import Script from "next/script";

/**
 * Google Ads tag (gtag.js) for account AW-733635438. Not ads: it's conversion
 * tracking. `withConversions` (landing page) also configures the tag and
 * reports a conversion when someone clicks an element marked
 * data-conversion="start-adventuring".
 */
const AW_ID = "AW-733635438";
const START_CONVERSION = "AW-733635438/jGXACKz59IgbEO7G6d0C";

export default function GoogleTag({ withConversions = false }: { withConversions?: boolean }) {
  return (
    <>
      <Script async src={`https://www.googletagmanager.com/gtag/js?id=${AW_ID}`} crossOrigin="anonymous" strategy="afterInteractive" />
      {withConversions && (
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${AW_ID}');
            document.addEventListener('click', function (e) {
              var el = e.target && e.target.closest && e.target.closest('[data-conversion="start-adventuring"]');
              if (el) gtag('event', 'conversion', { send_to: '${START_CONVERSION}' });
            });
          `}
        </Script>
      )}
    </>
  );
}
