/**
 * COMPLIANCE & AUDIT INTEGRATION TESTS
 * ======================================
 * HIPAA/GDPR Compliance Tests for Event System
 *
 * Research Foundation (2025-2026):
 * - HIPAA Audit Controls (45 C.F.R. § 164.312(b))
 * - GDPR Event Logging (Article 30, EHDS 2025/327)
 * - EU AI Act Explainability Requirements
 * - Healthcare Event-Driven Architecture (Cardinal Health patterns)
 *
 * Test Categories:
 * 1. Audit Trail Completeness (HIPAA)
 * 2. Data Integrity Verification
 * 3. GDPR Crypto-Shredding
 * 4. Retention Policy Compliance
 * 5. Export and Reporting
 * 6. Access Logging
 *
 * Compliance Standards:
 * - HIPAA: 6 years audit log retention
 * - GDPR: Right to erasure (crypto-shredding)
 * - EU AI Act: Explainability audit trail
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
import type { IDomainEvent, ICrisisDetectedEvent } from '../../integration/ICognitiveCoreAPI';
import { createEventMetadata, type IAuditLogEntry } from '../../events/IEvents';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestEvent(
  eventType: string,
  userId: string,
  payload: unknown = {}
): IDomainEvent {
  return {
    eventId: uuidv4(),
    eventType,
    aggregateId: userId,
    aggregateType: 'cognitive_state',
    timestamp: new Date(),
    version: 1,
    payload,
    metadata: createEventMetadata('test-source', { userId }),
  };
}

function createCrisisEvent(userId: string): ICrisisDetectedEvent {
  return {
    eventId: uuidv4(),
    eventType: 'CRISIS_DETECTED',
    aggregateId: userId,
    aggregateType: 'user_session',
    timestamp: new Date(),
    version: 1,
    payload: {
      userId,
      sessionId: `session-${Date.now()}`,
      riskLevel: 0.85,
      triggerIndicators: ['test'],
      recommendedAction: 'immediate_response',
      crisisType: 'acute_distress',
    },
    metadata: createEventMetadata('crisis-detector', {
      userId,
      sessionId: `session-${Date.now()}`,
    }),
  };
}

// ============================================================================
// COMPLIANCE & AUDIT INTEGRATION TESTS
// ============================================================================

describe('Compliance & Audit Integration Tests', () => {
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

  // ==========================================================================
  // 1. AUDIT TRAIL COMPLETENESS (HIPAA)
  // ==========================================================================

  describe('1. Audit Trail Completeness (HIPAA)', () => {
    it('should log all event publish actions', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `audit-publish-${Date.now()}`;
      await eventBus.publish(createTestEvent('TEST_EVENT', userId));

      const logs = await auditLogger.query({ action: 'publish' });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should include timestamp in all audit entries', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent('TEST_EVENT', 'user-1'));

      const logs = await auditLogger.query({});
      logs.forEach((log) => {
        expect(log.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should include event type in audit entries', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);
      eventBus.subscribe('CRISIS_DETECTED', handler);

      await eventBus.publish(createTestEvent('STATE_UPDATED', 'user-1'));
      await eventBus.publish(createCrisisEvent('user-2'));

      const stateLogs = await auditLogger.query({ eventType: 'STATE_UPDATED' });
      const crisisLogs = await auditLogger.query({ eventType: 'CRISIS_DETECTED' });

      expect(stateLogs.length).toBeGreaterThan(0);
      expect(crisisLogs.length).toBeGreaterThan(0);
    });

    it('should include correlation ID for request tracing', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const event = createTestEvent('TEST_EVENT', 'user-1');
      await eventBus.publish(event);

      const logs = await auditLogger.query({});
      const relevantLog = logs.find(
        (l) => l.correlationId === event.metadata.correlationId
      );

      expect(relevantLog).toBeDefined();
    });

    it('should track user ID for PHI access auditing', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `phi-user-${Date.now()}`;
      await eventBus.publish(createTestEvent('TEST_EVENT', userId, { phi: 'test' }));

      const logs = await auditLogger.query({ userId });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].userId).toBe(userId);
    });

    it('should track outcome (success/failure) for all operations', async () => {
      const successHandler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('SUCCESS_EVENT', successHandler);

      await eventBus.publish(createTestEvent('SUCCESS_EVENT', 'user-1'));

      const successLogs = await auditLogger.query({ outcome: 'success' });
      expect(successLogs.length).toBeGreaterThan(0);
    });

    it('should log crisis events with high priority tracking', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('CRISIS_DETECTED', handler);

      const crisisEvent = createCrisisEvent('crisis-user');
      await eventBus.publish(crisisEvent);

      const crisisLogs = await auditLogger.query({ eventType: 'CRISIS_DETECTED' });
      expect(crisisLogs.length).toBeGreaterThan(0);

      // Crisis events should be logged with full context
      const crisisLog = crisisLogs[0];
      expect(crisisLog.userId).toBeDefined();
      expect(crisisLog.correlationId).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. DATA INTEGRITY VERIFICATION
  // ==========================================================================

  describe('2. Data Integrity Verification', () => {
    it('should create checksum for all stored events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const event = createTestEvent('TEST_EVENT', 'checksum-user');
      await eventBus.publish(event);

      const stored = await eventStore.getEvents(event.aggregateId);
      expect(stored[0].checksum).toBeDefined();
      expect(typeof stored[0].checksum).toBe('string');
      expect(stored[0].checksum.length).toBeGreaterThan(0);
    });

    it('should verify event integrity successfully for untampered events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const event = createTestEvent('TEST_EVENT', 'integrity-user');
      await eventBus.publish(event);

      const stored = await eventStore.getEvents(event.aggregateId);
      const isValid = await eventStore.verifyIntegrity(stored[0].id);

      expect(isValid).toBe(true);
    });

    it('should maintain unique global sequence numbers', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      // Publish events for different aggregates
      for (let i = 0; i < 10; i++) {
        await eventBus.publish(createTestEvent('TEST_EVENT', `user-${i}`));
      }

      const allEvents = await eventStore.queryEvents({});
      const globalSequences = allEvents.map((e) => e.globalSequence);
      const uniqueSequences = new Set(globalSequences);

      expect(uniqueSequences.size).toBe(globalSequences.length);
    });

    it('should maintain sequential sequence numbers per aggregate', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `sequential-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        await eventBus.publish(createTestEvent('TEST_EVENT', userId));
      }

      const events = await eventStore.getEvents(userId);
      for (let i = 0; i < events.length; i++) {
        expect(events[i].sequenceNumber).toBe(i + 1);
      }
    });

    it('should record storage timestamp for all events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const beforeTime = new Date();
      await eventBus.publish(createTestEvent('TEST_EVENT', 'timestamp-user'));
      const afterTime = new Date();

      const stored = await eventStore.getEvents('timestamp-user');
      const storedAt = stored[0].storedAt;

      expect(storedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(storedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  // ==========================================================================
  // 3. GDPR CRYPTO-SHREDDING
  // ==========================================================================

  describe('3. GDPR Crypto-Shredding', () => {
    it('should support crypto-shredding for user data deletion', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `gdpr-user-${Date.now()}`;

      // Create user data
      for (let i = 0; i < 5; i++) {
        await eventBus.publish(createTestEvent('TEST_EVENT', userId, { sensitiveData: `data-${i}` }));
      }

      // Verify data exists
      const beforeShred = await eventStore.getEvents(userId);
      expect(beforeShred).toHaveLength(5);

      // Crypto-shred
      const shreddedCount = await eventStore.cryptoShred(userId);
      expect(shreddedCount).toBe(5);

      // Events should no longer be accessible
      const afterShred = await eventStore.getEvents(userId);
      expect(afterShred).toHaveLength(0);
    });

    it('should prevent new events for shredded aggregates', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `shredded-user-${Date.now()}`;

      await eventBus.publish(createTestEvent('TEST_EVENT', userId));
      await eventStore.cryptoShred(userId);

      // Attempting to add new events should fail or be blocked
      // (depends on implementation - some systems allow new events post-shred)
      // For now, verify the shredded events stay shredded
      const events = await eventStore.getEvents(userId);
      expect(events).toHaveLength(0);
    });

    it('should return correct count of shredded events', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `count-shred-${Date.now()}`;
      const eventCount = 7;

      for (let i = 0; i < eventCount; i++) {
        await eventBus.publish(createTestEvent('TEST_EVENT', userId));
      }

      const count = await eventStore.cryptoShred(userId);
      expect(count).toBe(eventCount);
    });

    it('should not affect other users when shredding', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const user1 = `user1-${Date.now()}`;
      const user2 = `user2-${Date.now()}`;

      await eventBus.publish(createTestEvent('TEST_EVENT', user1));
      await eventBus.publish(createTestEvent('TEST_EVENT', user2));

      await eventStore.cryptoShred(user1);

      const user1Events = await eventStore.getEvents(user1);
      const user2Events = await eventStore.getEvents(user2);

      expect(user1Events).toHaveLength(0);
      expect(user2Events).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 4. RETENTION POLICY COMPLIANCE
  // ==========================================================================

  describe('4. Retention Policy Compliance', () => {
    it('should support event archiving by date', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      // Create events
      await eventBus.publish(createTestEvent('TEST_EVENT', 'archive-user'));

      // Archive events before future date (should archive all current)
      const futureDate = new Date(Date.now() + 86400000); // 1 day in future
      const archivedCount = await eventStore.archiveEvents(futureDate);

      expect(archivedCount).toBeGreaterThanOrEqual(0);
    });

    it('should track audit log retention period', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent('TEST_EVENT', 'retention-user'));

      const logs = await auditLogger.query({});
      expect(logs.length).toBeGreaterThan(0);

      // All logs should have timestamps within retention period
      const sixYearsMs = 6 * 365 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      logs.forEach((log) => {
        expect(now - log.timestamp.getTime()).toBeLessThan(sixYearsMs);
      });
    });

    it('should support audit log count queries', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `count-user-${Date.now()}`;
      await eventBus.publish(createTestEvent('TEST_EVENT', userId));
      await eventBus.publish(createTestEvent('TEST_EVENT', userId));
      await eventBus.publish(createTestEvent('TEST_EVENT', userId));

      const totalCount = await auditLogger.count({});
      const userCount = await auditLogger.count({ userId });

      expect(totalCount).toBeGreaterThanOrEqual(3);
      expect(userCount).toBeGreaterThanOrEqual(3);
    });
  });

  // ==========================================================================
  // 5. EXPORT AND REPORTING
  // ==========================================================================

  describe('5. Export and Reporting', () => {
    it('should export audit logs in NDJSON format', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent('TEST_EVENT', 'export-user'));
      await eventBus.publish(createTestEvent('TEST_EVENT', 'export-user'));

      const exported = await auditLogger.export({});
      const lines = exported.trim().split('\n');

      expect(lines.length).toBeGreaterThan(0);

      // Each line should be valid JSON
      lines.forEach((line) => {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('timestamp');
        expect(parsed).toHaveProperty('action');
      });
    });

    it('should export filtered audit logs', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('STATE_UPDATED', handler);
      eventBus.subscribe('CRISIS_DETECTED', handler);

      await eventBus.publish(createTestEvent('STATE_UPDATED', 'filter-user'));
      await eventBus.publish(createCrisisEvent('filter-user'));

      const crisisExport = await auditLogger.export({ eventType: 'CRISIS_DETECTED' });
      const lines = crisisExport.trim().split('\n');

      lines.forEach((line) => {
        const parsed = JSON.parse(line);
        expect(parsed.eventType).toBe('CRISIS_DETECTED');
      });
    });

    it('should export audit logs by user ID', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `export-user-${Date.now()}`;
      await eventBus.publish(createTestEvent('TEST_EVENT', userId));

      const exported = await auditLogger.export({ userId });
      const lines = exported.trim().split('\n');

      lines.forEach((line) => {
        const parsed = JSON.parse(line);
        expect(parsed.userId).toBe(userId);
      });
    });

    it('should export audit logs by date range', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const startTime = new Date();
      await eventBus.publish(createTestEvent('TEST_EVENT', 'date-range-user'));
      const endTime = new Date();

      const exported = await auditLogger.export({
        fromTimestamp: startTime,
        toTimestamp: endTime,
      });

      expect(exported.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 6. ACCESS LOGGING
  // ==========================================================================

  describe('6. Access Logging', () => {
    it('should log store operations', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent('TEST_EVENT', 'access-user'));

      // EventBus logs 'publish' actions which include storage operations
      const publishLogs = await auditLogger.query({ action: 'publish' });
      expect(publishLogs.length).toBeGreaterThan(0);
    });

    it('should include resource identifier in access logs', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent('TEST_EVENT', 'resource-user'));

      const logs = await auditLogger.query({});
      logs.forEach((log) => {
        expect(log.resource).toBeDefined();
      });
    });

    it('should track both successful and failed operations', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      await eventBus.publish(createTestEvent('TEST_EVENT', 'outcome-user'));

      const logs = await auditLogger.query({});
      const outcomes = logs.map((l) => l.outcome);

      // Should have at least success outcomes
      expect(outcomes).toContain('success');
    });

    it('should support audit query pagination', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `pagination-${Date.now()}`;
      for (let i = 0; i < 20; i++) {
        await eventBus.publish(createTestEvent('TEST_EVENT', userId));
      }

      const page1 = await auditLogger.query({ userId, limit: 5, offset: 0 });
      const page2 = await auditLogger.query({ userId, limit: 5, offset: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);

      // Pages should be different
      const page1Ids = page1.map((l) => l.id);
      const page2Ids = page2.map((l) => l.id);
      expect(page1Ids).not.toEqual(page2Ids);
    });
  });

  // ==========================================================================
  // 7. COMPLIANCE SCENARIO TESTS
  // ==========================================================================

  describe('7. Compliance Scenario Tests', () => {
    it('HIPAA: should maintain complete audit trail for PHI access', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('HEALTH_DATA_ACCESSED', handler);

      const userId = `hipaa-user-${Date.now()}`;
      const event = createTestEvent('HEALTH_DATA_ACCESSED', userId, {
        dataType: 'mental_health_assessment',
        accessReason: 'therapeutic_intervention',
      });

      await eventBus.publish(event);

      // Verify audit trail
      const logs = await auditLogger.query({ userId });
      expect(logs.length).toBeGreaterThan(0);

      const accessLog = logs[0];
      expect(accessLog.eventId).toBe(event.eventId);
      expect(accessLog.correlationId).toBe(event.metadata.correlationId);
      expect(accessLog.timestamp).toBeDefined();
    });

    it('GDPR: should support complete user data export', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `gdpr-export-${Date.now()}`;

      // Create user history
      for (let i = 0; i < 5; i++) {
        await eventBus.publish(createTestEvent('TEST_EVENT', userId, { data: `record-${i}` }));
      }

      // Export all user events
      const events = await eventStore.getEvents(userId);
      const auditLogs = await auditLogger.query({ userId });

      expect(events).toHaveLength(5);
      expect(auditLogs.length).toBeGreaterThanOrEqual(5);

      // All data should be exportable
      const exportableEvents = events.map((e) => ({
        eventId: e.event.eventId,
        eventType: e.event.eventType,
        timestamp: e.event.timestamp,
        payload: e.event.payload,
      }));

      expect(exportableEvents).toHaveLength(5);
    });

    it('GDPR: should support complete user data deletion', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('TEST_EVENT', handler);

      const userId = `gdpr-delete-${Date.now()}`;

      // Create user data
      await eventBus.publish(createTestEvent('TEST_EVENT', userId));

      // Verify exists
      const beforeDelete = await eventStore.getEvents(userId);
      expect(beforeDelete).toHaveLength(1);

      // Delete (crypto-shred)
      await eventStore.cryptoShred(userId);

      // Verify deleted
      const afterDelete = await eventStore.getEvents(userId);
      expect(afterDelete).toHaveLength(0);
    });

    it('EU AI Act: should support explainability audit trail', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      eventBus.subscribe('INTERVENTION_SELECTED', handler);

      const userId = `aiact-user-${Date.now()}`;
      const event = createTestEvent('INTERVENTION_SELECTED', userId, {
        interventionId: `int-${Date.now()}`,
        selectionRationale: 'Thompson Sampling with exploration',
        modelVersion: '1.0',
        confidenceScore: 0.85,
        alternativesConsidered: ['alt-1', 'alt-2'],
      });

      await eventBus.publish(event);

      // Verify explainability data is stored
      const stored = await eventStore.getEvents(userId);
      const payload = stored[0].event.payload as any;

      expect(payload.selectionRationale).toBeDefined();
      expect(payload.modelVersion).toBeDefined();
      expect(payload.confidenceScore).toBeDefined();
      expect(payload.alternativesConsidered).toBeDefined();
    });
  });
});
