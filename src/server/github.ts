// Thu thập PR, review, comment từ GitHub (chỉ đọc).
import type { GithubData, PrComment, PullRequest, Review } from '../shared/types.js';
import type { Config } from './config.js';
import type { CachedFetcher } from './http.js';

interface GhUser {
  login: string;
}
interface GhPull {
  number: number;
  title: string;
  head: { ref: string };
  body: string | null;
  user: GhUser | null;
  draft?: boolean;
  created_at: string;
  closed_at: string | null;
  merged_at: string | null;
  requested_reviewers?: GhUser[];
  requested_teams?: { slug: string }[];
  html_url: string;
}
interface GhReview {
  id: number;
  user: GhUser | null;
  state: string;
  submitted_at: string | null;
  body: string | null;
}
interface GhComment {
  id: number;
  user: GhUser | null;
  body: string | null;
  created_at: string;
  html_url: string;
}

const REVIEW_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED']);

async function getAll<T>(f: CachedFetcher, url: string, headers: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const page: { data: T[]; next: string | null } = await f.getPage<T[]>(next, headers);
    out.push(...page.data);
    next = page.next;
  }
  return out;
}

function toPull(repo: string, p: GhPull): PullRequest {
  return {
    repo,
    number: p.number,
    title: p.title,
    branch: p.head.ref,
    body: p.body ?? '',
    author: p.user?.login ?? 'ghost',
    draft: !!p.draft,
    state: p.merged_at ? 'merged' : p.closed_at ? 'closed' : 'open',
    createdAt: p.created_at,
    closedAt: p.closed_at,
    requestedReviewers: (p.requested_reviewers ?? []).map((u) => u.login),
    requestedTeams: (p.requested_teams ?? []).map((t) => t.slug),
    reviews: [],
    comments: [],
    url: p.html_url,
  };
}

const toComment = (c: GhComment): PrComment => ({
  id: c.id,
  author: c.user?.login ?? 'ghost',
  body: c.body ?? '',
  createdAt: c.created_at,
  url: c.html_url,
});

export async function collectGithub(f: CachedFetcher, cfg: Config['github'], since: Date): Promise<GithubData> {
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const pulls: PullRequest[] = [];
  for (const repo of cfg.repos) {
    const base = `https://api.github.com/repos/${repo}`;
    const open = await getAll<GhPull>(f, `${base}/pulls?state=open&per_page=100`, headers);
    const closed = await f.getJson<GhPull[]>(`${base}/pulls?state=closed&sort=updated&direction=desc&per_page=50`, headers);
    for (const p of open) {
      const pr = toPull(repo, p);
      const [reviews, reviewComments, issueComments] = await Promise.all([
        getAll<GhReview>(f, `${base}/pulls/${p.number}/reviews?per_page=100`, headers),
        getAll<GhComment>(f, `${base}/pulls/${p.number}/comments?per_page=100`, headers),
        getAll<GhComment>(f, `${base}/issues/${p.number}/comments?per_page=100`, headers),
      ]);
      pr.reviews = reviews
        .filter((r) => REVIEW_STATES.has(r.state) && r.submitted_at)
        .map(
          (r): Review => ({
            id: r.id,
            author: r.user?.login ?? 'ghost',
            state: r.state as Review['state'],
            submittedAt: r.submitted_at!,
            body: r.body ?? '',
          }),
        );
      pr.comments = [...reviewComments, ...issueComments].map(toComment).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      pulls.push(pr);
    }
    for (const p of closed) {
      if (p.closed_at && new Date(p.closed_at) >= since) pulls.push(toPull(repo, p));
    }
  }
  return { pulls };
}
