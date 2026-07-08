import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

/** Singleton-ish key/value settings (admin password hash, global defaults). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * A registered WebAuthn (passkey) credential used to authenticate the admin.
 * There is a single logical admin; multiple credentials allow several
 * devices/passkeys (and backups). Public keys and signature counters are kept
 * to verify assertions and mitigate replay attacks.
 */
export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey(),
  /** Base64URL-encoded raw credential ID reported by the authenticator. */
  credentialId: text('credential_id').notNull().unique(),
  /** Base64URL-encoded COSE public key. */
  publicKey: text('public_key').notNull(),
  /** Signature counter last seen from the authenticator. */
  counter: integer('counter').notNull().default(0),
  /** JSON array of authenticator transports (usb, internal, hybrid, ...). */
  transports: text('transports'),
  /** Whether this is a multi-device (synced) passkey. */
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  /** User-supplied friendly label. */
  name: text('name').notNull().default('Passkey'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
});

/**
 * A subscription site whose authenticated session is used to fetch full
 * articles. `storageState` holds the Playwright storageState JSON (cookies +
 * localStorage), optionally encrypted at rest.
 */
export const sites = sqliteTable('sites', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain').notNull(),
  loginUrl: text('login_url'),
  /** JSON string (possibly encrypted) of Playwright storageState. */
  storageState: text('storage_state'),
  /** Whether storageState is encrypted with SESSION_ENCRYPTION_KEY. */
  storageEncrypted: integer('storage_encrypted', { mode: 'boolean' }).notNull().default(false),
  /** unknown | valid | expired | error */
  sessionStatus: text('session_status').notNull().default('unknown'),
  /** Optional URL loaded to verify the session is still logged in. */
  validationUrl: text('validation_url'),
  /** CSS selector or text that, if present, indicates a logged-in session. */
  loggedInSelector: text('logged_in_selector'),
  lastValidatedAt: integer('last_validated_at', { mode: 'timestamp' }),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** A source feed to proxy into a full-text feed. */
export const feeds = sqliteTable(
  'feeds',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sourceUrl: text('source_url').notNull(),
    siteId: text('site_id').references(() => sites.id, { onDelete: 'set null' }),
    /** readability | selector */
    extractionMode: text('extraction_mode').notNull().default('readability'),
    /** JSON: { contentSelector, removeSelectors[], waitForSelector, waitMs }. */
    selectorConfig: text('selector_config'),
    /** rss | atom | json — default output format. */
    outputFormat: text('output_format').notNull().default('rss'),
    /** Unguessable token embedded in the public feed URL. */
    accessToken: text('access_token').notNull(),
    /** Cron-ish refresh interval in minutes. */
    refreshIntervalMinutes: integer('refresh_interval_minutes').notNull().default(60),
    /** Max items to keep/emit for this feed. */
    maxItems: integer('max_items').notNull().default(50),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastRefreshedAt: integer('last_refreshed_at', { mode: 'timestamp' }),
    lastError: text('last_error'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    tokenIdx: uniqueIndex('feeds_access_token_idx').on(t.accessToken),
  }),
);

/** A cached, full-text-extracted article belonging to a feed. */
export const articles = sqliteTable(
  'articles',
  {
    id: text('id').primaryKey(),
    feedId: text('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    /** Stable identity from the source feed (guid or link). */
    guid: text('guid').notNull(),
    url: text('url').notNull(),
    title: text('title'),
    author: text('author'),
    summary: text('summary'),
    /** Extracted, sanitized full-text HTML. */
    contentHtml: text('content_html'),
    /** Hash of extracted content to detect changes. */
    contentHash: text('content_hash'),
    /** pending | ok | failed | skipped */
    extractionStatus: text('extraction_status').notNull().default('pending'),
    extractionError: text('extraction_error'),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    feedGuidIdx: uniqueIndex('articles_feed_guid_idx').on(t.feedId, t.guid),
    feedPublishedIdx: index('articles_feed_published_idx').on(t.feedId, t.publishedAt),
  }),
);

/** Per-refresh job log for observability. */
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  feedId: text('feed_id')
    .notNull()
    .references(() => feeds.id, { onDelete: 'cascade' }),
  /** running | success | error */
  status: text('status').notNull().default('running'),
  itemsSeen: integer('items_seen').notNull().default(0),
  itemsExtracted: integer('items_extracted').notNull().default(0),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
