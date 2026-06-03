# StudentFlow — website

Marketing site + blog for **StudentFlow**, built with [Astro](https://astro.build) and hosted free on **GitHub Pages**.

🔗 **Live site:** https://jgdmagz.github.io/

---

## Run it locally

```bash
npm install      # first time only
npm run dev      # start the dev server → http://localhost:4321
```

Other commands:

```bash
npm run build    # build the production site into ./dist
npm run preview  # preview the built site locally
```

## Add a blog post

1. Create a new Markdown file in `src/pages/blog/`, e.g. `gpa-calculator-is-here.md`.
2. Start it with this frontmatter:

   ```markdown
   ---
   layout: ../../layouts/BlogPost.astro
   title: "Your headline here"
   description: "One-line summary shown in the blog list."
   pubDate: "2026-07-01"
   ---

   Write your post in Markdown below.
   ```

3. Save, commit, and push. It appears automatically on `/blog`, newest first.

## How deploys work

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the
site and publishes it to GitHub Pages. No manual steps. Watch runs in the repo's
**Actions** tab.

## Project structure

```
src/
  components/FlowMark.astro   ← brand mark (placeholder — swap in the real logo)
  layouts/BaseLayout.astro    ← shared shell: <head>, nav, footer
  layouts/BlogPost.astro      ← wraps each blog post
  pages/index.astro           ← the landing page (hero + features + CTA)
  pages/blog/index.astro      ← the blog list
  pages/blog/*.md             ← blog posts
  styles/global.css           ← all styles + brand colors (from FlowDesign.swift)
public/
  favicon.svg                 ← brand mark favicon
```

## To-do (search the code for `TODO:`)

- [ ] Add the real **App Store link** (in `src/pages/index.astro`).
- [ ] Drop the **hero video / screenshot** into the `.hero-media` slot when ready.
- [ ] Swap the placeholder `FlowMark` for the real exported logo.
- [ ] (Optional) Add a **custom domain** in repo Settings → Pages.
