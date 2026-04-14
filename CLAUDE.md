# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Local development server (http://localhost:4000)
npm run server
# or
hexo server

# Build static site to public/
npm run build
# or
hexo generate

# Clean generated files and cache
npm run clean
# or
hexo clean

# Deploy to GitHub Pages (branch: blog)
npm run deploy
# or
hexo deploy

# Create a new post
hexo new "Post Title"

# Create a new draft
hexo new draft "Post Title"

# Publish a draft
hexo publish "Draft Title"
```

## Architecture

This is a **Hexo 7** static blog deployed to GitHub Pages at `https://yxibng.github.io`. The active theme is **Fluid** (`hexo-theme-fluid`).

**Two config files control everything:**
- `_config.yml` — Core Hexo config: site URL, permalink format (`:year/:month/:day/:title/`), deploy target (git → `yxibng/yxibng.github.io`, branch `blog`), syntax highlighting (highlight.js).
- `_config.fluid.yml` — Fluid theme overrides: navbar title, about page content, index slogan.

**Content lives in `source/_posts/`**, organized into subdirectories by topic (e.g. `ios/`, `c++/`, `cmake/`, `ffmpeg/`, `Shell/`, `webrtc/`, `hls/`, `lldb/`). Standalone posts sit directly in `_posts/`. Post front matter uses `title`, `date`, and `tags`.

**Deploy flow:** `hexo clean && hexo generate && hexo deploy` pushes the generated `public/` output to the `blog` branch of the GitHub repo via SSH (`git@github.com:yxibng/yxibng.github.io.git`).

**Post scaffold** (`scaffolds/post.md`) only includes `title`, `date`, and `tags` — keep new posts consistent with this minimal front matter.
