// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Served via GitHub Pages on the custom domain studentflowapp.com.
// The CNAME file in public/ is copied to the site root so the custom domain
// persists across GitHub Actions deploys.
// React powers the /app island (the StudentFlow web app); the marketing
// pages stay plain Astro + vanilla JS.
// https://astro.build/config
export default defineConfig({
  site: 'https://studentflowapp.com',
  integrations: [react()],
});
