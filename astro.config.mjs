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
      logo: { src: './src/assets/logo.svg', alt: 'NeCast' },
      // the home-page hero draws a real training window instead of an image
      components: { Hero: './src/components/overrides/Hero.astro' },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        'zh-cn': { label: '简体中文', lang: 'zh-CN' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/larryivan/NeCast' }],
      customCss: ['./src/styles/global.css'],
      // fails the build on a broken internal link, in either language
      plugins: [starlightLinksValidator({ errorOnRelativeLinks: false })],
      sidebar: [
        {
          label: 'Method',
          translations: { 'zh-CN': '方法' },
          items: [{ slug: 'method' }, { slug: 'model' }],
        },
        {
          label: 'Data',
          translations: { 'zh-CN': '数据' },
          items: [
            { slug: 'data' },
            { slug: 'data/explorer' },
            { slug: 'data/simulations' },
            { slug: 'data/benchmark' },
            { slug: 'data/1000g' },
          ],
        },
        {
          label: 'About',
          translations: { 'zh-CN': '关于' },
          items: [{ slug: 'about' }],
        },
      ],
    }),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
    // The corpus explorer (React, Observable Plot) is one ~170 kB gzipped chunk, loaded on that page only.
    build: { chunkSizeWarningLimit: 600 },
  },
});
