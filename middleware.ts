import { authMiddleware } from '@clerk/nextjs';

// API routes require a signed-in user. Add a route here only if it verifies
// its caller another way (e.g. a signed Stripe webhook).
export default authMiddleware({
  publicRoutes: ['/', '/robots.txt', '/sitemap.xml', '/opengraph-image(.*)', '/api/stripe/webhook', '/api/cron/close-sessions'],
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',

    '/(api|trpc)(.*)',
  ],
};
