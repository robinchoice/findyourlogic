import type { FeedbackContext } from '@app/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Stored lowercase, see the email schema in @app/shared. Nostr accounts may have none.
  email: varchar('email', { length: 255 }).unique(),
  // bech32 public key of Nostr logins
  npub: varchar('npub', { length: 63 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  // Opt-in: only discoverable people show up in matches
  discoverable: boolean('discoverable').default(false).notNull(),
  onboardedAt: timestamp('onboarded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const magicLinks = pgTable('magic_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  // Set when a logged-in account adds this address instead of logging in
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Mobile apps log in with a code from the mail, a link can't open the app
export const loginCodes = pgTable('login_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Counters of lib/rate-limit.ts in the API
export const rateLimits = pgTable('rate_limits', {
  key: varchar('key', { length: 300 }).primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at').notNull(),
});

// Keys the API generates on first use, so every instance shares them and no
// deployment has to set them. `altcha` signs the challenges of lib/altcha.ts.
export const serverSecrets = pgTable('server_secrets', {
  name: varchar('name', { length: 50 }).primaryKey(),
  value: varchar('value', { length: 128 }).notNull(),
});

// Bug reports and ideas from the feedback button, also mailed and filed as
// GitHub issues. Only admins fetch the screenshot by its id.
export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: varchar('kind', { length: 10 }).notNull(),
  message: text('message').notNull(),
  screenshot: bytea('screenshot'),
  context: jsonb('context').$type<FeedbackContext & { api: string }>().notNull(),
  issueUrl: varchar('issue_url', { length: 300 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// One-time challenges a Nostr login signs
export const nostrChallenges = pgTable('nostr_challenges', {
  challenge: varchar('challenge', { length: 64 }).primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
});

// Groups that exist elsewhere (a Stammtisch, a Telegram or Nostr group).
// People join through the invite link.
export const bubbles = pgTable(
  'bubbles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    color: varchar('color', { length: 7 }).notNull(),
    description: text('description').default('').notNull(),
    inviteToken: varchar('invite_token', { length: 32 }).notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('bubbles_name_lower').on(sql`lower(${t.name})`)],
);

export const bubbleMembers = pgTable(
  'bubble_members',
  {
    bubbleId: uuid('bubble_id')
      .references(() => bubbles.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    // Counts as a trait for matches. Members can hide single bubbles.
    asTrait: boolean('as_trait').default(true).notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.bubbleId, t.userId] })],
);

// From a match: everyone in it is invited to the new bubble
export const bubbleInvitations = pgTable(
  'bubble_invitations',
  {
    bubbleId: uuid('bubble_id')
      .references(() => bubbles.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.bubbleId, t.userId] })],
);

// Self-chosen interests. No opinions or stances are stored anywhere.
export const interests = pgTable(
  'interests',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    // interestKey() of the label
    key: varchar('key', { length: 60 }).notNull(),
    label: varchar('label', { length: 40 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// Matches the user has seen, so the board can point out new ones
export const matchesSeen = pgTable(
  'matches_seen',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    otherId: uuid('other_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.otherId] })],
);

// A request from one bubble to another. It goes out once SUPPORTERS_NEEDED
// members of the asking bubble joined, it is accepted once the other bubble
// filled its seats. From then on it is a round with three phases.
export const requests = pgTable('requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromBubbleId: uuid('from_bubble_id')
    .references(() => bubbles.id, { onDelete: 'cascade' })
    .notNull(),
  toBubbleId: uuid('to_bubble_id')
    .references(() => bubbles.id, { onDelete: 'cascade' })
    .notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  question: varchar('question', { length: 200 }).notNull(),
  details: text('details').default('').notNull(),
  format: varchar('format', { length: 10 }).notNull(),
  place: varchar('place', { length: 200 }).default('').notNull(),
  startsAt: timestamp('starts_at').notNull(),
  // Per side
  seats: integer('seats').notNull(),
  // Opt-in of the asking side: once out, the app announces it as a Nostr note
  nostrNote: boolean('nostr_note').default(false).notNull(),
  sentAt: timestamp('sent_at'),
  acceptedAt: timestamp('accepted_at'),
  phase: varchar('phase', { length: 12 }).default('views').notNull(),
  videoUrl: varchar('video_url', { length: 500 }).default('').notNull(),
  doneAt: timestamp('done_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const requestParticipants = pgTable(
  'request_participants',
  {
    requestId: uuid('request_id')
      .references(() => requests.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    side: varchar('side', { length: 4 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId] })],
);

export const roundMessages = pgTable('round_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id')
    .references(() => requests.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  phase: varchar('phase', { length: 12 }).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Each side sums up the other side's view, the other side confirms it
export const roundSummaries = pgTable(
  'round_summaries',
  {
    requestId: uuid('request_id')
      .references(() => requests.id, { onDelete: 'cascade' })
      .notNull(),
    // The side that wrote it
    side: varchar('side', { length: 4 }).notNull(),
    body: text('body').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.side] })],
);

// "Say hello" from a match, a plain 1:1 thread
export const directMessages = pgTable('direct_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromId: uuid('from_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  toId: uuid('to_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  body: text('body').notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
