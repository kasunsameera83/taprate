-- 0027: blog. Only platform admins (with two-step sign-in) can write posts; visitors only ever see
-- published posts, read by the server. Post bodies are plain text in a small Markdown subset that the
-- site renders itself (no HTML is ever stored or shown).

create table if not exists public.blog_posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  title            text not null check (char_length(title) between 3 and 120),
  excerpt          text not null default '' check (char_length(excerpt) <= 300),
  body             text not null default '' check (char_length(body) <= 60000),
  seo_description  text check (seo_description is null or char_length(seo_description) <= 160),
  author_name      text not null default 'TapTruly team' check (char_length(author_name) between 2 and 60),
  cover_path       text check (cover_path is null or cover_path ~ '^posts/[0-9a-f-]{36}/cover-[A-Za-z0-9_-]{16,40}\.(png|jpg|webp)$'),
  status           text not null default 'draft' check (status in ('draft', 'published')),
  published_at     timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (status = 'draft' or published_at is not null)
);
create index if not exists blog_posts_live_idx on public.blog_posts (published_at desc) where status = 'published';

alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;
grant select, insert, delete on public.blog_posts to authenticated;
grant update (slug, title, excerpt, body, seo_description, author_name, cover_path, status, published_at, updated_at) on public.blog_posts to authenticated;
grant select, insert, update, delete on public.blog_posts to service_role;
drop policy if exists blog_posts_admin on public.blog_posts;
create policy blog_posts_admin on public.blog_posts for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Cover pictures: public files, written only by the server after checking them.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('blog-images', 'blog-images', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
  end if;
end $$;

-- The first post (only added once; edit or unpublish it any time in Admin -> Blog).
insert into public.blog_posts (slug, title, excerpt, seo_description, author_name, status, published_at, body)
values (
  'why-one-tap-beats-ten-questions',
  'Why one tap beats ten questions',
  'Long surveys get ignored. Here is why a single tap in the emails you already send gets more honest answers, and what to do with them once they arrive.',
  'Long surveys get ignored. Learn why one-tap ratings in your emails get more honest customer feedback, and how to act on every unhappy answer.',
  'TapTruly team',
  'published',
  now(),
$post$
You've probably received one of those emails: *"We value your feedback! This short survey will take about 10 minutes."* And you've probably closed it.

Your customers do the same. Not because they don't care, but because a ten-minute survey asks for ten minutes they don't have. The people who do finish it are usually the ones who are either thrilled or furious, so the results tell you less than you think.

There's a simpler way: ask **one question**, and let customers answer with **one tap**.

## The trouble with long surveys

Long surveys feel thorough, but they have three problems.

1. **Effort.** Every extra question is another reason to stop. Many people never start.
2. **Timing.** A survey that arrives days later asks people to remember how they felt. Memory is fuzzy, and the moment has passed.
3. **Context.** By the time a survey arrives, the customer has moved on. The conversation that made them happy or annoyed is no longer in front of them.

The result is a small, unusual group of answers, and a lot of silence from everyone else.

## What one-tap feedback looks like

Instead of a link to a survey, the question sits **inside the email you were already sending**: a support reply, a delivery update, an order confirmation.

> How did we do? 😡 🙁 😐 🙂 😍

The customer taps a face. That's the answer. No form, no login, no ten minutes. If they want to say more, they can add a comment on the next page, but they don't have to.

## Why it works

- **It's effortless.** One tap is easy to say yes to, so far more of your customers answer, not just the ones with strong feelings.
- **It's in the moment.** The question arrives with the reply or the order, while the experience is still fresh.
- **It's honest.** A face is quick and instinctive. People tap how they actually feel.
- **It's specific.** Each rating is linked to the ticket, order, agent or branch it was about, so you know exactly what it refers to.

## Make sure every tap is real

There's a catch with links in emails: many company email systems **scan every link** in incoming messages to check for danger. To a basic tool, those scans look like clicks, which means fake ratings and wasted credits.

TapTruly holds each tap until a real browser confirms it. Email scanners are never counted, so your numbers reflect real customers.

## The answers are only the start

Feedback is only useful if something happens next. The businesses that get the most from it follow a simple loop.

### 1. Call back unhappy customers quickly

An unhappy rating is a customer telling you, privately, that something went wrong. That is a gift. Reach out the same day if you can, apologise, and put it right. Many will be surprised anyone noticed.

### 2. Ask again once it's fixed

When the problem is solved, ask how you're doing now. Turning a bad day into a good experience often creates a more loyal customer than if nothing had gone wrong at all. TapTruly sends this follow-up for you when a follow-up is marked resolved, and counts how many customers you **won back**.

### 3. Look for patterns, not just scores

A satisfaction percentage tells you *how* you're doing. Comments tell you *why*. Read them weekly, and look for the same few themes coming up again and again. Fixing one common cause can lift every score after it.

### 4. Celebrate what's working

Happy ratings deserve attention too. Share them with your team, thank the people customers mention by name, and, with permission, show kind words on your website.

## Start in ten minutes

You don't need a big project to begin.

1. Write one question, such as *"How did we do?"*
2. Pick a scale: faces, stars, thumbs or 0 to 10.
3. Paste the buttons into your email signature or your helpdesk's reply template.
4. Watch the first ratings arrive, and call back the first unhappy customer.

That's it. One question, one tap, and a clear view of how every customer feels.

---

**Ready to try it?** [Start free with TapTruly](/signup): 50 responses free, no card needed.
$post$
)
on conflict (slug) do nothing;
