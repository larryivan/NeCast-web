// One menu for the whole site: the section tabs under the header (overrides/Header.astro).
// No page carries a left sidebar, so the layout stays the same from page to page; a section
// with several pages lists them at the top of each (overrides/PageTitle.astro).
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

export const onRequest = defineRouteMiddleware((context) => {
  context.locals.starlightRoute.hasSidebar = false;
});
