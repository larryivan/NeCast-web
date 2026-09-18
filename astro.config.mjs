// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import starlightLinksValidator from 'starlight-links-validator';

// Published with GitHub Pages as a project site of the NeCast-web repository.
export default defineConfig({
  site: 'https://larryivan.github.io',
  base: '/NeCast-web',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'NeCast',
      description:
        'NeCast estimates the size history of a population from 32 unphased genomes and the recombination and mutation maps of their window.',
      favicon: '/favicon.svg',
      // the link-preview image (scripts/build_social_card.mjs draws it); Starlight adds the rest
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://larryivan.github.io/NeCast-web/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        {
          tag: 'meta',
          attrs: { property: 'og:image:alt', content: 'NeCast: population size histories from genotypes and genetic maps' },
        },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://larryivan.github.io/NeCast-web/og.png' } },
      ],
      logo: { src: './src/assets/logo.svg', alt: 'NeCast' },
      // the home-page hero draws a real training window instead of an image
      components: {
        Header: './src/components/overrides/Header.astro',
        Hero: './src/components/overrides/Hero.astro',
        PageTitle: './src/components/overrides/PageTitle.astro',
        Footer: './src/components/overrides/Footer.astro',
      },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        'zh-cn': { label: '简体中文', lang: 'zh-CN' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/larryivan/NeCast' }],
      customCss: ['./src/styles/global.css'],
      // fails the build on a broken internal link, in either language
      plugins: [starlightLinksValidator({ errorOnRelativeLinks: false })],
      // The site's sections, in the order of the tabs under the header (after Home). Pages have no
      // left sidebar (src/routeData.ts); a section with several pages lists them at the top of each.
      sidebar: [
        { label: 'Method', translations: { 'zh-CN': '原理' }, items: [{ slug: 'method' }] },
        {
          label: 'Data',
          translations: { 'zh-CN': '数据' },
          items: [
            { slug: 'data', label: 'Overview', translations: { 'zh-CN': '总览' } },
            { slug: 'data/simulations', label: 'Simulated corpus', translations: { 'zh-CN': '模拟语料' } },
            { slug: 'data/benchmark', label: 'Benchmark', translations: { 'zh-CN': '基准' } },
            { slug: 'data/1000g', label: '1000 Genomes', translations: { 'zh-CN': '千人基因组' } },
            { slug: 'model', label: 'Trained network', translations: { 'zh-CN': '训练好的网络' } },
          ],
        },
        { label: 'Explorer', translations: { 'zh-CN': '语料浏览器' }, items: [{ slug: 'data/explorer' }] },
        { label: 'Authors', translations: { 'zh-CN': '作者' }, items: [{ slug: 'about' }] },
      ],
      routeMiddleware: './src/routeData.ts',
      // the previous and next links crossed from one section to another; the tabs replace them
      pagination: false,
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
    // The corpus explorer (React, Observable Plot) is one ~170 kB gzipped chunk, loaded on that page only.
    build: { chunkSizeWarningLimit: 600 },
    // Bundle the explorer's dependencies when the dev server starts, not when the page first asks
    // for them; otherwise a restart can mix old and new chunks in the browser (two copies of React).
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        '@tanstack/react-table',
        '@tanstack/react-virtual',
        '@observablehq/plot',
        'hyparquet',
        'lucide-react',
        'radix-ui',
        'class-variance-authority',
        'clsx',
        'tailwind-merge',
      ],
    },
  },
});
