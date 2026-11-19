-- 020: anonymous, per-visitor likes for halxdocs.com blog posts.
CREATE TABLE IF NOT EXISTS portfolio_blog_likes (
  slug       TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_portfolio_blog_likes_slug ON portfolio_blog_likes (slug);
