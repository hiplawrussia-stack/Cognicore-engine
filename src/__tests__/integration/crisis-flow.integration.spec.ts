/**
 * CRISIS FLOW INTEGRATION TESTS
 * ==============================
 * Safety-Critical Integration Tests for Crisis Detection Pipeline
 *
 * Research Foundation (2025-2026):
 * - Event-Driven Testing Best Practices (Optiblack, Confluent)
 * - HIPAA Audit Trail Requirements (45 C.F.R. § 164.312(b))
 * - Crisis Detection Accuracy Standards (JMIR Mental Health 2025)
 * - Handler Priority Patterns (MediatR, Event-Driven.io)
 *
 * Test Categories:
 * 1. Crisis Event Priority (MUST be handled first)
 * 2. Crisis Handler Callbacks (notify, escalate, log)
 * 3. Escalation Threshold Logic
 * 4. Crisis Event Persistence
 * 5. Audit Trail Compliance
 *
 * Priority: HIGHEST - These tests validate safety-critical paths
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
  CrisisEventHandler,
  type ICrisisNotificationCallback,
} from '../../events/handlers';
import type { IDomainEvent, ICrisisDetectedEvent } from '../../integration/ICognitiveCoreAPI';
import { createEventMetadata } from '../../events/IEvents';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a crisis event with specified parameters
 */
function createCrisisEvent(
  options: {
    riskLevel?: number;
    recommendedAction?: 'immediate_response' | 'escalate' | 'monitor';
    crisisType?: 'self_harm' | 'suicidal_ideation' | 'acute_distress' | 'panic';
    userId?: string;
    sessionId?: string;
    triggerIndicators?: string[];
  } = {}
): ICrisisDetectedEvent {
  const {
    riskLevel = 0.85,
    recommendedAction = 'immediate_response',
    crisisType = 'suicidal_ideation',
    userId = `user-${uuidv4().substring(0, 8)}`,
    sessionId = `session-${uuidv4().substring(0, 8)}`,
    triggerIndicators = ['suicidal_language', 'hopelessness'],
  } = options;

  return {
    eventId: uuidv4(),
    eventType: 'CRISIS_DETECTED',
    aggregateId: userId,
    aggregateType: 'user_session',
    timestamp: new Date(),
    version: 1,
    payload: {
      userId,
      sessionId,
      riskLevel,
      triggerIndicators,
      recommendedAction,
      crisisType,
    },
    metadata: createEventMetadata('crisis-detector', {
      userId,
      sessionId,
    }),
  };
}

/**
 * Create a generic test event
 */
function createTestEvent(
  eventType: string = 'TEST_EVENT',
  aggregateId: string = 'test-aggregate'
): IDomainEvent {
  return {
    eventId: uuidv4(),
    eventType,
    aggregateId,
    aggregateType: 'cognitive_state',
    timestamp: new Date(),
    version: 1,
    payload: { data: 'test' },
    metadata: createEventMetadata('test'),
  };
}

/**
 * Create mock crisis notification callback
 */
function createMockCrisisCallback(): ICrisisNotificationCallback & {
  notifyCalls: ICrisisDetectedEvent[];
  escalateCalls: ICrisisDetectedEvent[];
  logCalls: ICrisisDetectedEvent[];
  reset: () => void;
} {
  const notifyCalls: ICrisisDetectedEvent[] = [];
  const escalateCalls: ICrisisDetectedEvent[] = [];
  const logCalls: ICrisisDetectedEvent[] = [];

  return {
    notifyCalls,
    escalateCalls,
    logCalls,
    reset: () => {
      notifyCalls.length = 0;
      escalateCalls.length = 0;
      logCalls.length = 0;
    },
    notify: vi.fn(async (event: ICrisisDetectedEvent) => {
      notifyCalls.push(event);
    }),
    escalate: vi.fn(async (event: ICrisisDetectedEvent) => {
      escalateCalls.push(event);
    }),
    log: vi.fn(async (event: ICrisisDetectedEvent) => {
      logCalls.push(event);
    }),
  };
}

// ============================================================================
// CRISIS FLOW INTEGRATION TESTS
// ============================================================================

describe('Crisis Flow Integration Tests', () => {
  let eventBus: CogniCoreEventBus;
  let eventStore: InMemoryEventStore;
  let auditLogger: InMemoryAuditLogger;
  let crisisCallback: ReturnType<typeof createMockCrisisCallback>;

  beforeEach(async () => {
    eventStore = new InMemoryEventStore();
    auditLogger = new InMemoryAuditLogger();
    crisisCallback = createMockCrisisCallback();

    eventBus = await createInitializedEventBus(
      {
        enablePersistence: true,
        enableAuditLog: true,
      },
      eventStore,
      auditLogger
    );
  });

  afterEach(() => {
    eventBus.clearAll();
    crisisCallback.reset();
  });

  // ==========================================================================
  // 1. CRISIS EVENT PRIORITY TESTS
  // ==========================================================================

  describe('1. Crisis Event Priority', () => {
    it('should execute crisis handler before other handlers', async () => {
      const executionOrder: string[] = [];

      // Register crisis handler with priority 1 (highest)
      eventBus.subscribe(
        'CRISIS_DETECTED',
        async () => {
          executionOrder.push('crisis-handler');
        },
        { priority: 1 }
      );

      // Register analytics handler with priority 100 (lower)
      eventBus.subscribe(
        'CRISIS_DETECTED',
        async () => {
          executionOrder.push('analytics-handler');
        },
        { priority: 100 }
      );

      // Register logging handler with priority 50
      eventBus.subscribe(
        'CRISIS_DETECTED',
        async () => {
          executionOrder.push('logging-handler');
        },
        { priority: 50 }
      );

      const crisisEvent = createCrisisEvent();
      await eventBus.publish(crisisEvent);

      // Crisis handler MUST execute first
      expect(executionOrder[0]).toBe('crisis-handler');
      expect(executionOrder[1]).toBe('logging-handler');
      expect(executionOrder[2]).toBe('analytics-handler');
    });

    it('should execute all crisis handlers synchronously', async () => {
      const handler = new CrisisEventHandler(crisisCallback, 0.7);
      eventBus.subscribe('CRISIS_DETECTED', handler.handle.bind(handler), { priority: 1 });

      const crisisEvent = createCrisisEvent({ riskLevel: 0.85 });
      await eventBus.publish(crisisEvent);

      // All callbacks should have been called
      expect(crisisCallback.notify).toHaveBeenCalledTimes(1);
      expect(crisisCallback.log).toHaveBeenCalledTimes(1);
      expect(crisisCallback.escalate).toHaveBeenCalledTimes(1);
    });

    it('should handle crisis events with higher priority than state updates', async () => {
      const executionOrder: string[] = [];

      // State handler
      eventBus.subscribe(
        'STATE_UPDATED',
        async () => {
          executionOrder.push('state-handler');
        },
        { priority: 10 }
      );

      // Crisis handler
      eventBus.subscribe(
        'CRISIS_DETECTED',
        async () => {
          executionOrder.push('crisis-handler');
        },
        { priority: 1 }
      );

      // Publish state event first
      const stateEvent = createTestEvent('STATE_UPDATED');
      await eventBus.publish(stateEvent);

      // Then publish crisis event
      const crisisEvent = createCrisisEvent();
      await eventBus.publish(crisisEvent);

      // Both should be processed in order of publication
      expect(executionOrder).toEqual(['state-handler', 'crisis-handler']);
    });
  });

  // ==========================================================================
  // 2. CRISIS HANDLER CALLBACKS
  // ==========================================================================

  describe('2. Crisis Handler Callbacks', () => {
    let handler: CrisisEventHandler;

    beforeEach(() => {
      handler = new CrisisEventHandler(crisisCallback, 0.7);
      eventBus.subscribe('CRISIS_DETECTED', handler.handle.bind(handler), { priority: 1 });
    });

    it('should always call log callback for compliance', async () => {
      const crisisEvent = createCrisisEvent({ riskLevel: 0.3 }); // Low risk
      await eventBus.publish(crisisEvent);

      expect(crisisCallback.log).toHaveBeenCalledTimes(1);
      expect(crisisCallback.logCalls[0]).toEqual(crisisEvent);
    });

    it('should always call notify callback', async () => {
      const crisisEvent = createCrisisEvent({ riskLevel: 0.5 });
      await eventBus.publish(crisisEvent);

      expect(crisisCallback.notify).toHaveBeenCalledTimes(1);
      expect(crisisCallback.notifyCalls[0]).toEqual(crisisEvent);
    });

    it('should escalate when risk level exceeds threshold', async () => {
      const highRiskEvent = createCrisisEvent({ riskLevel: 0.85 });
      await eventBus.publish(highRiskEvent);

      expect(crisisCallback.escalate).toHaveBeenCalledTimes(1);
      expect(crisisCallback.escalateCalls[0]).toEqual(highRiskEvent);
    });

    it('should not escalate when risk level is below threshold', async () => {
      const lowRiskEvent = createCrisisEvent({
        riskLevel: 0.5,
        recommendedAction: 'monitor',
      });
      await eventBus.publish(lowRiskEvent);

      expect(crisisCallback.escalate).not.toHaveBeenCalled();
    });

    it('should escalate on immediate_response action regardless of risk level', async () => {
      const urgentEvent = createCrisisEvent({
        riskLevel: 0.4, // Below threshold
        recommendedAction: 'immediate_response',
      });
      await eventBus.publish(urgentEvent);

      expect(crisisCallback.escalate).toHaveBeenCalledTimes(1);
    });

    it('should escalate on escalate action regardless of risk level', async () => {
      const escalateEvent = createCrisisEvent({
        riskLevel: 0.3, // Below threshold
        recommendedAction: 'escalate',
      });
      await eventBus.publish(escalateEvent);

      expect(crisisCallback.escalate).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 3. ESCALATION THRESHOLD LOGIC
  // ==========================================================================

  describe('3. Escalation Threshold Logic', () => {
    it('should respect custom escalation threshold', async () => {
      // Higher threshold (0.9)
      const strictHandler = new CrisisEventHandler(crisisCallback, 0.9);
      eventBus.subscribe('CRISIS_DETECTED', strictHandler.handle.bind(strictHandler), { priority: 1 });

      const event = createCrisisEvent({
        riskLevel: 0.85, // Above default 0.7, below 0.9
        recommendedAction: 'monitor',
      });
      await eventBus.publish(event);

      // Should NOT escalate due to higher threshold
      expect(crisisCallback.escalate).not.toHaveBeenCalled();
    });

    it('should escalate at exact threshold boundary', async () => {
      const handler = new CrisisEventHandler(crisisCallback, 0.7);
      eventBus.subscribe('CRISIS_DETECTED', handler.handle.bind(handler), { priority: 1 });

      const boundaryEvent = createCrisisEvent({
        riskLevel: 0.7, // Exactly at threshold
        recommendedAction: 'monitor',
      });
      await eventBus.publish(boundaryEvent);

      expect(crisisCallback.escalate).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple crisis events with different risk levels', async () => {
      const handler = new CrisisEventHandler(crisisCallback, 0.7);
      eventBus.subscribe('CRISIS_DETECTED', handler.handle.bind(handler), { priority: 1 });

      // Low risk - no escalation
      await eventBus.publish(createCrisisEvent({ riskLevel: 0.3, recommendedAction: 'monitor' }));
      // Medium risk - no escalation
      await eventBus.publish(createCrisisEvent({ riskLevel: 0.5, recommendedAction: 'monitor' }));
      // High risk - escalation
      await eventBus.publish(createCrisisEvent({ riskLevel: 0.8, recommendedAction: 'monitor' }));

      expect(crisisCallback.notify).toHaveBeenCalledTimes(3);
      expect(crisisCallback.log).toHaveBeenCalledTimes(3);
      expect(crisisCallback.escalate).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // 4. CRISIS EVENT PERSISTENCE
  // ==========================================================================

  describe('4. Crisis Event Persistence', () => {
    it('should persist crisis events to event store', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      const crisisEvent = createCrisisEvent();
      const result = await eventBus.publishWithResult(crisisEvent);

      expect(result.stored).toBe(true);
      expect(result.storageId).toBeDefined();

      // Verify in event store
      const storedEvents = await eventStore.getEvents(crisisEvent.aggregateId);
      expect(storedEvents).toHaveLength(1);
      expect(storedEvents[0].event.eventType).toBe('CRISIS_DETECTED');
    });

    it('should store all crisis event payload details', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      const crisisEvent = createCrisisEvent({
        riskLevel: 0.92,
        crisisType: 'suicidal_ideation',
        triggerIndicators: ['explicit_statement', 'hopelessness', 'planning'],
      });
      await eventBus.publish(crisisEvent);

      const storedEvents = await eventStore.getEvents(crisisEvent.aggregateId);
      const storedPayload = storedEvents[0].event.payload as ICrisisDetectedEvent['payload'];

      expect(storedPayload.riskLevel).toBe(0.92);
      expect(storedPayload.crisisType).toBe('suicidal_ideation');
      expect(storedPayload.triggerIndicators).toEqual(['explicit_statement', 'hopelessness', 'planning']);
    });

    it('should query crisis events by type', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });
      eventBus.subscribe('STATE_UPDATED', handler, { priority: 10 });

      // Publish multiple event types
      await eventBus.publish(createCrisisEvent());
      await eventBus.publish(createTestEvent('STATE_UPDATED'));
      await eventBus.publish(createCrisisEvent());

      const crisisEvents = await eventStore.getEventsByType('CRISIS_DETECTED');
      expect(crisisEvents).toHaveLength(2);
      crisisEvents.forEach((e) => {
        expect(e.event.eventType).toBe('CRISIS_DETECTED');
      });
    });

    it('should maintain checksum integrity for crisis events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      const crisisEvent = createCrisisEvent();
      await eventBus.publish(crisisEvent);

      const storedEvents = await eventStore.getEvents(crisisEvent.aggregateId);
      const eventId = storedEvents[0].id;

      const isValid = await eventStore.verifyIntegrity(eventId);
      expect(isValid).toBe(true);
    });
  });

  // ==========================================================================
  // 5. AUDIT TRAIL COMPLIANCE
  // ==========================================================================

  describe('5. Audit Trail Compliance', () => {
    it('should log crisis events to audit trail', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      const crisisEvent = createCrisisEvent();
      await eventBus.publish(crisisEvent);

      const auditLogs = await auditLogger.query({
        eventType: 'CRISIS_DETECTED',
      });

      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should include correlation ID in audit entries', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      const crisisEvent = createCrisisEvent();
      await eventBus.publish(crisisEvent);

      const auditLogs = await auditLogger.query({});
      const relevantLogs = auditLogs.filter(
        (log) => log.correlationId === crisisEvent.metadata.correlationId
      );

      expect(relevantLogs.length).toBeGreaterThan(0);
    });

    it('should track user ID in audit entries', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      const crisisEvent = createCrisisEvent({ userId: 'audit-test-user' });
      await eventBus.publish(crisisEvent);

      const auditLogs = await auditLogger.query({ userId: 'audit-test-user' });
      expect(auditLogs.length).toBeGreaterThan(0);
    });

    it('should export audit logs in NDJSON format', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      await eventBus.publish(createCrisisEvent());
      await eventBus.publish(createCrisisEvent());

      const exported = await auditLogger.export({});
      const lines = exported.trim().split('\n');

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  // ==========================================================================
  // 6. ERROR HANDLING IN CRISIS PATH
  // ==========================================================================

  describe('6. Error Handling in Crisis Path', () => {
    it('should handle handler errors without losing event', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      eventBus.subscribe('CRISIS_DETECTED', failingHandler, {
        priority: 1,
        retry: { maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 },
      });

      const crisisEvent = createCrisisEvent();

      // Should throw due to handler failure
      await expect(eventBus.publish(crisisEvent)).rejects.toThrow();

      // But event should still be stored
      const storedEvents = await eventStore.getEvents(crisisEvent.aggregateId);
      expect(storedEvents).toHaveLength(1);
    });

    it('should continue processing with partial handler failures', async () => {
      const successHandler = vi.fn().mockResolvedValue(undefined);
      const failingHandler = vi.fn().mockRejectedValue(new Error('Failed'));

      eventBus.subscribe('CRISIS_DETECTED', successHandler, { priority: 1 });
      eventBus.subscribe('CRISIS_DETECTED', failingHandler, {
        priority: 2,
        retry: { maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 },
      });

      const crisisEvent = createCrisisEvent();

      // Use publishWithResult to check handler outcomes
      const result = await eventBus.publishWithResult(crisisEvent);

      // First handler should have been called
      expect(successHandler).toHaveBeenCalledWith(crisisEvent);
      // Result should show mixed success/failure
      expect(result.handlersInvoked).toBeGreaterThanOrEqual(1);
    });

    it('should track handler results in publishWithResult', async () => {
      const successHandler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('CRISIS_DETECTED', successHandler, { priority: 1 });

      const crisisEvent = createCrisisEvent();
      const result = await eventBus.publishWithResult(crisisEvent);

      expect(result.handlersInvoked).toBe(1);
      expect(result.handlersSucceeded).toBe(1);
      expect(result.handlersFailed).toBe(0);
    });
  });

  // ==========================================================================
  // 7. CRISIS TYPES AND INDICATORS
  // ==========================================================================

  describe('7. Crisis Types and Indicators', () => {
    it('should handle all crisis types correctly', async () => {
      const crisisTypes: ICrisisDetectedEvent['payload']['crisisType'][] = [
        'self_harm',
        'suicidal_ideation',
        'acute_distress',
        'panic',
      ];

      // Track all notifications - callbacks receive full event
      const notifiedTypes: string[] = [];
      const escalatedTypes: string[] = [];

      const trackingCallback: ICrisisHandlerCallbacks = {
        notify: vi.fn().mockImplementation(async (event: ICrisisDetectedEvent) => {
          notifiedTypes.push(event.payload.crisisType);
        }),
        escalate: vi.fn().mockImplementation(async (event: ICrisisDetectedEvent) => {
          escalatedTypes.push(event.payload.crisisType);
        }),
        log: vi.fn().mockResolvedValue(undefined),
        reset: () => {
          (trackingCallback.notify as ReturnType<typeof vi.fn>).mockClear();
          (trackingCallback.escalate as ReturnType<typeof vi.fn>).mockClear();
          (trackingCallback.log as ReturnType<typeof vi.fn>).mockClear();
        },
      };

      const handler = new CrisisEventHandler(trackingCallback, 0.7);
      eventBus.subscribe('CRISIS_DETECTED', handler.handle.bind(handler), { priority: 1 });

      for (const crisisType of crisisTypes) {
        const event = createCrisisEvent({
          crisisType,
          riskLevel: 0.85,
        });
        await eventBus.publish(event);
      }

      // Verify all crisis types were handled
      expect(notifiedTypes).toHaveLength(crisisTypes.length);
      expect(escalatedTypes).toHaveLength(crisisTypes.length);
      for (const crisisType of crisisTypes) {
        expect(notifiedTypes).toContain(crisisType);
        expect(escalatedTypes).toContain(crisisType);
      }
    });

    it('should preserve trigger indicators through event flow', async () => {
      const capturedIndicators: string[][] = [];

      eventBus.subscribe(
        'CRISIS_DETECTED',
        async (event: ICrisisDetectedEvent) => {
          capturedIndicators.push(event.payload.triggerIndicators);
        },
        { priority: 1 }
      );

      const indicators = ['keyword_suicide', 'hopelessness', 'isolation', 'planning'];
      const event = createCrisisEvent({ triggerIndicators: indicators });
      await eventBus.publish(event);

      expect(capturedIndicators[0]).toEqual(indicators);
    });
  });

  // ==========================================================================
  // 8. CONCURRENT CRISIS EVENTS
  // ==========================================================================

  describe('8. Concurrent Crisis Events', () => {
    it('should handle concurrent crisis events from different users', async () => {
      const handledUsers: string[] = [];

      eventBus.subscribe(
        'CRISIS_DETECTED',
        async (event: ICrisisDetectedEvent) => {
          handledUsers.push(event.payload.userId);
        },
        { priority: 1 }
      );

      const events = [
        createCrisisEvent({ userId: 'user-1' }),
        createCrisisEvent({ userId: 'user-2' }),
        createCrisisEvent({ userId: 'user-3' }),
      ];

      await Promise.all(events.map((e) => eventBus.publish(e)));

      expect(handledUsers).toHaveLength(3);
      expect(handledUsers).toContain('user-1');
      expect(handledUsers).toContain('user-2');
      expect(handledUsers).toContain('user-3');
    });

    it('should maintain event isolation for concurrent events', async () => {
      const eventBusLocal = await createInitializedEventBus(
        { enablePersistence: true, enableAuditLog: true },
        eventStore,
        auditLogger
      );

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBusLocal.subscribe('CRISIS_DETECTED', handler, { priority: 1 });

      const event1 = createCrisisEvent({ userId: 'user-a', riskLevel: 0.5 });
      const event2 = createCrisisEvent({ userId: 'user-b', riskLevel: 0.9 });

      await Promise.all([
        eventBusLocal.publish(event1),
        eventBusLocal.publish(event2),
      ]);

      // Each event should be handled separately
      expect(handler).toHaveBeenCalledTimes(2);

      // Events should be stored separately
      const eventsA = await eventStore.getEvents('user-a');
      const eventsB = await eventStore.getEvents('user-b');

      expect(eventsA).toHaveLength(1);
      expect(eventsB).toHaveLength(1);

      eventBusLocal.clearAll();
    });
  });
});
