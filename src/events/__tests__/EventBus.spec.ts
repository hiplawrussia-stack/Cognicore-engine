/**
 * EVENT BUS TESTS
 * =================
 * Comprehensive tests for CogniCore Event Bus
 *
 * БФ "Другой путь" | БАЙТ Cognitive Core v1.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  CogniCoreEventBus,
  createEventBus,
  createInitializedEventBus,
} from '../EventBus';
import {
  InMemoryEventStore,
  InMemoryAuditLogger,
} from '../EventStore';
import {
  LoggingBehavior,
  ValidationBehavior,
  MetricsBehavior,
} from '../behaviors';
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
    payload: { data: 'test data' },
    metadata: createEventMetadata('test'),
  };
}

function createCrisisEvent(): IDomainEvent {
  return {
    eventId: uuidv4(),
    eventType: 'CRISIS_DETECTED',
    aggregateId: 'user-123',
    aggregateType: 'user_session',
    timestamp: new Date(),
    version: 1,
    payload: {
      userId: 'user-123',
      sessionId: 'session-456',
      riskLevel: 0.85,
      triggerIndicators: ['suicidal_language'],
      recommendedAction: 'immediate_response',
      crisisType: 'suicidal_ideation',
    },
    metadata: createEventMetadata('crisis-detector', {
      userId: 'user-123',
      sessionId: 'session-456',
    }),
  };
}

// ============================================================================
// EVENT BUS TESTS
// ============================================================================

describe('CogniCoreEventBus', () => {
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

  describe('Basic Functionality', () => {
    it('should create event bus with default config', () => {
      const bus = createEventBus();
      expect(bus).toBeInstanceOf(CogniCoreEventBus);
    });

    it('should publish event to subscribers', async () => {
      const event = createTestEvent();
      const handler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('TEST_EVENT', handler);
      await eventBus.publish(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support multiple subscribers for same event type', async () => {
      const event = createTestEvent();
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('TEST_EVENT', handler1);
      eventBus.subscribe('TEST_EVENT', handler2);
      await eventBus.publish(event);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should not call handler for different event type', async () => {
      const event = createTestEvent('OTHER_EVENT');
      const handler = vi.fn();

      eventBus.subscribe('TEST_EVENT', handler);
      await eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should unsubscribe correctly', async () => {
      const event = createTestEvent();
      const handler = vi.fn();

      const subscription = eventBus.subscribe('TEST_EVENT', handler);
      subscription.unsubscribe();
      await eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should clear all subscriptions', async () => {
      const event = createTestEvent();
      const handler = vi.fn();

      eventBus.subscribe('TEST_EVENT', handler);
      eventBus.clearAll();
      await eventBus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Subscription Management', () => {
    it('should return subscription with unique ID', () => {
      const handler = vi.fn();

      const sub1 = eventBus.subscribe('EVENT_1', handler);
      const sub2 = eventBus.subscribe('EVENT_2', handler);

      expect(sub1.id).toBeDefined();
      expect(sub2.id).toBeDefined();
      expect(sub1.id).not.toBe(sub2.id);
    });

    it('should track subscription count', () => {
      const handler = vi.fn();

      expect(eventBus.getSubscriptionCount()).toBe(0);

      eventBus.subscribe('EVENT_1', handler);
      expect(eventBus.getSubscriptionCount()).toBe(1);

      eventBus.subscribe('EVENT_2', handler);
      expect(eventBus.getSubscriptionCount()).toBe(2);
    });

    it('should get handler count for event type', () => {
      const handler = vi.fn();

      expect(eventBus.getHandlerCount('TEST_EVENT')).toBe(0);

      eventBus.subscribe('TEST_EVENT', handler);
      expect(eventBus.getHandlerCount('TEST_EVENT')).toBe(1);

      eventBus.subscribe('TEST_EVENT', handler);
      expect(eventBus.getHandlerCount('TEST_EVENT')).toBe(2);
    });

    it('should check if event type has handlers', () => {
      const handler = vi.fn();

      expect(eventBus.hasHandlers('TEST_EVENT')).toBe(false);

      eventBus.subscribe('TEST_EVENT', handler);
      expect(eventBus.hasHandlers('TEST_EVENT')).toBe(true);
    });

    it('should get registered event types', () => {
      const handler = vi.fn();

      eventBus.subscribe('EVENT_1', handler);
      eventBus.subscribe('EVENT_2', handler);
      eventBus.subscribe('EVENT_3', handler);

      const types = eventBus.getRegisteredEventTypes();
      expect(types).toContain('EVENT_1');
      expect(types).toContain('EVENT_2');
      expect(types).toContain('EVENT_3');
    });

    it('should subscribe to multiple event types', () => {
      const handler = vi.fn();

      const subscriptions = eventBus.subscribeMany(
        ['EVENT_1', 'EVENT_2', 'EVENT_3'],
        handler
      );

      expect(subscriptions).toHaveLength(3);
      expect(eventBus.hasHandlers('EVENT_1')).toBe(true);
      expect(eventBus.hasHandlers('EVENT_2')).toBe(true);
      expect(eventBus.hasHandlers('EVENT_3')).toBe(true);
    });
  });

  describe('publishWithResult', () => {
    it('should return detailed dispatch result', async () => {
      const event = createTestEvent();
      const handler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('TEST_EVENT', handler);
      const result = await eventBus.publishWithResult(event);

      expect(result.eventId).toBe(event.eventId);
      expect(result.eventType).toBe('TEST_EVENT');
      expect(result.handlersInvoked).toBe(1);
      expect(result.handlersSucceeded).toBe(1);
      expect(result.handlersFailed).toBe(0);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track failed handlers', async () => {
      const event = createTestEvent();
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      eventBus.subscribe('TEST_EVENT', failingHandler, {
        retry: { maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 },
      });

      await expect(eventBus.publish(event)).rejects.toThrow('All event handlers failed');
    });
  });

  describe('With Event Store', () => {
    let eventStore: InMemoryEventStore;

    beforeEach(async () => {
      eventStore = new InMemoryEventStore();
      eventBus = createEventBus({ enablePersistence: true });
      await eventBus.initialize(eventStore);
    });

    it('should persist events to store', async () => {
      const event = createTestEvent();
      const handler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('TEST_EVENT', handler);
      const result = await eventBus.publishWithResult(event);

      expect(result.stored).toBe(true);
      expect(result.storageId).toBeDefined();

      const storedEvents = await eventStore.getEvents(event.aggregateId);
      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0]?.event.eventId).toBe(event.eventId);
    });
  });

  describe('With Audit Logger', () => {
    let auditLogger: InMemoryAuditLogger;

    beforeEach(async () => {
      auditLogger = new InMemoryAuditLogger();
      eventBus = createEventBus({ enableAuditLog: true });
      await eventBus.initialize(undefined, auditLogger);
    });

    it('should log events to audit logger', async () => {
      const event = createTestEvent();
      const handler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('TEST_EVENT', handler);
      await eventBus.publish(event);

      const logs = await auditLogger.query({});
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// PIPELINE BEHAVIOR TESTS
// ============================================================================

describe('Pipeline Behaviors', () => {
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

      const event = createTestEvent();
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);
      await eventBus.publish(event);

      expect(logger.debug).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('ValidationBehavior', () => {
    it('should validate required fields', async () => {
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
        aggregateType: 'test',
        timestamp: new Date(),
        version: 1,
        payload: {},
        metadata: createEventMetadata('test'),
      } as IDomainEvent;

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await expect(eventBus.publish(invalidEvent)).rejects.toThrow('validation failed');
    });

    it('should pass valid events', async () => {
      const behavior = new ValidationBehavior();
      const eventBus = createEventBus({
        behaviors: [behavior],
        enablePersistence: false,
        enableAuditLog: false,
      });

      const event = createTestEvent();
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await expect(eventBus.publish(event)).resolves.not.toThrow();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('MetricsBehavior', () => {
    it('should collect metrics', async () => {
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

      const event = createTestEvent();
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);
      await eventBus.publish(event);

      expect(collector.incrementCounter).toHaveBeenCalledWith(
        'events.published',
        expect.any(Object)
      );
      expect(collector.recordHistogram).toHaveBeenCalledWith(
        'events.duration_ms',
        expect.any(Number),
        expect.any(Object)
      );
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Event System Integration', () => {
  it('should create initialized event bus with store and logger', async () => {
    const eventStore = new InMemoryEventStore();
    const auditLogger = new InMemoryAuditLogger();

    const eventBus = await createInitializedEventBus(
      { enablePersistence: true, enableAuditLog: true },
      eventStore,
      auditLogger
    );

    const event = createTestEvent();
    const handler = vi.fn().mockResolvedValue(undefined);
    eventBus.subscribe('TEST_EVENT', handler);
    await eventBus.publish(event);

    expect(handler).toHaveBeenCalled();

    const storedEvents = await eventStore.getEvents(event.aggregateId);
    expect(storedEvents).toHaveLength(1);
  });

  it('should handle crisis events with priority', async () => {
    const eventBus = createEventBus({
      enablePersistence: false,
      enableAuditLog: false,
    });

    const callOrder: string[] = [];

    eventBus.subscribe('CRISIS_DETECTED', async () => {
      callOrder.push('crisis-handler');
    }, { priority: 1 });

    eventBus.subscribe('CRISIS_DETECTED', async () => {
      callOrder.push('analytics-handler');
    }, { priority: 100 });

    const crisisEvent = createCrisisEvent();
    await eventBus.publish(crisisEvent);

    expect(callOrder[0]).toBe('crisis-handler');
    expect(callOrder[1]).toBe('analytics-handler');
  });
});
