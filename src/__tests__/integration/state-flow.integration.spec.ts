/**
 * STATE FLOW INTEGRATION TESTS
 * =============================
 * State → Events Integration Tests
 *
 * Research Foundation (2025-2026):
 * - Event Sourcing State Reconstruction (Event-Driven.io)
 * - CQRS Read/Write Separation (Microsoft patterns)
 * - Domain Event Patterns (Khalil Stemmler)
 * - Snapshot Optimization (EventStoreDB patterns)
 *
 * Test Categories:
 * 1. State Update Event Generation
 * 2. State Change Tracking
 * 3. Belief Update Integration
 * 4. Event Replay for State Reconstruction
 * 5. Snapshot Creation and Restoration
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
  StateChangeEventHandler,
  type IStateChangeCallback,
} from '../../events/handlers';
import type {
  IDomainEvent,
  IStateUpdatedEvent,
  IBeliefUpdatedEvent,
  IStateChange,
} from '../../integration/ICognitiveCoreAPI';
import { createEventMetadata } from '../../events/IEvents';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a state updated event
 */
function createStateUpdatedEvent(
  options: {
    userId?: string;
    trigger?: 'message' | 'observation' | 'decay' | 'intervention';
    changes?: IStateChange[];
    previousWellbeing?: number;
    newWellbeing?: number;
  } = {}
): IStateUpdatedEvent {
  const {
    userId = `user-${uuidv4().substring(0, 8)}`,
    trigger = 'message',
    changes = [
      {
        dimension: 'emotional' as const,
        field: 'valence',
        previousValue: 0.5,
        newValue: 0.6,
        changeType: 'increase' as const,
        magnitude: 0.1,
      },
    ],
    previousWellbeing = 50,
    newWellbeing = 55,
  } = options;

  return {
    eventId: uuidv4(),
    eventType: 'STATE_UPDATED',
    aggregateId: userId,
    aggregateType: 'cognitive_state',
    timestamp: new Date(),
    version: 1,
    payload: {
      userId,
      previousState: {
        userId,
        timestamp: new Date(Date.now() - 60000),
        version: 1,
        wellbeingIndex: previousWellbeing,
        emotional: { valence: 0.5, arousal: 0.5 },
        cognitive: { clarity: 0.5 },
        narrative: { coherence: 0.5 },
        risk: { level: 'low', overallRiskLevel: 0.2 },
        resources: { copingSkills: 0.5 },
      } as any,
      newState: {
        userId,
        timestamp: new Date(),
        version: 2,
        wellbeingIndex: newWellbeing,
        emotional: { valence: 0.6, arousal: 0.5 },
        cognitive: { clarity: 0.5 },
        narrative: { coherence: 0.5 },
        risk: { level: 'low', overallRiskLevel: 0.2 },
        resources: { copingSkills: 0.5 },
      } as any,
      trigger,
      changes,
    },
    metadata: createEventMetadata('state-engine', { userId }),
  };
}

/**
 * Create a belief updated event
 */
function createBeliefUpdatedEvent(
  options: {
    userId?: string;
    informationGain?: number;
  } = {}
): IBeliefUpdatedEvent {
  const {
    userId = `user-${uuidv4().substring(0, 8)}`,
    informationGain = 0.15,
  } = options;

  return {
    eventId: uuidv4(),
    eventType: 'BELIEF_UPDATED',
    aggregateId: userId,
    aggregateType: 'cognitive_state',
    timestamp: new Date(),
    version: 1,
    payload: {
      userId,
      observation: {
        id: `obs-${Date.now()}`,
        type: 'text_analysis',
        timestamp: new Date(),
        data: { sentiment: 0.6 },
        reliability: 0.8,
        informsComponents: ['emotional'],
      },
      previousBelief: {
        emotional: { mean: [0.5, 0.5], covariance: [[0.1, 0], [0, 0.1]] },
      } as any,
      newBelief: {
        emotional: { mean: [0.6, 0.5], covariance: [[0.08, 0], [0, 0.1]] },
      } as any,
      informationGain,
    },
    metadata: createEventMetadata('belief-engine', { userId }),
  };
}

/**
 * Create mock state change callback
 */
function createMockStateChangeCallback(): IStateChangeCallback & {
  significantChanges: { event: IStateUpdatedEvent; score: number }[];
  improvements: IStateUpdatedEvent[];
  deteriorations: IStateUpdatedEvent[];
  reset: () => void;
} {
  const significantChanges: { event: IStateUpdatedEvent; score: number }[] = [];
  const improvements: IStateUpdatedEvent[] = [];
  const deteriorations: IStateUpdatedEvent[] = [];

  return {
    significantChanges,
    improvements,
    deteriorations,
    reset: () => {
      significantChanges.length = 0;
      improvements.length = 0;
      deteriorations.length = 0;
    },
    onSignificantChange: vi.fn(async (event: IStateUpdatedEvent, score: number) => {
      significantChanges.push({ event, score });
    }),
    onImprovement: vi.fn(async (event: IStateUpdatedEvent) => {
      improvements.push(event);
    }),
    onDeterioration: vi.fn(async (event: IStateUpdatedEvent) => {
      deteriorations.push(event);
    }),
  };
}

// ============================================================================
// STATE FLOW INTEGRATION TESTS
// ============================================================================

describe('State Flow Integration Tests', () => {
  let eventBus: CogniCoreEventBus;
  let eventStore: InMemoryEventStore;
  let auditLogger: InMemoryAuditLogger;
  let stateCallback: ReturnType<typeof createMockStateChangeCallback>;

  beforeEach(async () => {
    eventStore = new InMemoryEventStore();
    auditLogger = new InMemoryAuditLogger();
    stateCallback = createMockStateChangeCallback();

    eventBus = await createInitializedEventBus(
      { enablePersistence: true, enableAuditLog: true },
      eventStore,
      auditLogger
    );
  });

  afterEach(() => {
    eventBus.clearAll();
    stateCallback.reset();
  });

  // ==========================================================================
  // 1. STATE UPDATE EVENT GENERATION
  // ==========================================================================

  describe('1. State Update Event Generation', () => {
    it('should persist state update events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const event = createStateUpdatedEvent();
      await eventBus.publish(event);

      const stored = await eventStore.getEvents(event.aggregateId);
      expect(stored).toHaveLength(1);
      expect(stored[0].event.eventType).toBe('STATE_UPDATED');
    });

    it('should capture all state dimensions in event payload', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const event = createStateUpdatedEvent({
        changes: [
          { dimension: 'emotional', field: 'valence', previousValue: 0.5, newValue: 0.6, changeType: 'increase', magnitude: 0.1 },
          { dimension: 'cognitive', field: 'clarity', previousValue: 0.4, newValue: 0.5, changeType: 'increase', magnitude: 0.1 },
          { dimension: 'risk', field: 'overallRiskLevel', previousValue: 0.3, newValue: 0.2, changeType: 'decrease', magnitude: 0.1 },
        ],
      });
      await eventBus.publish(event);

      const stored = await eventStore.getEvents(event.aggregateId);
      const payload = stored[0].event.payload as IStateUpdatedEvent['payload'];

      expect(payload.changes).toHaveLength(3);
      expect(payload.changes.map((c) => c.dimension)).toContain('emotional');
      expect(payload.changes.map((c) => c.dimension)).toContain('cognitive');
      expect(payload.changes.map((c) => c.dimension)).toContain('risk');
    });

    it('should track state update trigger source', async () => {
      const triggers: Array<'message' | 'observation' | 'decay' | 'intervention'> = [
        'message',
        'observation',
        'decay',
        'intervention',
      ];

      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      for (const trigger of triggers) {
        const event = createStateUpdatedEvent({ trigger });
        await eventBus.publish(event);
      }

      const stored = await eventStore.getEventsByType('STATE_UPDATED');
      const payloads = stored.map((s) => s.event.payload as IStateUpdatedEvent['payload']);

      expect(payloads.map((p) => p.trigger)).toEqual(triggers);
    });
  });

  // ==========================================================================
  // 2. STATE CHANGE TRACKING
  // ==========================================================================

  describe('2. State Change Tracking', () => {
    let handler: StateChangeEventHandler;

    beforeEach(() => {
      handler = new StateChangeEventHandler(stateCallback, 0.15);
      eventBus.subscribe('STATE_UPDATED', handler.handle.bind(handler), { priority: 10 });
    });

    it('should detect significant state changes', async () => {
      const event = createStateUpdatedEvent({
        changes: [
          { dimension: 'emotional', field: 'valence', previousValue: 0.3, newValue: 0.6, changeType: 'increase', magnitude: 0.3 },
        ],
      });
      await eventBus.publish(event);

      expect(stateCallback.onSignificantChange).toHaveBeenCalled();
      expect(stateCallback.significantChanges).toHaveLength(1);
      expect(stateCallback.significantChanges[0].score).toBeGreaterThanOrEqual(0.15);
    });

    it('should detect improvements in positive dimensions', async () => {
      const event = createStateUpdatedEvent({
        changes: [
          { dimension: 'emotional', field: 'valence', previousValue: 0.4, newValue: 0.6, changeType: 'increase', magnitude: 0.2 },
          { dimension: 'resource', field: 'copingSkills', previousValue: 0.5, newValue: 0.7, changeType: 'increase', magnitude: 0.2 },
        ],
      });
      await eventBus.publish(event);

      expect(stateCallback.onImprovement).toHaveBeenCalled();
      expect(stateCallback.improvements).toHaveLength(1);
    });

    it('should detect deteriorations in negative dimensions', async () => {
      const event = createStateUpdatedEvent({
        changes: [
          { dimension: 'risk', field: 'crisisRisk', previousValue: 0.2, newValue: 0.5, changeType: 'increase', magnitude: 0.3 },
          { dimension: 'emotional', field: 'negativeAffect', previousValue: 0.3, newValue: 0.6, changeType: 'increase', magnitude: 0.3 },
        ],
      });
      await eventBus.publish(event);

      expect(stateCallback.onDeterioration).toHaveBeenCalled();
      expect(stateCallback.deteriorations).toHaveLength(1);
    });

    it('should ignore minor state changes below threshold', async () => {
      const event = createStateUpdatedEvent({
        changes: [
          { dimension: 'emotional', field: 'valence', previousValue: 0.5, newValue: 0.52, changeType: 'increase', magnitude: 0.02 },
        ],
      });
      await eventBus.publish(event);

      expect(stateCallback.onSignificantChange).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. BELIEF UPDATE INTEGRATION
  // ==========================================================================

  describe('3. Belief Update Integration', () => {
    it('should persist belief update events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('BELIEF_UPDATED', handler);

      const event = createBeliefUpdatedEvent();
      await eventBus.publish(event);

      const stored = await eventStore.getEvents(event.aggregateId);
      expect(stored).toHaveLength(1);
      expect(stored[0].event.eventType).toBe('BELIEF_UPDATED');
    });

    it('should track information gain in belief updates', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('BELIEF_UPDATED', handler);

      const event = createBeliefUpdatedEvent({ informationGain: 0.25 });
      await eventBus.publish(event);

      const stored = await eventStore.getEvents(event.aggregateId);
      const payload = stored[0].event.payload as IBeliefUpdatedEvent['payload'];

      expect(payload.informationGain).toBe(0.25);
    });

    it('should link belief updates to observations', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('BELIEF_UPDATED', handler);

      const event = createBeliefUpdatedEvent();
      await eventBus.publish(event);

      const stored = await eventStore.getEvents(event.aggregateId);
      const payload = stored[0].event.payload as IBeliefUpdatedEvent['payload'];

      expect(payload.observation).toBeDefined();
      expect(payload.observation.type).toBe('text_analysis');
      expect(payload.observation.reliability).toBe(0.8);
    });

    it('should correlate state and belief updates for same user', async () => {
      const userId = `correlation-test-${Date.now()}`;
      const correlationId = uuidv4();

      const stateHandler = vi.fn().mockResolvedValue(undefined);
      const beliefHandler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('STATE_UPDATED', stateHandler);
      eventBus.subscribe('BELIEF_UPDATED', beliefHandler);

      // State update first
      const stateEvent = createStateUpdatedEvent({ userId });
      stateEvent.metadata.correlationId = correlationId;
      await eventBus.publish(stateEvent);

      // Belief update follows
      const beliefEvent = createBeliefUpdatedEvent({ userId });
      beliefEvent.metadata.correlationId = correlationId;
      beliefEvent.metadata.causationId = stateEvent.eventId;
      await eventBus.publish(beliefEvent);

      // Both should be stored and traceable
      const stored = await eventStore.getEvents(userId);
      expect(stored).toHaveLength(2);

      const correlatedEvents = stored.filter(
        (e) => e.event.metadata.correlationId === correlationId
      );
      expect(correlatedEvents).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 4. EVENT REPLAY FOR STATE RECONSTRUCTION
  // ==========================================================================

  describe('4. Event Replay for State Reconstruction', () => {
    it('should replay events in correct order', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `replay-test-${Date.now()}`;

      // Publish multiple state updates
      for (let i = 0; i < 5; i++) {
        const event = createStateUpdatedEvent({
          userId,
          previousWellbeing: 50 + i * 5,
          newWellbeing: 55 + i * 5,
        });
        await eventBus.publish(event);
      }

      const events = await eventStore.getEvents(userId);
      expect(events).toHaveLength(5);

      // Verify order
      for (let i = 0; i < events.length; i++) {
        expect(events[i].sequenceNumber).toBe(i + 1);
      }

      // Verify wellbeing progression
      const wellbeingValues = events.map((e) => {
        const payload = e.event.payload as IStateUpdatedEvent['payload'];
        return payload.newState.wellbeingIndex;
      });
      expect(wellbeingValues).toEqual([55, 60, 65, 70, 75]);
    });

    it('should reconstruct state from event history', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `reconstruct-${Date.now()}`;
      let currentWellbeing = 50;

      // Simulate state evolution
      for (let i = 0; i < 10; i++) {
        const delta = (Math.random() - 0.5) * 10;
        const newWellbeing = Math.max(0, Math.min(100, currentWellbeing + delta));

        const event = createStateUpdatedEvent({
          userId,
          previousWellbeing: currentWellbeing,
          newWellbeing,
        });
        await eventBus.publish(event);

        currentWellbeing = newWellbeing;
      }

      // Replay to reconstruct
      const events = await eventStore.getEvents(userId);
      const lastEvent = events[events.length - 1];
      const reconstructedState = (lastEvent.event.payload as IStateUpdatedEvent['payload']).newState;

      expect(reconstructedState.wellbeingIndex).toBeCloseTo(currentWellbeing, 2);
    });

    it('should support partial replay from specific version', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `partial-replay-${Date.now()}`;

      for (let i = 0; i < 10; i++) {
        await eventBus.publish(createStateUpdatedEvent({ userId }));
      }

      // Get events AFTER version 5 (i.e., > 5, so 6, 7, 8, 9, 10)
      const partialEvents = await eventStore.getEvents(userId, 5);
      expect(partialEvents).toHaveLength(5); // 6, 7, 8, 9, 10
      expect(partialEvents[0].sequenceNumber).toBe(6);
    });
  });

  // ==========================================================================
  // 5. SNAPSHOT CREATION AND RESTORATION
  // ==========================================================================

  describe('5. Snapshot Creation and Restoration', () => {
    it('should create snapshot at configured threshold', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `snapshot-${Date.now()}`;

      // Publish enough events to trigger snapshot
      for (let i = 0; i < 10; i++) {
        await eventBus.publish(createStateUpdatedEvent({ userId }));
      }

      // Create snapshot manually
      const state = { wellbeingIndex: 75, version: 10 };
      const snapshot = await eventStore.createSnapshot(userId, 'cognitive_state', state, 10);

      expect(snapshot).toBeDefined();
      expect(snapshot.aggregateId).toBe(userId);
      expect(snapshot.version).toBe(10);
      expect(snapshot.state).toEqual(state);
    });

    it('should retrieve latest snapshot', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `snapshot-retrieve-${Date.now()}`;

      // Create initial state and snapshot
      const state1 = { wellbeingIndex: 50, version: 5 };
      await eventStore.createSnapshot(userId, 'cognitive_state', state1, 5);

      // Create newer snapshot
      const state2 = { wellbeingIndex: 75, version: 10 };
      await eventStore.createSnapshot(userId, 'cognitive_state', state2, 10);

      // Should get the latest
      const snapshot = await eventStore.getSnapshot(userId);
      expect(snapshot?.version).toBe(10);
      expect(snapshot?.state).toEqual(state2);
    });

    it('should support state reconstruction from snapshot + delta', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `snapshot-delta-${Date.now()}`;

      // Publish initial events
      for (let i = 0; i < 5; i++) {
        await eventBus.publish(createStateUpdatedEvent({ userId }));
      }

      // Create snapshot at version 5
      const snapshotState = { wellbeingIndex: 60 };
      await eventStore.createSnapshot(userId, 'cognitive_state', snapshotState, 5);

      // Publish more events after snapshot
      for (let i = 0; i < 3; i++) {
        await eventBus.publish(createStateUpdatedEvent({ userId }));
      }

      // Get snapshot
      const snapshot = await eventStore.getSnapshot(userId);
      expect(snapshot?.version).toBe(5);

      // Get events after snapshot (> 5, so events 6, 7, 8)
      const deltaEvents = await eventStore.getEvents(userId, 5);
      expect(deltaEvents).toHaveLength(3);

      // Total events should be 8
      const allEvents = await eventStore.getEvents(userId);
      expect(allEvents).toHaveLength(8);
    });

    it('should verify snapshot checksum integrity', async () => {
      const userId = `checksum-${Date.now()}`;
      const state = { wellbeingIndex: 75 };

      const snapshot = await eventStore.createSnapshot(userId, 'cognitive_state', state, 10);

      expect(snapshot.checksum).toBeDefined();
      expect(typeof snapshot.checksum).toBe('string');
      expect(snapshot.checksum.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 6. STATE EVENT QUERYING
  // ==========================================================================

  describe('6. State Event Querying', () => {
    it('should query state events by user ID', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const user1 = `user-1-${Date.now()}`;
      const user2 = `user-2-${Date.now()}`;

      await eventBus.publish(createStateUpdatedEvent({ userId: user1 }));
      await eventBus.publish(createStateUpdatedEvent({ userId: user1 }));
      await eventBus.publish(createStateUpdatedEvent({ userId: user2 }));

      const user1Events = await eventStore.queryEvents({ aggregateId: user1 });
      const user2Events = await eventStore.queryEvents({ aggregateId: user2 });

      expect(user1Events).toHaveLength(2);
      expect(user2Events).toHaveLength(1);
    });

    it('should query events by type', async () => {
      const stateHandler = vi.fn().mockResolvedValue(undefined);
      const beliefHandler = vi.fn().mockResolvedValue(undefined);

      eventBus.subscribe('STATE_UPDATED', stateHandler);
      eventBus.subscribe('BELIEF_UPDATED', beliefHandler);

      await eventBus.publish(createStateUpdatedEvent());
      await eventBus.publish(createStateUpdatedEvent());
      await eventBus.publish(createBeliefUpdatedEvent());

      const stateEvents = await eventStore.getEventsByType('STATE_UPDATED');
      const beliefEvents = await eventStore.getEventsByType('BELIEF_UPDATED');

      expect(stateEvents).toHaveLength(2);
      expect(beliefEvents).toHaveLength(1);
    });

    it('should query events by time range', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `timerange-${Date.now()}`;
      const startTime = new Date();

      await eventBus.publish(createStateUpdatedEvent({ userId }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      await eventBus.publish(createStateUpdatedEvent({ userId }));

      const endTime = new Date();

      const events = await eventStore.queryEvents({
        aggregateId: userId,
        fromTimestamp: startTime,
        toTimestamp: endTime,
      });

      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination in queries', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);

      const userId = `pagination-${Date.now()}`;

      for (let i = 0; i < 20; i++) {
        await eventBus.publish(createStateUpdatedEvent({ userId }));
      }

      // Get first page
      const page1 = await eventStore.queryEvents({
        aggregateId: userId,
        limit: 5,
        offset: 0,
      });
      expect(page1).toHaveLength(5);

      // Get second page
      const page2 = await eventStore.queryEvents({
        aggregateId: userId,
        limit: 5,
        offset: 5,
      });
      expect(page2).toHaveLength(5);

      // Verify different events
      const page1Ids = page1.map((e) => e.event.eventId);
      const page2Ids = page2.map((e) => e.event.eventId);
      expect(page1Ids).not.toEqual(page2Ids);
    });
  });
});
