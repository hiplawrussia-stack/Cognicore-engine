/**
 * EVENT STORE TESTS
 * ===================
 * Comprehensive tests for CogniCore Event Store
 *
 * БФ "Другой путь" | БАЙТ Cognitive Core v1.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  InMemoryEventStore,
  InMemoryAuditLogger,
  createInMemoryEventStore,
  createInMemoryAuditLogger,
} from '../EventStore';
import type { IDomainEvent } from '../../integration/ICognitiveCoreAPI';
import { createEventMetadata } from '../IEvents';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestEvent(
  eventType: string = 'TEST_EVENT',
  aggregateId: string = 'test-aggregate-1'
): IDomainEvent {
  return {
    eventId: uuidv4(),
    eventType,
    aggregateId,
    aggregateType: 'test',
    timestamp: new Date(),
    version: 1,
    payload: { data: 'test data', timestamp: Date.now() },
    metadata: createEventMetadata('test'),
  };
}

// ============================================================================
// IN-MEMORY EVENT STORE TESTS
// ============================================================================

describe('InMemoryEventStore', () => {
  let eventStore: InMemoryEventStore;

  beforeEach(() => {
    eventStore = createInMemoryEventStore();
  });

  describe('append', () => {
    it('should append event and return stored event', async () => {
      const event = createTestEvent();
      const stored = await eventStore.append(event);

      expect(stored.id).toBeDefined();
      expect(stored.event).toEqual(event);
      expect(stored.sequenceNumber).toBe(1);
      expect(stored.globalSequence).toBe(1);
      expect(stored.storedAt).toBeInstanceOf(Date);
      expect(stored.checksum).toBeDefined();
    });

    it('should increment sequence numbers correctly', async () => {
      const event1 = createTestEvent('EVENT_1', 'agg-1');
      const event2 = createTestEvent('EVENT_2', 'agg-1');
      const event3 = createTestEvent('EVENT_3', 'agg-2');

      const stored1 = await eventStore.append(event1);
      const stored2 = await eventStore.append(event2);
      const stored3 = await eventStore.append(event3);

      // Sequence within aggregate
      expect(stored1.sequenceNumber).toBe(1);
      expect(stored2.sequenceNumber).toBe(2);
      expect(stored3.sequenceNumber).toBe(1);

      // Global sequence
      expect(stored1.globalSequence).toBe(1);
      expect(stored2.globalSequence).toBe(2);
      expect(stored3.globalSequence).toBe(3);
    });

    it('should reject append to shredded aggregate', async () => {
      const event = createTestEvent();
      await eventStore.append(event);
      await eventStore.cryptoShred(event.aggregateId);

      const newEvent = createTestEvent('NEW_EVENT', event.aggregateId);
      await expect(eventStore.append(newEvent)).rejects.toThrow('crypto-shredded');
    });
  });

  describe('appendBatch', () => {
    it('should append multiple events atomically', async () => {
      const events = [
        createTestEvent('EVENT_1', 'agg-1'),
        createTestEvent('EVENT_2', 'agg-1'),
        createTestEvent('EVENT_3', 'agg-1'),
      ];

      const stored = await eventStore.appendBatch(events);

      expect(stored).toHaveLength(3);
      expect(stored[0]?.sequenceNumber).toBe(1);
      expect(stored[1]?.sequenceNumber).toBe(2);
      expect(stored[2]?.sequenceNumber).toBe(3);
    });
  });

  describe('getEvents', () => {
    it('should return events for aggregate', async () => {
      const aggId = 'test-aggregate';
      await eventStore.append(createTestEvent('EVENT_1', aggId));
      await eventStore.append(createTestEvent('EVENT_2', aggId));
      await eventStore.append(createTestEvent('EVENT_3', 'other-aggregate'));

      const events = await eventStore.getEvents(aggId);

      expect(events).toHaveLength(2);
      expect(events[0]?.event.eventType).toBe('EVENT_1');
      expect(events[1]?.event.eventType).toBe('EVENT_2');
    });

    it('should return events from version', async () => {
      const aggId = 'test-aggregate';
      await eventStore.append(createTestEvent('EVENT_1', aggId));
      await eventStore.append(createTestEvent('EVENT_2', aggId));
      await eventStore.append(createTestEvent('EVENT_3', aggId));

      const events = await eventStore.getEvents(aggId, 1);

      expect(events).toHaveLength(2);
      expect(events[0]?.event.eventType).toBe('EVENT_2');
      expect(events[1]?.event.eventType).toBe('EVENT_3');
    });

    it('should return empty for shredded aggregate', async () => {
      const event = createTestEvent();
      await eventStore.append(event);
      await eventStore.cryptoShred(event.aggregateId);

      const events = await eventStore.getEvents(event.aggregateId);
      expect(events).toHaveLength(0);
    });
  });

  describe('queryEvents', () => {
    beforeEach(async () => {
      // Setup test data
      await eventStore.append(createTestEvent('EVENT_A', 'agg-1'));
      await eventStore.append(createTestEvent('EVENT_B', 'agg-1'));
      await eventStore.append(createTestEvent('EVENT_A', 'agg-2'));
      await eventStore.append(createTestEvent('EVENT_C', 'agg-2'));
    });

    it('should filter by aggregate ID', async () => {
      const events = await eventStore.queryEvents({ aggregateId: 'agg-1' });
      expect(events).toHaveLength(2);
    });

    it('should filter by event types', async () => {
      const events = await eventStore.queryEvents({ eventTypes: ['EVENT_A'] });
      expect(events).toHaveLength(2);
    });

    it('should support pagination', async () => {
      const page1 = await eventStore.queryEvents({ limit: 2, offset: 0 });
      const page2 = await eventStore.queryEvents({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0]?.id).not.toBe(page2[0]?.id);
    });

    it('should sort by global sequence', async () => {
      const eventsAsc = await eventStore.queryEvents({ order: 'asc' });
      const eventsDesc = await eventStore.queryEvents({ order: 'desc' });

      expect(eventsAsc[0]?.globalSequence).toBeLessThan(eventsAsc[3]?.globalSequence ?? 0);
      expect(eventsDesc[0]?.globalSequence).toBeGreaterThan(eventsDesc[3]?.globalSequence ?? 0);
    });
  });

  describe('getEventsByType', () => {
    it('should return events of specific type', async () => {
      await eventStore.append(createTestEvent('TARGET_EVENT', 'agg-1'));
      await eventStore.append(createTestEvent('OTHER_EVENT', 'agg-1'));
      await eventStore.append(createTestEvent('TARGET_EVENT', 'agg-2'));

      const events = await eventStore.getEventsByType('TARGET_EVENT');

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.event.eventType === 'TARGET_EVENT')).toBe(true);
    });
  });

  describe('Snapshots', () => {
    it('should create and retrieve snapshot', async () => {
      const state = { count: 10, lastUpdated: new Date() };

      const snapshot = await eventStore.createSnapshot(
        'agg-1',
        'test',
        state,
        5
      );

      expect(snapshot.aggregateId).toBe('agg-1');
      expect(snapshot.version).toBe(5);
      expect(snapshot.state).toEqual(state);
      expect(snapshot.checksum).toBeDefined();

      const retrieved = await eventStore.getSnapshot('agg-1');
      expect(retrieved).toEqual(snapshot);
    });

    it('should return null for non-existent snapshot', async () => {
      const snapshot = await eventStore.getSnapshot('non-existent');
      expect(snapshot).toBeNull();
    });

    it('should return null for shredded aggregate snapshot', async () => {
      await eventStore.createSnapshot('agg-1', 'test', {}, 1);
      await eventStore.append(createTestEvent('EVENT', 'agg-1'));
      await eventStore.cryptoShred('agg-1');

      const snapshot = await eventStore.getSnapshot('agg-1');
      expect(snapshot).toBeNull();
    });
  });

  describe('Counts', () => {
    it('should return event count for aggregate', async () => {
      await eventStore.append(createTestEvent('EVENT_1', 'agg-1'));
      await eventStore.append(createTestEvent('EVENT_2', 'agg-1'));
      await eventStore.append(createTestEvent('EVENT_3', 'agg-2'));

      expect(await eventStore.getEventCount('agg-1')).toBe(2);
      expect(await eventStore.getEventCount('agg-2')).toBe(1);
      expect(await eventStore.getEventCount('non-existent')).toBe(0);
    });

    it('should return total event count', async () => {
      await eventStore.append(createTestEvent('EVENT_1', 'agg-1'));
      await eventStore.append(createTestEvent('EVENT_2', 'agg-1'));
      await eventStore.append(createTestEvent('EVENT_3', 'agg-2'));

      expect(await eventStore.getTotalEventCount()).toBe(3);
    });
  });

  describe('cryptoShred', () => {
    it('should mark aggregate as shredded', async () => {
      const aggId = 'agg-to-shred';
      await eventStore.append(createTestEvent('EVENT_1', aggId));
      await eventStore.append(createTestEvent('EVENT_2', aggId));

      const shreddedCount = await eventStore.cryptoShred(aggId);

      expect(shreddedCount).toBe(2);
      expect(await eventStore.getEvents(aggId)).toHaveLength(0);
      expect(await eventStore.getEventCount(aggId)).toBe(0);
    });
  });

  describe('verifyIntegrity', () => {
    it('should verify valid event checksum', async () => {
      const event = createTestEvent();
      const stored = await eventStore.append(event);

      const isValid = await eventStore.verifyIntegrity(stored.id);
      expect(isValid).toBe(true);
    });

    it('should return false for non-existent event', async () => {
      const isValid = await eventStore.verifyIntegrity('non-existent-id');
      expect(isValid).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', async () => {
      await eventStore.append(createTestEvent('EVENT_1', 'agg-1'));
      await eventStore.append(createTestEvent('EVENT_2', 'agg-2'));
      await eventStore.createSnapshot('agg-1', 'test', {}, 1);
      await eventStore.cryptoShred('agg-2');

      const stats = eventStore.getStatistics();

      expect(stats.totalEvents).toBe(2);
      expect(stats.totalAggregates).toBe(2);
      expect(stats.totalSnapshots).toBe(1);
      expect(stats.shreddedAggregates).toBe(1);
    });
  });
});

// ============================================================================
// AUDIT LOGGER TESTS
// ============================================================================

describe('InMemoryAuditLogger', () => {
  let auditLogger: InMemoryAuditLogger;

  beforeEach(() => {
    auditLogger = createInMemoryAuditLogger();
  });

  describe('log', () => {
    it('should log entry with generated id and timestamp', async () => {
      await auditLogger.log({
        eventType: 'TEST_EVENT',
        eventId: 'event-123',
        action: 'publish',
        resource: 'event/test',
        outcome: 'success',
        correlationId: 'corr-123',
      });

      const entries = await auditLogger.query({});
      expect(entries).toHaveLength(1);
      expect(entries[0]?.id).toBeDefined();
      expect(entries[0]?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await auditLogger.log({
        eventType: 'EVENT_A',
        eventId: 'e1',
        userId: 'user-1',
        action: 'publish',
        resource: 'r1',
        outcome: 'success',
        correlationId: 'c1',
      });
      await auditLogger.log({
        eventType: 'EVENT_B',
        eventId: 'e2',
        userId: 'user-2',
        action: 'handle',
        resource: 'r2',
        outcome: 'failure',
        correlationId: 'c2',
      });
      await auditLogger.log({
        eventType: 'EVENT_A',
        eventId: 'e3',
        userId: 'user-1',
        action: 'store',
        resource: 'r3',
        outcome: 'success',
        correlationId: 'c3',
      });
    });

    it('should filter by userId', async () => {
      const entries = await auditLogger.query({ userId: 'user-1' });
      expect(entries).toHaveLength(2);
    });

    it('should filter by eventType', async () => {
      const entries = await auditLogger.query({ eventType: 'EVENT_A' });
      expect(entries).toHaveLength(2);
    });

    it('should filter by action', async () => {
      const entries = await auditLogger.query({ action: 'publish' });
      expect(entries).toHaveLength(1);
    });

    it('should filter by outcome', async () => {
      const entries = await auditLogger.query({ outcome: 'failure' });
      expect(entries).toHaveLength(1);
    });

    it('should support pagination', async () => {
      const page1 = await auditLogger.query({ limit: 2, offset: 0 });
      const page2 = await auditLogger.query({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });
  });

  describe('count', () => {
    it('should return total count', async () => {
      await auditLogger.log({
        eventType: 'E1',
        eventId: 'e1',
        action: 'publish',
        resource: 'r1',
        outcome: 'success',
        correlationId: 'c1',
      });
      await auditLogger.log({
        eventType: 'E2',
        eventId: 'e2',
        action: 'publish',
        resource: 'r2',
        outcome: 'success',
        correlationId: 'c2',
      });

      expect(await auditLogger.count()).toBe(2);
    });
  });

  describe('export', () => {
    it('should export as NDJSON', async () => {
      await auditLogger.log({
        eventType: 'E1',
        eventId: 'e1',
        action: 'publish',
        resource: 'r1',
        outcome: 'success',
        correlationId: 'c1',
      });
      await auditLogger.log({
        eventType: 'E2',
        eventId: 'e2',
        action: 'handle',
        resource: 'r2',
        outcome: 'success',
        correlationId: 'c2',
      });

      const exported = await auditLogger.export({});
      const lines = exported.split('\n');

      expect(lines).toHaveLength(2);
      expect(() => JSON.parse(lines[0] ?? '')).not.toThrow();
      expect(() => JSON.parse(lines[1] ?? '')).not.toThrow();
    });
  });
});
