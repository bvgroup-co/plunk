/**
 * Example Test File
 *
 * This file demonstrates common testing patterns used in the Plunk V2 codebase.
 * Use this as a reference when writing new tests.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {factories, getPrismaClient, createTimeControl, createMockQueues, createServiceMocks} from '../helpers';
import {CampaignStatus, WorkflowStepType, EmailStatus, StepExecutionStatus} from '@plunk/db';

describe('Example Tests - Common Patterns', () => {
  let projectId: string;
  const prisma = getPrismaClient();
  const timeControl = createTimeControl();

  beforeEach(async () => {
    // Create fresh test data before each test
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  afterEach(() => {
    // Restore real timers after each test
    timeControl.restore();
  });

  describe('Pattern 1: Basic CRUD Testing', () => {
    it('should create and retrieve an entity', async () => {
      // Arrange: Set up test data
      const campaignData = {
        name: 'Welcome Campaign',
        subject: 'Welcome to Plunk!',
        body: '<p>Thanks for signing up</p>',
        from: 'hello@example.com',
      };

      // Act: Create the campaign
      const campaign = await factories.createCampaign({
        projectId,
        ...campaignData,
      });

      // Assert: Verify it was created correctly
      expect(campaign.id).toBeDefined();
      expect(campaign.name).toBe('Welcome Campaign');
      expect(campaign.status).toBe(CampaignStatus.DRAFT);

      // Act: Retrieve it
      const retrieved = await prisma.campaign.findUnique({
        where: {id: campaign.id},
      });

      // Assert: Verify retrieval
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Welcome Campaign');
    });

    it('should update an entity', async () => {
      const campaign = await factories.createCampaign({
        projectId,
        name: 'Original Name',
      });

      // Update
      const updated = await prisma.campaign.update({
        where: {id: campaign.id},
        data: {name: 'Updated Name'},
      });

      expect(updated.name).toBe('Updated Name');
    });

    it('should delete an entity', async () => {
      const campaign = await factories.createCampaign({projectId});

      // Delete
      await prisma.campaign.delete({
        where: {id: campaign.id},
      });

      // Verify deletion
      const deleted = await prisma.campaign.findUnique({
        where: {id: campaign.id},
      });

      expect(deleted).toBeNull();
    });
  });

  describe('Pattern 2: Testing Relationships', () => {
    it('should create entities with relationships', async () => {
      // Create related entities
      const segment = await factories.createSegment(projectId, {
        name: 'Premium Users',
      });

      const campaign = await factories.createCampaign({
        projectId,
        segmentId: segment.id,
      });

      // Verify relationship
      const campaignWithSegment = await prisma.campaign.findUnique({
        where: {id: campaign.id},
        include: {segment: true},
      });

      expect(campaignWithSegment?.segment).toBeDefined();
      expect(campaignWithSegment?.segment?.name).toBe('Premium Users');
    });

    it('should handle one-to-many relationships', async () => {
      const contact = await factories.createContact({projectId});

      // Create multiple emails for one contact
      const email1 = await factories.createEmail(projectId, contact.id);
      const email2 = await factories.createEmail(projectId, contact.id);
      const email3 = await factories.createEmail(projectId, contact.id);

      // Verify all emails are associated with the contact
      const contactWithEmails = await prisma.contact.findUnique({
        where: {id: contact.id},
        include: {emails: true},
      });

      expect(contactWithEmails?.emails).toHaveLength(3);
    });
  });

  describe('Pattern 3: Testing with Time Control', () => {
    it('should schedule something for the future', async () => {
      // Freeze time at a known point
      const now = timeControl.freeze(new Date('2025-01-20T10:00:00Z'));

      // Schedule for 2 hours from now
      const scheduledTime = timeControl.helpers.relative(2, 'hour');

      const campaign = await factories.createScheduledCampaign(projectId, scheduledTime, {name: 'Future Campaign'});

      // Verify it's scheduled for the future
      expect(campaign.scheduledFor).toEqual(scheduledTime);
      expect(campaign.status).toBe(CampaignStatus.SCHEDULED);

      // Advance time by 1 hour (not yet time to run)
      timeControl.helpers.advanceHours(1);
      expect(timeControl.now()).toEqual(new Date('2025-01-20T11:00:00Z'));

      // Advance to scheduled time
      timeControl.advanceTo(scheduledTime);
      expect(timeControl.now()).toEqual(scheduledTime);
    });

    it('should handle timeout scenarios', async () => {
      timeControl.freeze(new Date('2025-01-20T10:00:00Z'));

      const template = await factories.createTemplate({projectId});
      const {workflow, steps} = await factories.createWorkflowWithSteps(projectId, [
        {type: WorkflowStepType.WAIT_FOR_EVENT, timeout: 3600}, // 1 hour timeout
      ]);

      const contact = await factories.createContact({projectId});
      const execution = await factories.createWorkflowExecution(workflow.id, contact.id);

      const stepExecution = await prisma.workflowStepExecution.create({
        data: {
          executionId: execution.id,
          stepId: steps[0].id,
          status: StepExecutionStatus.WAITING,
          startedAt: new Date(),
        },
      });

      // Advance past timeout
      timeControl.helpers.advanceHours(1);

      // Verify we can detect timeout
      const elapsed = timeControl.now().getTime() - (stepExecution.startedAt?.getTime() || 0);
      const hasTimedOut = elapsed >= 3600000; // 1 hour in milliseconds

      expect(hasTimedOut).toBe(true);
    });
  });

  describe('Pattern 4: Testing Collections and Pagination', () => {
    it('should handle pagination correctly', async () => {
      // Create 25 campaigns
      const campaigns = [];
      for (let i = 0; i < 25; i++) {
        campaigns.push(
          await factories.createCampaign({
            projectId,
            name: `Campaign ${i}`,
          }),
        );
      }

      // Test first page
      const page1 = await prisma.campaign.findMany({
        where: {projectId},
        orderBy: [{createdAt: 'desc'}, {id: 'desc'}],
        take: 10,
        skip: 0,
      });

      expect(page1).toHaveLength(10);

      // Test second page
      const page2 = await prisma.campaign.findMany({
        where: {projectId},
        orderBy: [{createdAt: 'desc'}, {id: 'desc'}],
        take: 10,
        skip: 10,
      });

      expect(page2).toHaveLength(10);

      // Verify no overlap
      const page1Ids = page1.map(c => c.id);
      const page2Ids = page2.map(c => c.id);
      const overlap = page1Ids.filter(id => page2Ids.includes(id));

      expect(overlap).toHaveLength(0);
    });

    it('should filter collections', async () => {
      // Create campaigns with different statuses
      await factories.createCampaign({projectId, status: CampaignStatus.DRAFT});
      await factories.createCampaign({projectId, status: CampaignStatus.DRAFT});
      await factories.createCampaign({projectId, status: CampaignStatus.SENT});
      await factories.createCampaign({projectId, status: CampaignStatus.SENT});
      await factories.createCampaign({projectId, status: CampaignStatus.SCHEDULED});

      // Filter by status
      const drafts = await prisma.campaign.findMany({
        where: {projectId, status: CampaignStatus.DRAFT},
      });

      const sent = await prisma.campaign.findMany({
        where: {projectId, status: CampaignStatus.SENT},
      });

      expect(drafts).toHaveLength(2);
      expect(sent).toHaveLength(2);
    });
  });

  describe('Pattern 5: Testing State Transitions', () => {
    it('should track status changes', async () => {
      const contact = await factories.createContact({projectId});
      const email = await factories.createEmail(projectId, contact.id, {
        status: EmailStatus.PENDING,
      });

      // Verify initial state
      expect(email.status).toBe(EmailStatus.PENDING);

      // Transition to SENDING
      const sending = await prisma.email.update({
        where: {id: email.id},
        data: {status: EmailStatus.SENDING},
      });

      expect(sending.status).toBe(EmailStatus.SENDING);

      // Transition to SENT
      const sent = await prisma.email.update({
        where: {id: email.id},
        data: {
          status: EmailStatus.SENT,
          sentAt: new Date(),
        },
      });

      expect(sent.status).toBe(EmailStatus.SENT);
      expect(sent.sentAt).toBeDefined();
    });
  });

  describe('Pattern 6: Testing Bulk Operations', () => {
    it('should handle bulk creates efficiently', async () => {
      // Create many contacts at once
      const contacts = await factories.createContacts(projectId, 100);

      expect(contacts).toHaveLength(100);

      // Verify they were all created
      const count = await prisma.contact.count({
        where: {projectId},
      });

      expect(count).toBe(100);
    });

    it('should handle bulk updates', async () => {
      const contacts = await factories.createContacts(projectId, 50);

      // Bulk update all contacts
      await prisma.contact.updateMany({
        where: {projectId},
        data: {subscribed: false},
      });

      // Verify all were updated
      const unsubscribed = await prisma.contact.findMany({
        where: {projectId, subscribed: false},
      });

      expect(unsubscribed).toHaveLength(50);
    });
  });

  describe('Pattern 7: Testing Error Cases', () => {
    it('should handle not found errors', async () => {
      const result = await prisma.campaign.findUnique({
        where: {id: 'non-existent-id'},
      });

      expect(result).toBeNull();
    });

    it('should handle validation errors', async () => {
      // Create a contact first
      await factories.createContact({
        projectId,
        email: 'test@example.com',
      });

      // Try to create another contact with the same email (violates unique constraint)
      await expect(
        prisma.contact.create({
          data: {
            projectId,
            email: 'test@example.com', // Duplicate email - violates unique constraint on [projectId, email]
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Pattern 8: Testing Complex Workflows', () => {
    it('should execute a multi-step workflow', async () => {
      const template = await factories.createTemplate({projectId});

      // Create workflow with multiple steps
      const {workflow, steps} = await factories.createWorkflowWithSteps(projectId, [
        {type: WorkflowStepType.SEND_EMAIL, templateId: template.id},
        {type: WorkflowStepType.DELAY, delay: 3600}, // 1 hour delay
        {type: WorkflowStepType.SEND_EMAIL, templateId: template.id},
      ]);

      expect(workflow).toBeDefined();
      expect(steps).toHaveLength(3);

      // Verify step order
      expect(steps[0].type).toBe(WorkflowStepType.SEND_EMAIL);
      expect(steps[1].type).toBe(WorkflowStepType.DELAY);
      expect(steps[2].type).toBe(WorkflowStepType.SEND_EMAIL);

      // Verify delay configuration in the config JSON field
      const delayConfig = steps[1].config as {amount: number; unit: string};
      expect(delayConfig.amount).toBe(3600);
      expect(delayConfig.unit).toBe('hours');
    });
  });
});
