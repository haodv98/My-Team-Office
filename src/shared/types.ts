// Kiểu dùng chung giữa server và web.

export type Role = string;

export interface Member {
  key: string;
  display: string;
  backlogUserId: number;
  github: string[];
  role: Role;
  avatarUrl?: string;
}

export type ProgressBucket = 'todo' | 'doing' | 'done' | 'closed';

export interface Task {
  number: number;
  key: string;
  title: string;
  assigneeId: number | null;
  status: string;
  bucket: ProgressBucket;
  milestoneIds: number[];
  updatedAt: string;
  url: string;
}

export interface Milestone {
  id: number;
  name: string;
  start: string;
  due: string;
}

export interface Review {
  id: number;
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
  submittedAt: string;
  body: string;
}

export interface PrComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  branch: string;
  body: string;
  author: string;
  draft: boolean;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  closedAt: string | null;
  requestedReviewers: string[];
  requestedTeams: string[];
  reviews: Review[];
  comments: PrComment[];
  url: string;
}

export interface BacklogComment {
  id: number;
  taskNumber: number;
  authorId: number;
  notifiedIds: number[];
  createdAt: string;
  body: string;
  url: string;
}

export interface GithubData {
  pulls: PullRequest[];
}

export interface BacklogData {
  users: { id: number; name: string; iconUrl?: string }[];
  milestones: Milestone[];
  tasks: Task[];
  comments: BacklogComment[];
}

export interface Actor {
  memberKey: string | null;
  login: string;
  viaAgent: boolean;
}

export type WaitKind = 'review' | 'fix' | 'gh_mention' | 'backlog_notify';

export interface WaitItem {
  id: string;
  kind: WaitKind;
  recipient: string;
  sender: Actor;
  since: string;
  stale: boolean;
  title: string;
  url: string;
}

export interface DeskPr {
  repo: string;
  number: number;
  title: string;
  url: string;
  draft: boolean;
  taskNumbers: number[];
}

export interface Desk {
  member: Member;
  doingTasks: Task[];
  otherTasks: Task[];
  prs: DeskPr[];
  waits: WaitItem[];
}

export interface MilestoneProgress {
  milestone: Milestone;
  counts: Record<ProgressBucket, number>;
  percentClosed: number;
  daysLeft: number;
}

export type OfficeEventType =
  | 'pr_opened'
  | 'pr_merged'
  | 'pr_closed'
  | 'review'
  | 'gh_comment'
  | 'review_requested'
  | 'backlog_comment'
  | 'task_status';

export interface OfficeEvent {
  id: string;
  type: OfficeEventType;
  at: string;
  from: string | null;
  to: string[];
  title: string;
  url: string;
  viaAgent?: boolean;
}

export interface Snapshot {
  version: 1;
  generatedAt: string;
  desks: Desk[];
  unassigned: { prs: DeskPr[]; waits: WaitItem[] };
  teamWaits: { team: string; pr: DeskPr }[];
  progress: MilestoneProgress[];
  events: OfficeEvent[];
  staleSources: ('github' | 'backlog')[];
  unmappedLogins: string[];
  unmappedMembers: string[];
}
