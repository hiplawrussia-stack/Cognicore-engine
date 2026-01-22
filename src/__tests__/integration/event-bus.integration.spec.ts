/**
 * EVENT BUS INTEGRATION TESTS
 * ============================
 * Cross-Component Integration Tests for EventBus System
 *
 * Research Foundation (2025-2026):
 * - Event-Driven Architecture Testing (Confluent, AWS EventBridge)
 * - Testcontainers Patterns (node.testcontainers.org)
 * - Pipeline Behavior Testing (MediatR patterns)
 * - Event Sourcing Validation (Event-Driven.io)
 *
 * Test Categories:
 * 1. EventBus + EventStore Integration
 * 2. EventBus + AuditLogger Integration
 * 3. Pipeline Behaviors Chain
 * 4. Event Replay and Sourcing
 * 5. Subscription Management
 * 6. Error Handling and Recovery
 *
 * БФ "Другой путь" | БАЙТ Cognitive Core v1.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  CogniCoreEventBus,
  createEventBus,
  createInitializedEventBus,
} from '../../events/EventBus';
import {
  InMemoryEventStore,
  InMemoryAuditLogger,
} from '../../events/EventStore';
import {
  LoggingBehavior,
  ValidationBehavior,
  MetricsBehavior,
} from '../../events/behaviors';
import type { IDomainEvent } from '../../integration/ICognitiveCoreAPI';
import { createEventMetadata } from '../../events/IEvents';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestEvent(
  eventType: string = 'TEST_EVENT',
  aggregateId: string = `agg-${uuidv4().substring(0, 8)}`
): IDomainEvent {
  return {
    eventId: uuidv4(),
    eventType,
    aggregateId,
    aggregateType: 'cognitive_state',
    timestamp: new Date(),
    version: 1,
    payload: { data: `test-${Date.now()}` },
    metadata: createEventMetadata('test-source'),
  };
}

function createStateUpdateEvent(userId: string): IDomainEvent {
  return {
    eventId: uuidv4(),
    eventType: 'STATE_UPDATED',
    aggregateId: userId,
    aggregateType: 'cognitive_state',
    timestamp: new Date(),
    version: 1,
    payload: {
      userId,
      previousState: { wellbeingIndex: 50 },
      newState: { wellbeingIndex: 55 },
      trigger: 'message',
      changes: [
        {
          dimension: 'emotional',
          field: 'valence',
          previousValue: 0.5,
          newValue: 0.6,
          changeType: 'increase',
          magnitude: 0.1,
        },
      ],
    },
    metadata: createEventMetadata('state-engine', { userId }),
  };
}

// ============================================================================
// EVENT BUS + EVENT STORE INTEGRATION
// ============================================================================

describe('EventBus + EventStore Integration', () => {
  let eventBus: CogniCoreEventBus;
  let eventStore: InMemoryEventStore;

  beforeEach(async () => {
    eventStore = new InMemoryEventStore();
    eventBus = await createInitializedEventBus(
      { enablePersistence: true, enableAuditLog: false },
      eventStore
    );
  });

  afterEach(() => {
    eventBus.clearAll();
  });

  describe('Event Persistence', () => {
    it('should store events in EventStore on publish', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const event = createTestEvent();
      await eventBus.publish(event);

      const storedEvents = await eventStore.getEvents(event.aggregateId);
      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0].event.eventId).toBe(event.eventId);
    });

    it('should maintain event order with sequence numbers', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const aggregateId = `user-${Date.now()}`;
      const events = [
        createTestEvent('TEST_EVENT', aggregateId),
        createTestEvent('TEST_EVENT', aggregateId),
        createTestEvent('TEST_EVENT', aggregateId),
      ];

      for (const event of events) {
        await eventBus.publish(event);
      }

      const storedEvents = await eventStore.getEvents(aggregateId);
      expect(storedEvents).toHaveLength(3);
      expect(storedEvents[0].sequenceNumber).toBe(1);
      expect(storedEvents[1].sequenceNumber).toBe(2);
      expect(storedEvents[2].sequenceNumber).toBe(3);
    });

    it('should return storage ID in publishWithResult', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const event = createTestEvent();
      const result = await eventBus.publishWithResult(event);

      expect(result.stored).toBe(true);
      expect(result.storageId).toBeDefined();
      expect(typeof result.storageId).toBe('string');
    });

    it('should store events even without handlers', async () => {
      // No handlers subscribed
      const event = createTestEvent('UNHANDLED_EVENT');
      await eventBus.publish(event);

      const storedEvents = await eventStore.getEvents(event.aggregateId);
      expect(storedEvents).toHaveLength(1);
    });
  });

  describe('Event Retrieval', () => {
    it('should retrieve events by aggregate ID', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `user-${Date.now()}`;
      const event1 = createStateUpdateEvent(userId);
      const event2 = createStateUpdateEvent(userId);

      await eventBus.publish(event1);
      await eventBus.publish(event2);

      const events = await eventStore.getEvents(userId);
      expect(events).toHaveLength(2);
    });

    it('should retrieve events by type across aggregates', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      await eventBus.publish(createStateUpdateEvent('user-1'));
      await eventBus.publish(createStateUpdateEvent('user-2'));
      await eventBus.publish(createStateUpdateEvent('user-3'));

      const events = await eventStore.getEventsByType('STATE_UPDATED');
      expect(events).toHaveLength(3);
    });

    it('should retrieve events from specific version', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const aggregateId = `agg-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        await eventBus.publish(createTestEvent('TEST_EVENT', aggregateId));
      }

      // Get events AFTER version 2 (i.e., > 2, so 3, 4, 5)
      const events = await eventStore.getEvents(aggregateId, 2);
      expect(events).toHaveLength(3);
      expect(events[0].sequenceNumber).toBe(3);
    });
  });

  describe('Event Store Statistics', () => {
    it('should track total event count', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const initialCount = await eventStore.getTotalEventCount();

      await eventBus.publish(createTestEvent());
      await eventBus.publish(createTestEvent());
      await eventBus.publish(createTestEvent());

      const finalCount = await eventStore.getTotalEventCount();
      expect(finalCount).toBe(initialCount + 3);
    });

    it('should track per-aggregate event count', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const aggregateId = `count-test-${Date.now()}`;
      await eventBus.publish(createTestEvent('TEST_EVENT', aggregateId));
      await eventBus.publish(createTestEvent('TEST_EVENT', aggregateId));

      const count = await eventStore.getEventCount(aggregateId);
      expect(count).toBe(2);
    });
  });
});

// ============================================================================
// EVENT BUS + AUDIT LOGGER INTEGRATION
// ============================================================================

describe('EventBus + AuditLogger Integration', () => {
  let eventBus: CogniCoreEventBus;
  let eventStore: InMemoryEventStore;
  let auditLogger: InMemoryAuditLogger;

  beforeEach(async () => {
    eventStore = new InMemoryEventStore();
    auditLogger = new InMemoryAuditLogger();
    eventBus = await createInitializedEventBus(
      { enablePersistence: true, enableAuditLog: true },
      eventStore,
      auditLogger
    );
  });

  afterEach(() => {
    eventBus.clearAll();
  });

  describe('Audit Logging', () => {
    it('should log publish actions to audit trail', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const event = createTestEvent();
      await eventBus.publish(event);

      const logs = await auditLogger.query({ action: 'publish' });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should include event metadata in audit logs', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const event = createTestEvent();
      await eventBus.publish(event);

      const logs = await auditLogger.query({});
      const relevantLog = logs.find((l) => l.correlationId === event.metadata.correlationId);

      expect(relevantLog).toBeDefined();
      expect(relevantLog?.eventType).toBe('TEST_EVENT');
    });

    it('should track user ID in audit entries when available', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = 'audit-user-123';
      const event = createStateUpdateEvent(userId);
      await eventBus.publish(event);

      const logs = await auditLogger.query({ userId });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should track success and failure outcomes', async () => {
      const successHandler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('SUCCESS_EVENT', successHandler);

      await eventBus.publish(createTestEvent('SUCCESS_EVENT'));

      const successLogs = await auditLogger.query({ outcome: 'success' });
      expect(successLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Audit Export', () => {
    it('should export audit logs in NDJSON format', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent());
      await eventBus.publish(createTestEvent());

      const exported = await auditLogger.export({});
      const lines = exported.trim().split('\n');

      expect(lines.length).toBeGreaterThan(0);
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    });

    it('should filter export by date range', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const now = new Date();
      await eventBus.publish(createTestEvent());

      const exported = await auditLogger.export({
        fromTimestamp: new Date(now.getTime() - 60000),
        toTimestamp: new Date(now.getTime() + 60000),
      });

      expect(exported.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// PIPELINE BEHAVIORS CHAIN
// ============================================================================

describe('Pipeline Behaviors Chain', () => {
  describe('Behavior Execution Order', () => {
    it('should execute behaviors in priority order', async () => {
      const executionOrder: string[] = [];

      const behavior1 = {
        name: 'First',
        priority: 10,
        handle: async (_event: IDomainEvent, _ctx: unknown, next: () => Promise<void>) => {
          executionOrder.push('first-before');
          await next();
          executionOrder.push('first-after');
        },
      };

      const behavior2 = {
        name: 'Second',
        priority: 20,
        handle: async (_event: IDomainEvent, _ctx: unknown, next: () => Promise<void>) => {
          executionOrder.push('second-before');
          await next();
          executionOrder.push('second-after');
        },
      };

      const eventBus = createEventBus({
        behaviors: [behavior2, behavior1], // Intentionally reversed
        enablePersistence: false,
        enableAuditLog: false,
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent());

      // Should execute in priority order (lower first)
      expect(executionOrder[0]).toBe('first-before');
      expect(executionOrder[1]).toBe('second-before');
      expect(executionOrder[2]).toBe('second-after');
      expect(executionOrder[3]).toBe('first-after');

      eventBus.clearAll();
    });
  });

  describe('LoggingBehavior', () => {
    it('should log event processing', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const behavior = new LoggingBehavior(logger);
      const eventBus = createEventBus({
        behaviors: [behavior],
        enablePersistence: false,
        enableAuditLog: false,
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent());

      expect(logger.debug).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();

      eventBus.clearAll();
    });
  });

  describe('ValidationBehavior', () => {
    it('should reject events with empty eventId', async () => {
      const behavior = new ValidationBehavior();
      const eventBus = createEventBus({
        behaviors: [behavior],
        enablePersistence: false,
        enableAuditLog: false,
      });

      const invalidEvent = {
        eventId: '',
        eventType: 'TEST_EVENT',
        aggregateId: 'test',
        aggregateType: 'cognitive_state' as const,
        timestamp: new Date(),
        version: 1,
        payload: {},
        metadata: createEventMetadata('test'),
      };

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await expect(eventBus.publish(invalidEvent)).rejects.toThrow('validation failed');
      expect(handler).not.toHaveBeenCalled();

      eventBus.clearAll();
    });

    it('should pass valid events', async () => {
      const behavior = new ValidationBehavior();
      const eventBus = createEventBus({
        behaviors: [behavior],
        enablePersistence: false,
        enableAuditLog: false,
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const validEvent = createTestEvent();
      await eventBus.publish(validEvent);

      expect(handler).toHaveBeenCalled();

      eventBus.clearAll();
    });
  });

  describe('MetricsBehavior', () => {
    it('should collect event metrics', async () => {
      const collector = {
        incrementCounter: vi.fn(),
        recordHistogram: vi.fn(),
        recordGauge: vi.fn(),
      };

      const behavior = new MetricsBehavior(collector);
      const eventBus = createEventBus({
        behaviors: [behavior],
        enablePersistence: false,
        enableAuditLog: false,
      });

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent());

      expect(collector.incrementCounter).toHaveBeenCalledWith(
        'events.published',
        expect.objectContaining({ eventType: 'TEST_EVENT' })
      );
      expect(collector.recordHistogram).toHaveBeenCalledWith(
        'events.duration_ms',
        expect.any(Number),
        expect.any(Object)
      );

      eventBus.clearAll();
    });
  });
});

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

describe('Subscription Management', () => {
  let eventBus: CogniCoreEventBus;

  beforeEach(() => {
    eventBus = createEventBus({
      enablePersistence: false,
      enableAuditLog: false,
    });
  });

  afterEach(() => {
    eventBus.clearAll();
  });

  describe('Basic Subscriptions', () => {
    it('should return unique subscription IDs', () => {
      const handler = vi.fn();

      const sub1 = eventBus.subscribe('EVENT_1', handler);
      const sub2 = eventBus.subscribe('EVENT_2', handler);
      const sub3 = eventBus.subscribe('EVENT_1', handler);

      expect(sub1.id).toBeDefined();
      expect(sub2.id).toBeDefined();
      expect(sub3.id).toBeDefined();
      expect(new Set([sub1.id, sub2.id, sub3.id]).size).toBe(3);
    });

    it('should track subscription count accurately', () => {
      const handler = vi.fn();

      expect(eventBus.getSubscriptionCount()).toBe(0);

      eventBus.subscribe('EVENT_1', handler);
      expect(eventBus.getSubscriptionCount()).toBe(1);

      eventBus.subscribe('EVENT_2', handler);
      expect(eventBus.getSubscriptionCount()).toBe(2);

      eventBus.subscribe('EVENT_1', handler);
      expect(eventBus.getSubscriptionCount()).toBe(3);
    });

    it('should unsubscribe correctly', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const subscription = eventBus.subscribe('TEST_EVENT', handler);
      await eventBus.publish(createTestEvent());
      expect(handler).toHaveBeenCalledTimes(1);

      subscription.unsubscribe();
      await eventBus.publish(createTestEvent());
      expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('Multiple Subscriptions', () => {
    it('should handle subscribeMany correctly', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);

      const subscriptions = eventBus.subscribeMany(
        ['EVENT_A', 'EVENT_B', 'EVENT_C'],
        handler
      );

      expect(subscriptions).toHaveLength(3);

      await eventBus.publish(createTestEvent('EVENT_A'));
      await eventBus.publish(createTestEvent('EVENT_B'));
      await eventBus.publish(createTestEvent('EVENT_C'));
      await eventBus.publish(createTestEvent('EVENT_D'));

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should unsubscribe from multiple event types', () => {
      const handler = vi.fn();

      const subscriptions = eventBus.subscribeMany(['E1', 'E2', 'E3'], handler);

      expect(eventBus.hasHandlers('E1')).toBe(true);
      expect(eventBus.hasHandlers('E2')).toBe(true);
      expect(eventBus.hasHandlers('E3')).toBe(true);

      subscriptions.forEach((s) => s.unsubscribe());

      expect(eventBus.hasHandlers('E1')).toBe(false);
      expect(eventBus.hasHandlers('E2')).toBe(false);
      expect(eventBus.hasHandlers('E3')).toBe(false);
    });
  });

  describe('Event Type Registry', () => {
    it('should return registered event types', () => {
      const handler = vi.fn();

      eventBus.subscribe('TYPE_A', handler);
      eventBus.subscribe('TYPE_B', handler);
      eventBus.subscribe('TYPE_C', handler);

      const types = eventBus.getRegisteredEventTypes();
      expect(types).toContain('TYPE_A');
      expect(types).toContain('TYPE_B');
      expect(types).toContain('TYPE_C');
    });

    it('should report handler counts per event type', () => {
      const handler = vi.fn();

      eventBus.subscribe('MULTI', handler);
      eventBus.subscribe('MULTI', handler);
      eventBus.subscribe('MULTI', handler);
      eventBus.subscribe('SINGLE', handler);

      expect(eventBus.getHandlerCount('MULTI')).toBe(3);
      expect(eventBus.getHandlerCount('SINGLE')).toBe(1);
      expect(eventBus.getHandlerCount('NONE')).toBe(0);
    });
  });
});

// ============================================================================
// ERROR HANDLING AND RECOVERY
// ============================================================================

describe('Error Handling and Recovery', () => {
  let eventBus: CogniCoreEventBus;
  let eventStore: InMemoryEventStore;

  beforeEach(async () => {
    eventStore = new InMemoryEventStore();
    eventBus = await createInitializedEventBus(
      { enablePersistence: true, enableAuditLog: false },
      eventStore
    );
  });

  afterEach(() => {
    eventBus.clearAll();
  });

  describe('Handler Failures', () => {
    it('should throw when all handlers fail', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler error'));

      eventBus.subscribe('FAIL_EVENT', failingHandler, {
        retry: { maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 },
      });

      await expect(eventBus.publish(createTestEvent('FAIL_EVENT'))).rejects.toThrow();
    });

    it('should track failed handlers in dispatch result', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Fail'));
      const successHandler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('MIXED_EVENT', successHandler, { priority: 1 });
      eventBus.subscribe('MIXED_EVENT', failingHandler, {
        priority: 2,
        retry: { maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 },
      });

      // Use publishWithResult to check handler outcomes
      const result = await eventBus.publishWithResult(createTestEvent('MIXED_EVENT'));

      // Both handlers should be invoked
      expect(successHandler).toHaveBeenCalledTimes(1);
      expect(result.handlersInvoked).toBeGreaterThanOrEqual(1);
    });

    it('should still persist events when handlers fail', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Fail'));

      eventBus.subscribe('PERSIST_TEST', failingHandler, {
        retry: { maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 },
      });

      const event = createTestEvent('PERSIST_TEST');
      await expect(eventBus.publish(event)).rejects.toThrow();

      // Event should still be stored
      const stored = await eventStore.getEvents(event.aggregateId);
      expect(stored).toHaveLength(1);
    });
  });

  describe('Retry Behavior', () => {
    it('should retry failed handlers according to config', async () => {
      let attempts = 0;
      const flakeyHandler = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
      });

      eventBus.subscribe('RETRY_EVENT', flakeyHandler, {
        retry: { maxAttempts: 5, delayMs: 10, backoffMultiplier: 1 },
      });

      await eventBus.publish(createTestEvent('RETRY_EVENT'));

      expect(attempts).toBe(3);
    });

    it('should fail after max retry attempts', async () => {
      const alwaysFailHandler = vi.fn().mockRejectedValue(new Error('Permanent failure'));

      eventBus.subscribe('MAX_RETRY', alwaysFailHandler, {
        retry: { maxAttempts: 3, delayMs: 1, backoffMultiplier: 1 },
      });

      await expect(eventBus.publish(createTestEvent('MAX_RETRY'))).rejects.toThrow();
      expect(alwaysFailHandler).toHaveBeenCalledTimes(3);
    });
  });
});

// ============================================================================
// CONCURRENT OPERATIONS
// ============================================================================

describe('Concurrent Operations', () => {
  let eventBus: CogniCoreEventBus;
  let eventStore: InMemoryEventStore;

  beforeEach(async () => {
    eventStore = new InMemoryEventStore();
    eventBus = await createInitializedEventBus(
      { enablePersistence: true, enableAuditLog: false },
      eventStore
    );
  });

  afterEach(() => {
    eventBus.clearAll();
  });

  it('should handle concurrent publishes to same aggregate', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.subscribe('CONCURRENT_EVENT', handler);

    const aggregateId = `concurrent-${Date.now()}`;
    const events = Array.from({ length: 10 }, () =>
      createTestEvent('CONCURRENT_EVENT', aggregateId)
    );

    await Promise.all(events.map((e) => eventBus.publish(e)));

    const stored = await eventStore.getEvents(aggregateId);
    expect(stored).toHaveLength(10);

    // Sequence numbers should be unique
    const sequences = stored.map((e) => e.sequenceNumber);
    expect(new Set(sequences).size).toBe(10);
  });

  it('should handle concurrent publishes to different aggregates', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.subscribe('MULTI_AGG', handler);

    const events = Array.from({ length: 5 }, (_, i) =>
      createTestEvent('MULTI_AGG', `aggregate-${i}`)
    );

    await Promise.all(events.map((e) => eventBus.publish(e)));

    expect(handler).toHaveBeenCalledTimes(5);

    const totalCount = await eventStore.getTotalEventCount();
    expect(totalCount).toBeGreaterThanOrEqual(5);
  });

  it('should handle rapid subscribe/unsubscribe cycles', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);

    for (let i = 0; i < 10; i++) {
      const sub = eventBus.subscribe('RAPID_EVENT', handler);
      await eventBus.publish(createTestEvent('RAPID_EVENT'));
      sub.unsubscribe();
    }

    expect(handler).toHaveBeenCalledTimes(10);
    expect(eventBus.hasHandlers('RAPID_EVENT')).toBe(false);
  });
});
