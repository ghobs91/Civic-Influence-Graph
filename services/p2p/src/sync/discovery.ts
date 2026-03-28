/**
 * Hyperswarm discovery (T061).
 * Announce on main CIG topic, per-feed topics, handle peer connections
 * and Noise-encrypted streams.
 */

import Hyperswarm from 'hyperswarm';
import { mainDiscoveryTopic, feedDiscoveryTopic, FEED_NAMES } from '@cig/p2p-protocol';
import type { FeedSet } from '../feeds.js';

export interface DiscoveryManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly peerCount: number;
  readonly isActive: boolean;
}

export interface PeerStats {
  totalConnections: number;
  activePeers: number;
  topics: number;
}

/**
 * Create a Hyperswarm-based discovery manager.
 * Announces on the main CIG topic and per-feed topics, replicates Corestore on connect.
 */
export function createDiscovery(feedSet: FeedSet): DiscoveryManager {
  const swarm = new Hyperswarm();
  let active = false;
  let connections = 0;

  // Replicate the Corestore on every peer connection
  swarm.on('connection', (socket: any) => {
    connections++;
    feedSet.store.replicate(socket);
  });

  async function start(): Promise<void> {
    if (active) return;
    active = true;

    // Join the main CIG discovery topic (all nodes announce here)
    const mainTopic = mainDiscoveryTopic();
    swarm.join(mainTopic, { server: true, client: true });

    // Join per-feed topics while seeding
    const entCore = feedSet.entities.core;
    const relCore = feedSet.relationships.core;
    const chgCore = feedSet.changelog;

    await Promise.all([entCore.ready(), relCore.ready(), chgCore.ready()]);

    if (entCore.key) {
      swarm.join(feedDiscoveryTopic(entCore.key), { server: true, client: true });
    }
    if (relCore.key) {
      swarm.join(feedDiscoveryTopic(relCore.key), { server: true, client: true });
    }
    if (chgCore.key) {
      swarm.join(feedDiscoveryTopic(chgCore.key), { server: true, client: true });
    }

    await swarm.flush();
  }

  async function stop(): Promise<void> {
    if (!active) return;
    active = false;
    await swarm.destroy();
  }

  return {
    start,
    stop,
    get peerCount() {
      return connections;
    },
    get isActive() {
      return active;
    },
  };
}
