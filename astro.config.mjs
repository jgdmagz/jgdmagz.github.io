// @ts-check
import { defineConfig } from 'astro/config';

// Served via GitHub Pages on the custom domain studentflowapp.com.
// The CNAME file in public/ is copied to the site root so the custom domain
// persists across GitHub Actions deploys.
// https://astro.build/config
export default defineConfig({
  site: 'https://studentflowapp.com',
});
