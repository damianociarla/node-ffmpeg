import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'node-ffmpeg — Typed FFmpeg for Node.js',
  description: 'A modern, typed Node.js API for FFmpeg.',
  base: '/node-ffmpeg/',
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    // The package intentionally pins one current esbuild across tsup, Vitest and VitePress.
    // The docs are evergreen and do not need Vite 5's legacy syntax transforms.
    build: { target: 'esnext' },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/node-ffmpeg/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#080a08' }],
    ['meta', { property: 'og:title', content: 'node-ffmpeg — typed media pipelines' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'A typed, zero-runtime-dependency TypeScript interface for FFmpeg.',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    [
      'meta',
      {
        property: 'og:image',
        content: 'https://damianociarla.github.io/node-ffmpeg/social-preview.png',
      },
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'node-ffmpeg — typed media pipelines' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content: 'A typed, zero-runtime-dependency TypeScript interface for FFmpeg.',
      },
    ],
    [
      'meta',
      {
        name: 'twitter:image',
        content: 'https://damianociarla.github.io/node-ffmpeg/social-preview.png',
      },
    ],
  ],
  sitemap: { hostname: 'https://damianociarla.github.io/node-ffmpeg/' },
  transformHead({ page }) {
    const route = page.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const url = `https://damianociarla.github.io/node-ffmpeg/${route}`;
    return [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
    ];
  },
  transformHtml(code, id) {
    if (!id.endsWith('404.html')) return code;
    return code.replace(
      '<div id="app"></div>',
      '<div id="app"></div><noscript><main class="custom-not-found"><p>404 / SIGNAL LOST</p><h1>This frame does not exist.</h1><a href="/node-ffmpeg/">Return to node-ffmpeg</a></main></noscript>',
    );
  },
  markdown: {
    lineNumbers: true,
    theme: { light: 'github-light', dark: 'vesper' },
  },
  themeConfig: {
    siteTitle: 'node-ffmpeg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/video' },
      { text: 'Cookbook', link: '/cookbook/frames' },
      { text: 'Migration', link: '/guide/migration' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Migration from 0.0.4', link: '/guide/migration' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API reference',
          items: [
            { text: 'Video pipeline', link: '/api/video' },
            { text: 'Events', link: '/api/events' },
            { text: 'Metadata and types', link: '/api/types' },
          ],
        },
      ],
      '/cookbook/': [
        {
          text: 'Cookbook',
          items: [
            { text: 'Extract frames', link: '/cookbook/frames' },
            { text: 'Watermarks', link: '/cookbook/watermarks' },
            { text: 'Custom commands', link: '/cookbook/custom-commands' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/damianociarla/node-ffmpeg' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/damianociarla/node-ffmpeg/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Built around FFmpeg. Designed for modern Node.js.',
      copyright: 'MIT © Damiano Ciarla',
    },
  },
});
