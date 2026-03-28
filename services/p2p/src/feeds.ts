/**
 * Corestore initialization and named feed management (T056).
 * Manages the four CIG feeds: cig-entities, cig-relationships,
 * cig-changelog, cig-snapshots.
 */

import Corestore from 'corestore';
import Hyperbee from 'hyperbee';
import Hyperdrive from 'hyperdrive';
import { FEED_NAMES, type FeedName } from '@cig/p2p-protocol';

export interface FeedSet {
  store: Corestore;
  entities: Hyperbee;
  relationships: Hyperbee;
  changelog: ReturnType<Corestore['get']>;
  snapshots: Hyperdrive;
}

export interface FeedInfo {
  name: FeedName;
  publicKey: string;
  length: number;
  writable: boolean;
}

let feedSet: FeedSet | null = null;

/**
 * Initialize the Corestore and open all named feeds.
 * @param storagePath - Filesystem path for Corestore data
 */
export async function initFeeds(storagePath: string): Promise<FeedSet> {
  if (feedSet) return feedSet;

  const store = new Corestore(storagePath);
  await store.ready();

  // Entity and relationship Hyperbees share the same Corestore
  const entitiesCore = store.get({ name: FEED_NAMES.ENTITIES });
  const relationshipsCore = store.get({ name: FEED_NAMES.RELATIONSHIPS });
  const changelogCore = store.get({ name: FEED_NAMES.CHANGELOG });

  await Promise.all([entitiesCore.ready(), relationshipsCore.ready(), changelogCore.ready()]);

  const entities = new Hyperbee(entitiesCore, {
    keyEncoding: 'utf-8',
    valueEncoding: 'json',
  });
  const relationships = new Hyperbee(relationshipsCore, {
    keyEncoding: 'utf-8',
    valueEncoding: 'json',
  });

  await Promise.all([entities.ready(), relationships.ready()]);

  const snapshots = new Hyperdrive(store, { name: FEED_NAMES.SNAPSHOTS });
  await snapshots.ready();

  feedSet = { store, entities, relationships, changelog: changelogCore, snapshots };
  return feedSet;
}

/**
 * Get the current FeedSet. Throws if not initialized.
 */
export function getFeeds(): FeedSet {
  if (!feedSet) throw new Error('Feeds not initialized. Call initFeeds() first.');
  return feedSet;
}

/**
 * Get information about all managed feeds.
 */
export async function getFeedInfos(): Promise<FeedInfo[]> {
  const fs = getFeeds();
  const entCore = fs.entities.core;
  const relCore = fs.relationships.core;
  const chgCore = fs.changelog;
  const snapCore = fs.snapshots.core;

  await Promise.all([entCore.ready(), relCore.ready(), chgCore.ready(), snapCore.ready()]);

  return [
    {
      name: FEED_NAMES.ENTITIES,
      publicKey: entCore.key?.toString('hex') ?? '',
      length: entCore.length ?? 0,
      writable: entCore.writable ?? false,
    },
    {
      name: FEED_NAMES.RELATIONSHIPS,
      publicKey: relCore.key?.toString('hex') ?? '',
      length: relCore.length ?? 0,
      writable: relCore.writable ?? false,
    },
    {
      name: FEED_NAMES.CHANGELOG,
      publicKey: chgCore.key?.toString('hex') ?? '',
      length: chgCore.length ?? 0,
      writable: chgCore.writable ?? false,
    },
    {
      name: FEED_NAMES.SNAPSHOTS,
      publicKey: snapCore.key?.toString('hex') ?? '',
      length: snapCore.length ?? 0,
      writable: snapCore.writable ?? false,
    },
  ];
}

/**
 * Close all feeds and the Corestore.
 */
export async function closeFeeds(): Promise<void> {
  if (!feedSet) return;
  const fs = feedSet;
  feedSet = null;

  await fs.snapshots.close();
  await fs.entities.close();
  await fs.relationships.close();
  await fs.changelog.close();
  await fs.store.close();
}
