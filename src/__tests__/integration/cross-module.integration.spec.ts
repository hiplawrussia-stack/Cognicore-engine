/**
 * CROSS-MODULE INTEGRATION TESTS
 * ================================
 * Full Pipeline Integration Tests Across CogniCore Modules
 *
 * Research Foundation (2025-2026):
 * - Microservices Integration Testing (Testcontainers)
 * - Event Chain Validation (Event-Driven.io)
 * - Cognitive AI Memory Systems (Cognee, Tribe AI)
 * - End-to-End Flow Testing (ML Pipeline Best Practices)
 *
 * Test Categories:
 * 1. Event Chain Validation (causation/correlation)
 * 2. Handler Registry Integration
 * 3. Multi-Event Type Processing
 * 4. Event-Driven Workflow Simulation
 * 5. Performance Under Load
 *
 * БФ "Другой путь" | БАЙТ Cognitive Core v1.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  CogniCoreEventBus,
  createInitializedEventBus,
} from '../../events/EventBus';
import {
  InMemoryEventStore,
  InMemoryAuditLogger,
} from '../../events/EventStore';
import {
  EventHandlerRegistry,
  CrisisEventHandler,
  StateChangeEventHandler,
  InterventionOutcomeHandler,
  VulnerabilityWindowHandler,
  type ICrisisNotificationCallback,
  type IStateChangeCallback,
  type IInterventionLearningCallback,
  type IProactiveInterventionCallback,
} from '../../events/handlers';
import type {
  IDomainEvent,
  ICrisisDetectedEvent,
  IStateUpdatedEvent,
  IInterventionOutcomeEvent,
  VulnerabilityWindowEvent,
} from '../../integration/ICognitiveCoreAPI';
import { createEventMetadata } from '../../events/IEvents';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createEvent<T extends IDomainEvent>(
  eventType: string,
  aggregateId: string,
  payload: unknown,
  metadata?: Partial<{ correlationId: string; causationId: string; userId: string }>
): T {
  return {
    eventId: uuidv4(),
    eventType,
    aggregateId,
    aggregateType: 'cognitive_state',
    timestamp: new Date(),
    version: 1,
    payload,
    metadata: createEventMetadata('test', metadata),
  } as T;
}

function createCrisisEvent(userId: string, riskLevel: number = 0.85): ICrisisDetectedEvent {
  return createEvent('CRISIS_DETECTED', userId, {
    userId,
    sessionId: `session-${Date.now()}`,
    riskLevel,
    triggerIndicators: ['test_indicator'],
    recommendedAction: riskLevel > 0.7 ? 'immediate_response' : 'monitor',
    crisisType: 'acute_distress',
  });
}

function createStateEvent(userId: string): IStateUpdatedEvent {
  return createEvent('STATE_UPDATED', userId, {
    userId,
    previousState: { wellbeingIndex: 50 },
    newState: { wellbeingIndex: 60 },
    trigger: 'message',
    changes: [
      // Magnitude >= 0.15 to trigger onSignificantChange
      { dimension: 'emotional', field: 'valence', previousValue: 0.4, newValue: 0.6, changeType: 'increase', magnitude: 0.2 },
    ],
  });
}

function createInterventionOutcomeEvent(userId: string): IInterventionOutcomeEvent {
  return createEvent('INTERVENTION_OUTCOME', userId, {
    userId,
    interventionId: `int-${Date.now()}`,
    outcome: {
      engagementLevel: 0.8,
      completionRate: 1.0,
      userRating: 4,
    },
    rewardSignal: 0.75,
  });
}

function createVulnerabilityWindowEvent(userId: string): VulnerabilityWindowEvent {
  return createEvent('VULNERABILITY_WINDOW_DETECTED', userId, {
    userId,
    window: {
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 7200000),
      confidence: 0.75,
      predictedRiskLevel: 0.6,
      riskFactors: ['sleep_disruption'],
    },
    recommendedInterventionTypes: ['preventive_check_in', 'relaxation_exercise'],
  });
}

// Mock callbacks
function createMockCallbacks() {
  return {
    crisis: {
      notify: vi.fn().mockResolvedValue(undefined),
      escalate: vi.fn().mockResolvedValue(undefined),
      log: vi.fn().mockResolvedValue(undefined),
    } as ICrisisNotificationCallback,
    stateChange: {
      onSignificantChange: vi.fn().mockResolvedValue(undefined),
      onImprovement: vi.fn().mockResolvedValue(undefined),
      onDeterioration: vi.fn().mockResolvedValue(undefined),
    } as IStateChangeCallback,
    interventionLearning: {
      updateModel: vi.fn().mockResolvedValue(undefined),
      logOutcome: vi.fn().mockResolvedValue(undefined),
    } as IInterventionLearningCallback,
    proactiveIntervention: {
      scheduleIntervention: vi.fn().mockResolvedValue(undefined),
      notifyUser: vi.fn().mockResolvedValue(undefined),
    } as IProactiveInterventionCallback,
  };
}

// ============================================================================
// CROSS-MODULE INTEGRATION TESTS
// ============================================================================

describe('Cross-Module Integration Tests', () => {
  let eventBus: CogniCoreEventBus;
  let eventStore: InMemoryEventStore;
  let auditLogger: InMemoryAuditLogger;
  let callbacks: ReturnType<typeof createMockCallbacks>;
  let handlerRegistry: EventHandlerRegistry;

  beforeEach(async () => {
    eventStore = new InMemoryEventStore();
    auditLogger = new InMemoryAuditLogger();
    callbacks = createMockCallbacks();

    eventBus = await createInitializedEventBus(
      { enablePersistence: true, enableAuditLog: true },
      eventStore,
      auditLogger
    );

    // Setup handler registry with all handlers
    handlerRegistry = new EventHandlerRegistry();
    handlerRegistry.register(new CrisisEventHandler(callbacks.crisis, 0.7));
    handlerRegistry.register(new StateChangeEventHandler(callbacks.stateChange, 0.15));
    handlerRegistry.register(new InterventionOutcomeHandler(callbacks.interventionLearning));
    handlerRegistry.register(new VulnerabilityWindowHandler(callbacks.proactiveIntervention, 0.6));
    handlerRegistry.registerWithEventBus(eventBus);
  });

  afterEach(() => {
    eventBus.clearAll();
    handlerRegistry.clear();
  });

  // ==========================================================================
  // 1. EVENT CHAIN VALIDATION
  // ==========================================================================

  describe('1. Event Chain Validation', () => {
    it('should track causation chain across events', async () => {
      const userId = `chain-${Date.now()}`;
      const correlationId = uuidv4();

      // Message received → State updated → Belief updated
      const stateEvent = createStateEvent(userId);
      stateEvent.metadata.correlationId = correlationId;
      await eventBus.publish(stateEvent);

      // Crisis detected (caused by state change)
      const crisisEvent = createCrisisEvent(userId, 0.85);
      crisisEvent.metadata.correlationId = correlationId;
      crisisEvent.metadata.causationId = stateEvent.eventId;
      await eventBus.publish(crisisEvent);

      // Query by correlation ID
      const events = await eventStore.queryEvents({ aggregateId: userId });
      const correlated = events.filter((e) => e.event.metadata.correlationId === correlationId);

      expect(correlated).toHaveLength(2);

      // Verify causation chain
      const causedEvent = correlated.find((e) => e.event.metadata.causationId === stateEvent.eventId);
      expect(causedEvent).toBeDefined();
      expect(causedEvent?.event.eventType).toBe('CRISIS_DETECTED');
    });

    it('should maintain correlation across multiple related events', async () => {
      const userId = `multi-chain-${Date.now()}`;
      const correlationId = uuidv4();

      const events = [
        createStateEvent(userId),
        createStateEvent(userId),
        createCrisisEvent(userId, 0.85),
        createInterventionOutcomeEvent(userId),
      ];

      // Set same correlation ID for all
      events.forEach((e) => {
        e.metadata.correlationId = correlationId;
      });

      // Set causation chain
      for (let i = 1; i < events.length; i++) {
        events[i].metadata.causationId = events[i - 1].eventId;
      }

      for (const event of events) {
        await eventBus.publish(event);
      }

      const stored = await eventStore.queryEvents({ aggregateId: userId });
      const correlated = stored.filter((e) => e.event.metadata.correlationId === correlationId);

      expect(correlated).toHaveLength(4);
    });
  });

  // ==========================================================================
  // 2. HANDLER REGISTRY INTEGRATION
  // ==========================================================================

  describe('2. Handler Registry Integration', () => {
    it('should register all handlers correctly', () => {
      const handlers = handlerRegistry.getAllHandlers();

      expect(handlers).toHaveLength(4);
      expect(handlers.map((h) => h.name)).toContain('CrisisEventHandler');
      expect(handlers.map((h) => h.name)).toContain('StateChangeEventHandler');
      expect(handlers.map((h) => h.name)).toContain('InterventionOutcomeHandler');
      expect(handlers.map((h) => h.name)).toContain('VulnerabilityWindowHandler');
    });

    it('should get handlers by event type', () => {
      const crisisHandlers = handlerRegistry.getHandlers('CRISIS_DETECTED');
      const stateHandlers = handlerRegistry.getHandlers('STATE_UPDATED');

      expect(crisisHandlers.some((h) => h.name === 'CrisisEventHandler')).toBe(true);
      expect(stateHandlers.some((h) => h.name === 'StateChangeEventHandler')).toBe(true);
    });

    it('should execute handlers in priority order', async () => {
      const executionOrder: string[] = [];

      // Create a fresh registry for this test
      const testRegistry = new EventHandlerRegistry();
      const testBus = await createInitializedEventBus(
        { enablePersistence: false, enableAuditLog: false },
        eventStore
      );

      // Register with different priorities
      testBus.subscribe('TEST_ORDER', async () => { executionOrder.push('low-priority'); }, { priority: 100 });
      testBus.subscribe('TEST_ORDER', async () => { executionOrder.push('high-priority'); }, { priority: 1 });
      testBus.subscribe('TEST_ORDER', async () => { executionOrder.push('mid-priority'); }, { priority: 50 });

      await testBus.publish(createEvent('TEST_ORDER', 'test', {}));

      expect(executionOrder[0]).toBe('high-priority');
      expect(executionOrder[1]).toBe('mid-priority');
      expect(executionOrder[2]).toBe('low-priority');

      testBus.clearAll();
    });

    it('should unregister handlers correctly', () => {
      handlerRegistry.unregister('CrisisEventHandler');

      const crisisHandlers = handlerRegistry.getHandlers('CRISIS_DETECTED');
      expect(crisisHandlers.some((h) => h.name === 'CrisisEventHandler')).toBe(false);
    });
  });

  // ==========================================================================
  // 3. MULTI-EVENT TYPE PROCESSING
  // ==========================================================================

  describe('3. Multi-Event Type Processing', () => {
    it('should process different event types with appropriate handlers', async () => {
      const userId = `multi-type-${Date.now()}`;

      // Publish different event types
      await eventBus.publish(createStateEvent(userId));
      await eventBus.publish(createCrisisEvent(userId, 0.85));
      await eventBus.publish(createInterventionOutcomeEvent(userId));
      await eventBus.publish(createVulnerabilityWindowEvent(userId));

      // Verify all handlers were invoked
      expect(callbacks.stateChange.onSignificantChange).toHaveBeenCalled();
      expect(callbacks.crisis.notify).toHaveBeenCalled();
      expect(callbacks.crisis.escalate).toHaveBeenCalled();
      expect(callbacks.interventionLearning.logOutcome).toHaveBeenCalled();
      expect(callbacks.proactiveIntervention.scheduleIntervention).toHaveBeenCalled();
    });

    it('should store all event types in event store', async () => {
      const userId = `store-all-${Date.now()}`;

      await eventBus.publish(createStateEvent(userId));
      await eventBus.publish(createCrisisEvent(userId));
      await eventBus.publish(createInterventionOutcomeEvent(userId));
      await eventBus.publish(createVulnerabilityWindowEvent(userId));

      const events = await eventStore.getEvents(userId);
      expect(events).toHaveLength(4);

      const eventTypes = events.map((e) => e.event.eventType);
      expect(eventTypes).toContain('STATE_UPDATED');
      expect(eventTypes).toContain('CRISIS_DETECTED');
      expect(eventTypes).toContain('INTERVENTION_OUTCOME');
      expect(eventTypes).toContain('VULNERABILITY_WINDOW_DETECTED');
    });

    it('should handle wildcard subscriptions', async () => {
      const allEvents: IDomainEvent[] = [];

      eventBus.subscribe('*', async (event: IDomainEvent) => {
        allEvents.push(event);
      }, { priority: 1000 });

      const userId = `wildcard-${Date.now()}`;
      await eventBus.publish(createStateEvent(userId));
      await eventBus.publish(createCrisisEvent(userId));

      expect(allEvents).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 4. EVENT-DRIVEN WORKFLOW SIMULATION
  // ==========================================================================

  describe('4. Event-Driven Workflow Simulation', () => {
    it('should simulate complete user session workflow', async () => {
      const userId = `workflow-${Date.now()}`;
      const sessionId = `session-${Date.now()}`;
      const correlationId = uuidv4();

      const workflowEvents: IDomainEvent[] = [];

      // Track all events
      eventBus.subscribe('*', async (event: IDomainEvent) => {
        workflowEvents.push(event);
      }, { priority: 1000 });

      // Step 1: Session started (simulated)
      const sessionEvent = createEvent('USER_SESSION_STARTED', userId, {
        userId,
        sessionId,
        platform: 'api',
      }, { correlationId });
      await eventBus.publish(sessionEvent);

      // Step 2: State update from message
      const stateEvent = createStateEvent(userId);
      stateEvent.metadata.correlationId = correlationId;
      stateEvent.metadata.causationId = sessionEvent.eventId;
      await eventBus.publish(stateEvent);

      // Step 3: Crisis detected
      const crisisEvent = createCrisisEvent(userId, 0.85);
      crisisEvent.metadata.correlationId = correlationId;
      crisisEvent.metadata.causationId = stateEvent.eventId;
      await eventBus.publish(crisisEvent);

      // Step 4: Intervention delivered and outcome
      const outcomeEvent = createInterventionOutcomeEvent(userId);
      outcomeEvent.metadata.correlationId = correlationId;
      outcomeEvent.metadata.causationId = crisisEvent.eventId;
      await eventBus.publish(outcomeEvent);

      // Verify workflow
      expect(workflowEvents).toHaveLength(4);
      expect(callbacks.crisis.escalate).toHaveBeenCalled();
      expect(callbacks.interventionLearning.updateModel).toHaveBeenCalled();

      // Verify persistence
      const stored = await eventStore.getEvents(userId);
      expect(stored).toHaveLength(4);
    });

    it('should handle user state progression over time', async () => {
      const userId = `progression-${Date.now()}`;

      // Simulate 10 state updates over time
      for (let i = 0; i < 10; i++) {
        const event = createStateEvent(userId);
        (event.payload as any).newState.wellbeingIndex = 50 + i * 2;
        await eventBus.publish(event);
      }

      const events = await eventStore.getEvents(userId);
      expect(events).toHaveLength(10);

      // Verify progression
      const wellbeingProgression = events.map((e) => {
        return (e.event.payload as any).newState.wellbeingIndex;
      });

      // Should be increasing
      for (let i = 1; i < wellbeingProgression.length; i++) {
        expect(wellbeingProgression[i]).toBeGreaterThan(wellbeingProgression[i - 1]);
      }
    });

    it('should handle crisis → intervention → outcome cycle', async () => {
      const userId = `crisis-cycle-${Date.now()}`;

      // Crisis detected
      const crisisEvent = createCrisisEvent(userId, 0.9);
      await eventBus.publish(crisisEvent);

      expect(callbacks.crisis.escalate).toHaveBeenCalledTimes(1);

      // Intervention outcome (post-crisis)
      const outcomeEvent = createInterventionOutcomeEvent(userId);
      outcomeEvent.metadata.causationId = crisisEvent.eventId;
      await eventBus.publish(outcomeEvent);

      expect(callbacks.interventionLearning.updateModel).toHaveBeenCalledTimes(1);

      // Verify chain in storage
      const events = await eventStore.getEvents(userId);
      const crisisStored = events.find((e) => e.event.eventType === 'CRISIS_DETECTED');
      const outcomeStored = events.find((e) => e.event.eventType === 'INTERVENTION_OUTCOME');

      expect(outcomeStored?.event.metadata.causationId).toBe(crisisStored?.event.eventId);
    });
  });

  // ==========================================================================
  // 5. PERFORMANCE UNDER LOAD
  // ==========================================================================

  describe('5. Performance Under Load', () => {
    it('should handle burst of events efficiently', async () => {
      const startTime = Date.now();
      const eventCount = 100;
      const userId = `burst-${Date.now()}`;

      const publishPromises = Array.from({ length: eventCount }, () =>
        eventBus.publish(createStateEvent(userId))
      );

      await Promise.all(publishPromises);

      const duration = Date.now() - startTime;
      const stored = await eventStore.getEvents(userId);

      expect(stored).toHaveLength(eventCount);

      // Should complete in reasonable time (less than 5 seconds for 100 events)
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain event ordering under concurrent load', async () => {
      const userId = `ordering-${Date.now()}`;
      const eventCount = 50;

      // Publish sequentially to ensure order
      for (let i = 0; i < eventCount; i++) {
        await eventBus.publish(createStateEvent(userId));
      }

      const events = await eventStore.getEvents(userId);

      // Verify sequence numbers are sequential
      for (let i = 0; i < events.length; i++) {
        expect(events[i].sequenceNumber).toBe(i + 1);
      }
    });

    it('should handle multiple users concurrently', async () => {
      const userCount = 10;
      const eventsPerUser = 10;

      const promises: Promise<void>[] = [];

      for (let u = 0; u < userCount; u++) {
        const userId = `concurrent-user-${u}-${Date.now()}`;
        for (let e = 0; e < eventsPerUser; e++) {
          promises.push(eventBus.publish(createStateEvent(userId)));
        }
      }

      await Promise.all(promises);

      const totalCount = await eventStore.getTotalEventCount();
      expect(totalCount).toBeGreaterThanOrEqual(userCount * eventsPerUser);
    });

    it('should track handler execution metrics', async () => {
      const userId = `metrics-${Date.now()}`;
      const event = createStateEvent(userId);

      const result = await eventBus.publishWithResult(event);

      expect(result.handlersInvoked).toBeGreaterThan(0);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.stored).toBe(true);
    });
  });

  // ==========================================================================
  // 6. ERROR ISOLATION
  // ==========================================================================

  describe('6. Error Isolation', () => {
    it('should isolate handler errors between event types', async () => {
      const userId = `error-isolation-${Date.now()}`;

      // Add a failing handler for a specific event type
      eventBus.subscribe('FAILING_EVENT', async () => {
        throw new Error('Intentional failure');
      }, { retry: { maxAttempts: 1, delayMs: 0, backoffMultiplier: 1 } });

      // Normal events should still work
      await eventBus.publish(createStateEvent(userId));
      expect(callbacks.stateChange.onSignificantChange).toHaveBeenCalled();

      // Failing event should throw
      await expect(
        eventBus.publish(createEvent('FAILING_EVENT', userId, {}))
      ).rejects.toThrow();

      // But subsequent normal events should still work
      await eventBus.publish(createCrisisEvent(userId));
      expect(callbacks.crisis.notify).toHaveBeenCalled();
    });

    it('should continue processing after handler timeout', async () => {
      // This test verifies the system is resilient to slow handlers
      const userId = `timeout-${Date.now()}`;

      let slowHandlerCompleted = false;
      eventBus.subscribe('SLOW_EVENT', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        slowHandlerCompleted = true;
      });

      await eventBus.publish(createEvent('SLOW_EVENT', userId, {}));

      expect(slowHandlerCompleted).toBe(true);

      // System should still be responsive
      await eventBus.publish(createStateEvent(userId));
      expect(callbacks.stateChange.onSignificantChange).toHaveBeenCalled();
    });
  });
});
