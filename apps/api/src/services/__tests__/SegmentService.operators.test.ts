import {beforeEach, describe, expect, it} from 'vitest';
import {SegmentService} from '../SegmentService';
import {factories, getPrismaClient} from '../../../../../test/helpers';

/**
 * Comprehensive Operator Tests for Segment Filtering
 *
 * This file systematically tests ALL supported operators across different
 * data types to ensure complete coverage of filtering logic.
 *
 * Supported Operators:
 * - String: equals, notEquals, contains, notContains
 * - Numeric: greaterThan, lessThan, greaterThanOrEqual, lessThanOrEqual
 * - Existence: exists, notExists
 * - Temporal: within
 */
describe('SegmentService - Comprehensive Operator Tests', () => {
  let projectId: string;

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  // ========================================
  // STRING OPERATORS
  // ========================================
  describe('String Operators', () => {
    describe('equals operator', () => {
      it('should match exact string values in JSON data fields', async () => {
        const match = await factories.createContact({
          projectId,
          data: {plan: 'premium'},
        });
        await factories.createContact({
          projectId,
          data: {plan: 'basic'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.plan', operator: 'equals', value: 'premium'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match exact string values in standard fields (case-insensitive)', async () => {
        const match = await factories.createContact({
          projectId,
          email: 'user@example.com',
        });
        await factories.createContact({
          projectId,
          email: 'other@example.com',
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'email', operator: 'equals', value: 'USER@EXAMPLE.COM'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match boolean values', async () => {
        const match = await factories.createContact({
          projectId,
          subscribed: true,
        });
        await factories.createContact({
          projectId,
          subscribed: false,
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'subscribed', operator: 'equals', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match numeric values as strings in JSON fields', async () => {
        const match = await factories.createContact({
          projectId,
          data: {userId: '12345'},
        });
        await factories.createContact({
          projectId,
          data: {userId: '67890'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.userId', operator: 'equals', value: '12345'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });

    describe('notEquals operator', () => {
      it('should exclude exact matches in JSON data fields', async () => {
        const match = await factories.createContact({
          projectId,
          data: {plan: 'premium'},
        });
        await factories.createContact({
          projectId,
          data: {plan: 'basic'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.plan', operator: 'notEquals', value: 'basic'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should exclude boolean false values', async () => {
        const match = await factories.createContact({
          projectId,
          subscribed: true,
        });
        await factories.createContact({
          projectId,
          subscribed: false,
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'subscribed', operator: 'notEquals', value: false}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should NOT include contacts where field does not exist (only excludes matching values)', async () => {
        const withMatchingField = await factories.createContact({
          projectId,
          data: {plan: 'basic'},
        });
        const withDifferentValue = await factories.createContact({
          projectId,
          data: {plan: 'premium'},
        });
        const withoutField = await factories.createContact({
          projectId,
          data: {other: 'value'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.plan', operator: 'notEquals', value: 'basic'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        // notEquals only matches where field exists and has different value
        expect(ids).toContain(withDifferentValue.id);
        expect(ids).not.toContain(withMatchingField.id);
        expect(ids).not.toContain(withoutField.id);
      });
    });

    describe('contains operator', () => {
      it('should match substring in JSON data fields', async () => {
        const match = await factories.createContact({
          projectId,
          data: {company: 'Acme Corporation'},
        });
        await factories.createContact({
          projectId,
          data: {company: 'Other Industries'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'contains', value: 'Acme'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match substring in email field (case-insensitive)', async () => {
        const match1 = await factories.createContact({
          projectId,
          email: 'user@company.com',
        });
        const match2 = await factories.createContact({
          projectId,
          email: 'admin@COMPANY.org',
        });
        await factories.createContact({
          projectId,
          email: 'user@example.com',
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'email', operator: 'contains', value: 'company'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(match1.id);
        expect(ids).toContain(match2.id);
        expect(result.data).toHaveLength(2);
      });

      it('should not match when field does not exist', async () => {
        await factories.createContact({
          projectId,
          data: {other: 'value'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'contains', value: 'Acme'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should match partial domain in email', async () => {
        const gmailUser = await factories.createContact({
          projectId,
          email: 'user@gmail.com',
        });
        await factories.createContact({
          projectId,
          email: 'user@hotmail.com',
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'email', operator: 'contains', value: 'gmail'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(gmailUser.id);
      });
    });

    describe('notContains operator', () => {
      it('should exclude substring matches in JSON data fields', async () => {
        const match = await factories.createContact({
          projectId,
          data: {company: 'Other Industries'},
        });
        await factories.createContact({
          projectId,
          data: {company: 'Acme Corporation'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'notContains', value: 'Acme'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should NOT include contacts where field does not exist (only excludes matching substrings)', async () => {
        const withoutField = await factories.createContact({
          projectId,
          data: {other: 'value'},
        });
        const withMatchingSubstring = await factories.createContact({
          projectId,
          data: {company: 'Acme Corporation'},
        });
        const withDifferentValue = await factories.createContact({
          projectId,
          data: {company: 'Other Industries'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'notContains', value: 'Acme'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        // notContains only matches where field exists and doesn't contain substring
        expect(ids).toContain(withDifferentValue.id);
        expect(ids).not.toContain(withMatchingSubstring.id);
        expect(ids).not.toContain(withoutField.id);
      });

      it('should exclude email domains (case-insensitive)', async () => {
        const match = await factories.createContact({
          projectId,
          email: 'user@example.com',
        });
        await factories.createContact({
          projectId,
          email: 'user@GMAIL.com',
        });
        await factories.createContact({
          projectId,
          email: 'admin@gmail.org',
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'email', operator: 'notContains', value: 'gmail'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });
  });

  // ========================================
  // NUMERIC OPERATORS
  // ========================================
  describe('Numeric Operators', () => {
    describe('greaterThan operator', () => {
      it('should match values greater than threshold', async () => {
        const high = await factories.createContact({
          projectId,
          data: {score: 100},
        });
        const veryHigh = await factories.createContact({
          projectId,
          data: {score: 200},
        });
        await factories.createContact({
          projectId,
          data: {score: 50},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'greaterThan', value: 50}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(high.id);
        expect(ids).toContain(veryHigh.id);
        expect(result.data).toHaveLength(2);
      });

      it('should exclude values equal to threshold', async () => {
        await factories.createContact({
          projectId,
          data: {score: 50},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'greaterThan', value: 50}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should work with negative numbers', async () => {
        const match = await factories.createContact({
          projectId,
          data: {temperature: 5},
        });
        await factories.createContact({
          projectId,
          data: {temperature: -10},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.temperature', operator: 'greaterThan', value: 0}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should work with decimal values', async () => {
        const match = await factories.createContact({
          projectId,
          data: {rating: 4.5},
        });
        await factories.createContact({
          projectId,
          data: {rating: 3.2},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.rating', operator: 'greaterThan', value: 4.0}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });

    describe('greaterThanOrEqual operator', () => {
      it('should match values greater than or equal to threshold', async () => {
        const equal = await factories.createContact({
          projectId,
          data: {score: 50},
        });
        const greater = await factories.createContact({
          projectId,
          data: {score: 100},
        });
        await factories.createContact({
          projectId,
          data: {score: 25},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'greaterThanOrEqual', value: 50}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(equal.id);
        expect(ids).toContain(greater.id);
        expect(result.data).toHaveLength(2);
      });
    });

    describe('lessThan operator', () => {
      it('should match values less than threshold', async () => {
        const low = await factories.createContact({
          projectId,
          data: {score: 25},
        });
        const veryLow = await factories.createContact({
          projectId,
          data: {score: 10},
        });
        await factories.createContact({
          projectId,
          data: {score: 50},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'lessThan', value: 50}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(low.id);
        expect(ids).toContain(veryLow.id);
        expect(result.data).toHaveLength(2);
      });

      it('should exclude values equal to threshold', async () => {
        await factories.createContact({
          projectId,
          data: {score: 50},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'lessThan', value: 50}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });
    });

    describe('lessThanOrEqual operator', () => {
      it('should match values less than or equal to threshold', async () => {
        const equal = await factories.createContact({
          projectId,
          data: {score: 50},
        });
        const less = await factories.createContact({
          projectId,
          data: {score: 25},
        });
        await factories.createContact({
          projectId,
          data: {score: 100},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'lessThanOrEqual', value: 50}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(equal.id);
        expect(ids).toContain(less.id);
        expect(result.data).toHaveLength(2);
      });
    });

    describe('Numeric edge cases', () => {
      it('should handle zero values correctly', async () => {
        // Create a contact with balance 0 (should NOT match greaterThan 0)
        await factories.createContact({
          projectId,
          data: {balance: 0},
        });
        const positive = await factories.createContact({
          projectId,
          data: {balance: 100},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.balance', operator: 'greaterThan', value: 0}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(positive.id);
      });

      it('should handle very large numbers', async () => {
        const match = await factories.createContact({
          projectId,
          data: {views: 1000000},
        });
        await factories.createContact({
          projectId,
          data: {views: 500000},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.views', operator: 'greaterThanOrEqual', value: 1000000}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });
  });

  // ========================================
  // EXISTENCE OPERATORS
  // ========================================
  describe('Existence Operators', () => {
    describe('exists operator', () => {
      it('should match contacts where field exists and is not null', async () => {
        const withField = await factories.createContact({
          projectId,
          data: {company: 'Acme Inc'},
        });
        await factories.createContact({
          projectId,
          data: {name: 'John'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'exists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(withField.id);
      });

      it('should exclude contacts where field is null', async () => {
        const withValue = await factories.createContact({
          projectId,
          data: {company: 'Acme Inc'},
        });
        await factories.createContact({
          projectId,
          data: {company: null},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'exists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(withValue.id);
      });

      it('should match fields with empty string values', async () => {
        const withEmptyString = await factories.createContact({
          projectId,
          data: {notes: ''},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.notes', operator: 'exists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(withEmptyString.id);
      });

      it('should match fields with zero values', async () => {
        const withZero = await factories.createContact({
          projectId,
          data: {score: 0},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'exists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(withZero.id);
      });

      it('should match fields with boolean false values', async () => {
        const withFalse = await factories.createContact({
          projectId,
          data: {verified: false},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.verified', operator: 'exists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(withFalse.id);
      });
    });

    describe('notExists operator', () => {
      it('should match contacts where field does not exist', async () => {
        const withoutField = await factories.createContact({
          projectId,
          data: {name: 'John'},
        });
        await factories.createContact({
          projectId,
          data: {company: 'Acme Inc'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'notExists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(withoutField.id);
      });

      it('should match contacts where field is null', async () => {
        const withNull = await factories.createContact({
          projectId,
          data: {company: null},
        });
        await factories.createContact({
          projectId,
          data: {company: 'Acme Inc'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.company', operator: 'notExists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(withNull.id);
      });

      it('should exclude fields with empty string values', async () => {
        await factories.createContact({
          projectId,
          data: {notes: ''},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.notes', operator: 'notExists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should exclude fields with zero values', async () => {
        await factories.createContact({
          projectId,
          data: {score: 0},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'data.score', operator: 'notExists', value: true}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });
    });
  });

  // ========================================
  // TEMPORAL OPERATORS
  // ========================================
  describe('Temporal Operators', () => {
    describe('within operator', () => {
      it('should match contacts created within specified days', async () => {
        const recent = await factories.createContact({projectId});

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'createdAt',
              operator: 'within',
              value: 1,
              unit: 'days',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(recent.id);
      });

      it('should match contacts created within specified hours', async () => {
        const veryRecent = await factories.createContact({projectId});

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'createdAt',
              operator: 'within',
              value: 24,
              unit: 'hours',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(veryRecent.id);
      });

      it('should match contacts created within specified minutes', async () => {
        const justNow = await factories.createContact({projectId});

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'createdAt',
              operator: 'within',
              value: 60,
              unit: 'minutes',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(justNow.id);
      });
    });

    describe('within operator for JSON date fields', () => {
      it('should match contacts with JSON date field within specified days', async () => {
        // Create contact with recent date in JSON field
        const recentDate = new Date();
        const match = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: recentDate.toISOString(),
          },
        });

        // Create contact with old date
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);
        await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: oldDate.toISOString(),
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.subscriptionEndDate',
              operator: 'within',
              value: 3,
              unit: 'days',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match contacts with JSON date field within specified hours', async () => {
        const recentDate = new Date();
        const match = await factories.createContact({
          projectId,
          data: {
            lastLoginAt: recentDate.toISOString(),
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.lastLoginAt',
              operator: 'within',
              value: 24,
              unit: 'hours',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match contacts with JSON date field within specified minutes', async () => {
        const justNow = new Date();
        const match = await factories.createContact({
          projectId,
          data: {
            verifiedAt: justNow.toISOString(),
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.verifiedAt',
              operator: 'within',
              value: 60,
              unit: 'minutes',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should NOT match contacts with JSON date field outside the time range', async () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);
        await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: oldDate.toISOString(),
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.subscriptionEndDate',
              operator: 'within',
              value: 3,
              unit: 'days',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should NOT match contacts where JSON date field does not exist', async () => {
        await factories.createContact({
          projectId,
          data: {
            otherField: 'value',
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.subscriptionEndDate',
              operator: 'within',
              value: 3,
              unit: 'days',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should handle null values in JSON date fields gracefully', async () => {
        await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: null,
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.subscriptionEndDate',
              operator: 'within',
              value: 3,
              unit: 'days',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should work correctly with combined filters (AND logic)', async () => {
        const recentDate = new Date();
        const match = await factories.createContact({
          projectId,
          subscribed: true,
          data: {
            plan: 'premium',
            subscriptionEndDate: recentDate.toISOString(),
          },
        });

        await factories.createContact({
          projectId,
          subscribed: false,
          data: {
            plan: 'premium',
            subscriptionEndDate: recentDate.toISOString(),
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {field: 'subscribed', operator: 'equals', value: true},
            {field: 'data.plan', operator: 'equals', value: 'premium'},
            {
              field: 'data.subscriptionEndDate',
              operator: 'within',
              value: 3,
              unit: 'days',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should require unit parameter for within operator', async () => {
        await expect(
          SegmentService.create(projectId, {
            name: 'Invalid Segment',
            condition: {
              logic: 'AND',
              groups: [
                {
                  filters: [
                    {
                      field: 'data.subscriptionEndDate',
                      operator: 'within',
                      value: 3,
                      // unit intentionally omitted
                    } as unknown,
                  ],
                },
              ],
            },
          }),
        ).rejects.toThrow(/operator requires a unit/i);
      });
    });
  });

  // ========================================
  // DATE COMPARISON OPERATORS
  // ========================================
  describe('Date Comparison Operators', () => {
    it('should support greaterThan for dates', async () => {
      const older = await factories.createContact({projectId});
      await new Promise(resolve => setTimeout(resolve, 10));
      const newer = await factories.createContact({projectId});

      const segment = await factories.createSegment(projectId, {
        filters: [
          {
            field: 'createdAt',
            operator: 'greaterThan',
            value: older.createdAt.toISOString(),
          },
        ],
      });

      const result = await SegmentService.getContacts(projectId, segment.id);
      const ids = result.data.map(c => c.id);
      expect(ids).toContain(newer.id);
      expect(ids).not.toContain(older.id);
    });

    it('should support lessThanOrEqual for dates', async () => {
      const first = await factories.createContact({projectId});
      await new Promise(resolve => setTimeout(resolve, 10));
      const second = await factories.createContact({projectId});
      await new Promise(resolve => setTimeout(resolve, 10));
      const third = await factories.createContact({projectId});

      const segment = await factories.createSegment(projectId, {
        filters: [
          {
            field: 'createdAt',
            operator: 'lessThanOrEqual',
            value: second.createdAt.toISOString(),
          },
        ],
      });

      const result = await SegmentService.getContacts(projectId, segment.id);
      const ids = result.data.map(c => c.id);
      expect(ids).toContain(first.id);
      expect(ids).toContain(second.id);
      expect(ids).not.toContain(third.id);
    });
  });

  // ========================================
  // DATE-ONLY COMPARISON (equals/notEquals)
  // ========================================
  describe('Date-Only Comparison for equals/notEquals', () => {
    describe('JSON date fields', () => {
      it('should match contacts with date on the same day (equals) - ignoring time', async () => {
        const targetDate = '2025-01-15';
        const match1 = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: '2025-01-15T08:30:00.000Z', // Morning
          },
        });
        const match2 = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: '2025-01-15T18:45:30.000Z', // Evening
          },
        });
        const noMatch = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: '2025-01-16T00:00:00.000Z', // Next day
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.subscriptionEndDate',
              operator: 'equals',
              value: targetDate,
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(match1.id);
        expect(ids).toContain(match2.id);
        expect(ids).not.toContain(noMatch.id);
      });

      it('should exclude contacts with date on the specified day (notEquals)', async () => {
        const targetDate = '2025-01-15';
        const match1 = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: '2025-01-14T23:59:59.999Z', // Day before
          },
        });
        const match2 = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: '2025-01-16T00:00:00.000Z', // Day after
          },
        });
        const noMatch = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: '2025-01-15T12:00:00.000Z', // Same day
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.subscriptionEndDate',
              operator: 'notEquals',
              value: targetDate,
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(match1.id);
        expect(ids).toContain(match2.id);
        expect(ids).not.toContain(noMatch.id);
      });

      it('should handle date string with time component (extracts date only)', async () => {
        const targetDate = '2025-01-15T00:00:00.000Z'; // Has time component
        const match = await factories.createContact({
          projectId,
          data: {
            subscriptionEndDate: '2025-01-15T23:59:59.999Z', // End of day
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.subscriptionEndDate',
              operator: 'equals',
              value: targetDate,
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(match.id);
      });

      it('should still do exact match for non-date strings', async () => {
        const match = await factories.createContact({
          projectId,
          data: {
            plan: 'premium',
          },
        });
        await factories.createContact({
          projectId,
          data: {
            plan: 'basic',
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'data.plan',
              operator: 'equals',
              value: 'premium',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });

    describe('Native date fields (createdAt)', () => {
      it('should match contacts created on the same day (equals) - ignoring time', async () => {
        // Create contacts on specific dates
        const jan15Morning = new Date('2025-01-15T08:30:00.000Z');
        const jan15Evening = new Date('2025-01-15T18:45:30.000Z');
        const jan16 = new Date('2025-01-16T00:00:00.000Z');

        const prisma = getPrismaClient();

        const match1 = await factories.createContact({projectId});
        await prisma.contact.update({
          where: {id: match1.id},
          data: {createdAt: jan15Morning},
        });

        const match2 = await factories.createContact({projectId});
        await prisma.contact.update({
          where: {id: match2.id},
          data: {createdAt: jan15Evening},
        });

        const noMatch = await factories.createContact({projectId});
        await prisma.contact.update({
          where: {id: noMatch.id},
          data: {createdAt: jan16},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'createdAt',
              operator: 'equals',
              value: '2025-01-15',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(match1.id);
        expect(ids).toContain(match2.id);
        expect(ids).not.toContain(noMatch.id);
      });

      it('should exclude contacts created on the specified day (notEquals)', async () => {
        const jan14 = new Date('2025-01-14T23:59:59.999Z');
        const jan15 = new Date('2025-01-15T12:00:00.000Z');
        const jan16 = new Date('2025-01-16T00:00:00.000Z');

        const prisma = getPrismaClient();

        const match1 = await factories.createContact({projectId});
        await prisma.contact.update({
          where: {id: match1.id},
          data: {createdAt: jan14},
        });

        const match2 = await factories.createContact({projectId});
        await prisma.contact.update({
          where: {id: match2.id},
          data: {createdAt: jan16},
        });

        const noMatch = await factories.createContact({projectId});
        await prisma.contact.update({
          where: {id: noMatch.id},
          data: {createdAt: jan15},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {
              field: 'createdAt',
              operator: 'notEquals',
              value: '2025-01-15',
            },
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        const ids = result.data.map(c => c.id);
        expect(ids).toContain(match1.id);
        expect(ids).toContain(match2.id);
        expect(ids).not.toContain(noMatch.id);
      });
    });
  });

  // ========================================
  // COMBINED OPERATORS (AND logic)
  // ========================================
  describe('Multiple Operators Combined', () => {
    it('should apply AND logic across different operator types', async () => {
      const match = await factories.createContact({
        projectId,
        subscribed: true,
        data: {
          plan: 'premium',
          score: 85,
          company: 'Acme Inc',
        },
      });

      await factories.createContact({
        projectId,
        subscribed: false,
        data: {plan: 'premium', score: 85, company: 'Acme Inc'},
      });

      await factories.createContact({
        projectId,
        subscribed: true,
        data: {plan: 'basic', score: 85, company: 'Acme Inc'},
      });

      await factories.createContact({
        projectId,
        subscribed: true,
        data: {plan: 'premium', score: 50, company: 'Acme Inc'},
      });

      const segment = await factories.createSegment(projectId, {
        filters: [
          {field: 'subscribed', operator: 'equals', value: true},
          {field: 'data.plan', operator: 'equals', value: 'premium'},
          {field: 'data.score', operator: 'greaterThanOrEqual', value: 80},
          {field: 'data.company', operator: 'contains', value: 'Acme'},
        ],
      });

      const result = await SegmentService.getContacts(projectId, segment.id);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(match.id);
    });

    it('should combine existence checks with value comparisons', async () => {
      const match = await factories.createContact({
        projectId,
        data: {
          company: 'Tech Corp',
          revenue: 100000,
        },
      });

      await factories.createContact({
        projectId,
        data: {company: 'Tech Corp'}, // Missing revenue
      });

      await factories.createContact({
        projectId,
        data: {revenue: 100000}, // Missing company
      });

      const segment = await factories.createSegment(projectId, {
        filters: [
          {field: 'data.company', operator: 'exists', value: true},
          {field: 'data.revenue', operator: 'greaterThanOrEqual', value: 100000},
        ],
      });

      const result = await SegmentService.getContacts(projectId, segment.id);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(match.id);
    });
  });

  // ========================================
  // EVENT OPERATORS
  // ========================================
  describe('Event Operators', () => {
    describe('triggered operator', () => {
      it('should match contacts who have triggered the event', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});

        // Create event for match contact
        await prisma.event.create({
          data: {
            projectId,
            contactId: match.id,
            name: 'purchase',
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'triggered'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should not match contacts who have not triggered the event', async () => {
        const prisma = getPrismaClient();
        const contact1 = await factories.createContact({projectId});

        // Create different event
        await prisma.event.create({
          data: {
            projectId,
            contactId: contact1.id,
            name: 'signup',
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'triggered'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should match contacts with multiple occurrences of the same event', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});

        // Create multiple events
        await prisma.event.createMany({
          data: [
            {projectId, contactId: match.id, name: 'purchase'},
            {projectId, contactId: match.id, name: 'purchase'},
            {projectId, contactId: match.id, name: 'purchase'},
          ],
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'triggered'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });

    describe('triggeredWithin operator', () => {
      it('should match contacts with event within time range (days)', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});
        const noMatch = await factories.createContact({projectId});

        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

        // Recent event
        await prisma.event.create({
          data: {
            projectId,
            contactId: match.id,
            name: 'purchase',
            createdAt: twoDaysAgo,
          },
        });

        // Old event
        await prisma.event.create({
          data: {
            projectId,
            contactId: noMatch.id,
            name: 'purchase',
            createdAt: eightDaysAgo,
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'triggeredWithin', value: 7, unit: 'days'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match contacts with event within time range (hours)', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});
        const noMatch = await factories.createContact({projectId});

        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

        await prisma.event.create({
          data: {
            projectId,
            contactId: match.id,
            name: 'login',
            createdAt: twoHoursAgo,
          },
        });

        await prisma.event.create({
          data: {
            projectId,
            contactId: noMatch.id,
            name: 'login',
            createdAt: sixHoursAgo,
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.login', operator: 'triggeredWithin', value: 4, unit: 'hours'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should match contacts with event within time range (minutes)', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});
        const noMatch = await factories.createContact({projectId});

        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);

        await prisma.event.create({
          data: {
            projectId,
            contactId: match.id,
            name: 'click',
            createdAt: fiveMinutesAgo,
          },
        });

        await prisma.event.create({
          data: {
            projectId,
            contactId: noMatch.id,
            name: 'click',
            createdAt: twentyMinutesAgo,
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.click', operator: 'triggeredWithin', value: 10, unit: 'minutes'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should handle events at exact boundary', async () => {
        const prisma = getPrismaClient();
        const contact = await factories.createContact({projectId});

        const now = new Date();
        const exactlySevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        await prisma.event.create({
          data: {
            projectId,
            contactId: contact.id,
            name: 'purchase',
            createdAt: exactlySevenDaysAgo,
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'triggeredWithin', value: 7, unit: 'days'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        // Should not match because events at exact boundary are excluded
        expect(result.data).toHaveLength(0);
      });

      it('should not match contacts with event outside time range', async () => {
        const prisma = getPrismaClient();
        const contact = await factories.createContact({projectId});

        const now = new Date();
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

        await prisma.event.create({
          data: {
            projectId,
            contactId: contact.id,
            name: 'purchase',
            createdAt: tenDaysAgo,
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'triggeredWithin', value: 7, unit: 'days'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should match contact if any of their events is within range', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});

        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Old event
        await prisma.event.create({
          data: {
            projectId,
            contactId: match.id,
            name: 'purchase',
            createdAt: thirtyDaysAgo,
          },
        });

        // Recent event
        await prisma.event.create({
          data: {
            projectId,
            contactId: match.id,
            name: 'purchase',
            createdAt: twoDaysAgo,
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'triggeredWithin', value: 7, unit: 'days'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });

    describe('notTriggered operator', () => {
      it('should match contacts who have never triggered the event', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});
        const noMatch = await factories.createContact({projectId});

        // Only noMatch has the event
        await prisma.event.create({
          data: {
            projectId,
            contactId: noMatch.id,
            name: 'purchase',
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'notTriggered'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should not match contacts who have triggered the event', async () => {
        const prisma = getPrismaClient();
        const contact = await factories.createContact({projectId});

        await prisma.event.create({
          data: {
            projectId,
            contactId: contact.id,
            name: 'purchase',
          },
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'notTriggered'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(0);
      });

      it('should match contacts with other events but not the target event', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});

        // Create different events
        await prisma.event.createMany({
          data: [
            {projectId, contactId: match.id, name: 'signup'},
            {projectId, contactId: match.id, name: 'login'},
          ],
        });

        const segment = await factories.createSegment(projectId, {
          filters: [{field: 'event.purchase', operator: 'notTriggered'}],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });

    describe('Event operators with combined filters', () => {
      it('should combine event filter with contact field filter (AND)', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({
          projectId,
          data: {plan: 'premium'},
        });
        const noMatch1 = await factories.createContact({
          projectId,
          data: {plan: 'basic'},
        });

        // match and noMatch1 have the event, but only match has premium plan
        await prisma.event.create({
          data: {projectId, contactId: match.id, name: 'purchase'},
        });
        await prisma.event.create({
          data: {projectId, contactId: noMatch1.id, name: 'purchase'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {field: 'event.purchase', operator: 'triggered'},
            {field: 'data.plan', operator: 'equals', value: 'premium'},
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });

      it('should combine multiple event filters', async () => {
        const prisma = getPrismaClient();
        const match = await factories.createContact({projectId});
        const noMatch = await factories.createContact({projectId});

        // match has both events
        await prisma.event.createMany({
          data: [
            {projectId, contactId: match.id, name: 'signup'},
            {projectId, contactId: match.id, name: 'purchase'},
          ],
        });

        // noMatch only has signup
        await prisma.event.create({
          data: {projectId, contactId: noMatch.id, name: 'signup'},
        });

        const segment = await factories.createSegment(projectId, {
          filters: [
            {field: 'event.signup', operator: 'triggered'},
            {field: 'event.purchase', operator: 'triggered'},
          ],
        });

        const result = await SegmentService.getContacts(projectId, segment.id);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(match.id);
      });
    });
  });
});
