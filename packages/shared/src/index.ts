import { z } from 'zod';
import type { Band } from './band';

export * from './band';
export * from './messages';

// zod probes for eval to compile parsers, which the web's CSP reports as a violation
z.config({ jitless: true });

// The one place to rename a new project. API mails and web titles read it.
export const APP_NAME = 'findyourlogic';

// Section of the family colour band for this product, see DESIGN.md
export const APP_BAND: Band = { from: 3.6, to: 4.2 };

// True once the project is live as 1.0 (README, "Live als 1.0"). From then on
// the bug button waits for the test mode switch, see testMode in the web's feedback.svelte.ts.
export const LIVE = false;

export type User = {
  id: string;
  // An account has an email address, a Nostr key or both
  email: string | null;
  npub: string | null;
  name: string;
  // Opt-in, see Art. 9 GDPR: bubbles can reveal political opinions
  discoverable: boolean;
  onboarded: boolean;
};

// Custom error messages are keys of messages.ts, the API translates them.
const email = z.string().trim().toLowerCase().pipe(z.email('invalidEmail'));

export const magicLinkSchema = z.object({
  email,
  // Page to return to after login, see safeNextPath
  next: z.string().max(2000).optional(),
});

export const verifySchema = z.object({
  token: z.string().min(1).max(200),
});

export const loginCodeSchema = z.object({ email });

export const verifyCodeSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'codeDigits'),
});

export const addEmailSchema = z.object({ email });

// A signed Nostr event (NIP-98 style) carrying the challenge from the API
export const nostrLoginSchema = z.object({
  event: z.object({
    id: z.string().regex(/^[0-9a-f]{64}$/),
    pubkey: z.string().regex(/^[0-9a-f]{64}$/),
    created_at: z.number().int(),
    kind: z.number().int(),
    tags: z.array(z.array(z.string().max(500)).max(5)).max(10),
    content: z.string().max(500),
    sig: z.string().regex(/^[0-9a-f]{128}$/),
  }),
});

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  discoverable: z.boolean().optional(),
});

// What web and app send along with feedback. The API adds its own version.
export const feedbackContextSchema = z.object({
  platform: z.enum(['web', 'ios', 'android']),
  page: z.string().max(500),
  // App build; the web runs the same commit as the API
  version: z.string().max(100).optional(),
  device: z.string().max(300),
  viewport: z.string().max(50),
  locale: z.string().max(10),
  // Failed API calls as "METHOD /path → status", newest first
  errors: z.array(z.string().max(300)).max(5),
});

export type FeedbackContext = z.infer<typeof feedbackContextSchema>;

export const feedbackSchema = z.object({
  kind: z.enum(['bug', 'idea']),
  message: z.string().trim().min(5, 'feedbackTooShort').max(5000),
  // PNG or JPEG, up to about 5 MB
  screenshot: z.base64().max(7_000_000).optional(),
  context: feedbackContextSchema,
});

// Bubbles and interests are the traits people match on. Shared traits below
// MIN_SHARED only show as a count. A request goes out once SUPPORTERS_NEEDED
// members of the asking bubble have joined it.
export const MIN_SHARED = 3;
export const SUPPORTERS_NEEDED = 3;

// Signer apps answer the login QR code here (NIP-46), and request notes go
// out here. Also in connect-src in apps/web/svelte.config.js.
export const NOSTR_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

// Bubble colours, picked when a bubble is created
export const BUBBLE_COLORS = [
  '#e8870e',
  '#c2362c',
  '#2a7a69',
  '#5b8a32',
  '#6a4cc2',
  '#2c5fae',
  '#c04d93',
  '#3f9a5b',
  '#8a6d3b',
  '#2f8fbf',
] as const;

export const FORMATS = ['online', 'onsite', 'written'] as const;
export type Format = (typeof FORMATS)[number];

// Views, then only questions, then each side sums up the other's view
export const PHASES = ['views', 'questions', 'summary'] as const;
export type Phase = (typeof PHASES)[number];
export type Side = 'from' | 'to';

// Free-text interests match case-insensitively
export const interestKey = (label: string) => label.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

const interest = z.string().trim().min(1).max(40);

export const traitsSchema = z.object({
  // Memberships that count as traits; the others stay hidden from matching
  bubbleIds: z.array(z.uuid()).max(100),
  interests: z.array(interest).max(30),
});

export const bubbleSchema = z.object({
  name: z.string().trim().min(2, 'nameTooShort').max(80),
  color: z.enum(BUBBLE_COLORS),
  description: z.string().trim().max(500).default(''),
});

export const requestSchema = z
  .object({
    fromBubbleId: z.uuid(),
    // An existing bubble, or the name of one that isn't here yet: it is
    // created empty and gets the invite link
    toBubbleId: z.uuid().optional(),
    newBubbleName: z.string().trim().min(2, 'nameTooShort').max(80).optional(),
    question: z.string().trim().min(10, 'questionTooShort').max(200),
    details: z.string().trim().max(2000).default(''),
    format: z.enum(FORMATS),
    place: z.string().trim().max(200).default(''),
    startsAt: z.iso.datetime({ offset: true }),
    seats: z.number().int().min(SUPPORTERS_NEEDED).max(8),
    nostrNote: z.boolean().default(false),
  })
  .refine((r) => !!r.toBubbleId !== !!r.newBubbleName, 'pickTarget');

export const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const summarySchema = z.object({ body: z.string().trim().min(10, 'summaryTooShort').max(2000) });

export const roundUpdateSchema = z.object({
  phase: z.enum(PHASES).optional(),
  videoUrl: z.union([z.url({ protocol: /^https$/ }), z.literal('')]).optional(),
});

export const matchBubbleSchema = z.object({
  name: z.string().trim().min(2, 'nameTooShort').max(80),
  traits: z.array(z.string().max(100)).min(MIN_SHARED).max(20),
});

export type BubbleRef = { id: string; name: string; color: string };

export type MyBubble = BubbleRef & {
  description: string;
  members: number;
  asTrait: boolean;
  openRequests: number;
  rounds: number;
  inviteToken: string;
};

export type Invitation = BubbleRef & { description: string; invitedBy: string | null };

export type RequestCard = {
  id: string;
  from: BubbleRef;
  to: BubbleRef;
  question: string;
  format: Format;
  place: string;
  startsAt: string;
  seats: number;
  fromCount: number;
  toCount: number;
  sentAt: string | null;
  acceptedAt: string | null;
  doneAt: string | null;
  // The current user's side, if they joined
  mySide: Side | null;
};

export type Person = { id: string; name: string };

export type RequestDetail = RequestCard & {
  details: string;
  // Announced as a Nostr note once it goes out
  nostrNote: boolean;
  // Which side the current user may join, if any
  canJoin: Side | null;
  // Names only for members of either bubble
  fromPeople: Person[];
  toPeople: Person[];
  toInviteToken: string | null;
};

export type RoundMessage = { id: string; phase: Phase; body: string; createdAt: string; author: Person; side: Side };

export type Summary = {
  side: Side;
  body: string;
  author: string | null;
  confirmedBy: string | null;
};

export type Round = RequestDetail & {
  phase: Phase;
  videoUrl: string;
  messages: RoundMessage[];
  summaries: Summary[];
};

export type Trait = { key: string; label: string; color: string | null };

export type MatchPerson = Person & { shared: Trait[] };

export type Combo = { traits: Trait[]; count: number; isNew: boolean };

export type Venn = {
  traits: Trait[];
  // Counts of discoverable people, by bitmask of traits 1..7
  regions: Record<string, number>;
};

export type Matches = {
  discoverable: boolean;
  combos: Combo[];
  people: MatchPerson[];
  // People sharing fewer traits, only counted
  fewer: number;
};

export type Conversation = { person: Person; last: string; lastAt: string; unread: number };
export type DirectMessage = { id: string; mine: boolean; body: string; createdAt: string };

export type Badges = {
  requests: number;
  newMatches: number;
  // The combination the board's hint names
  newMatchCombo: Combo | null;
  unread: number;
  invitations: number;
};

// A path on this site to return to after login. Anything that would resolve to
// another origin (//host, /\host, or tabs and newlines that browsers strip) is
// dropped, so a crafted link can't redirect elsewhere.
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value?.startsWith('/')) return null;
  try {
    const url = new URL(value, 'http://localhost');
    return url.origin === 'http://localhost' ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}
