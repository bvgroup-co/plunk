/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectItemWithDescription,
  SelectTrigger,
  SelectValue,
  IconSpinner,
  StickySaveBar,
} from '@plunk/ui';
import type {Campaign, Segment} from '@plunk/db';
import {CampaignAudienceType, CampaignStatus, TemplateType} from '@plunk/db';
import {CampaignSchemas, detectUnsubscribeSignal} from '@plunk/shared';
import {DashboardLayout} from '../../components/DashboardLayout';
import {EmailSettings} from '../../components/EmailSettings';
import {EmailEditor} from '../../components/EmailEditor';
import {network} from '../../lib/network';
import {formatFullDateTime, formatUTCDateTime, getUserTimezone, schedulePresets} from '../../lib/dateUtils';
import {useChangeTracking} from '../../lib/hooks/useChangeTracking';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Mail,
  MousePointer,
  Save,
  Send,
  TestTube,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Users,
  XCircle,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {NextSeo} from 'next-seo';
import {useActiveProject} from '../../lib/contexts/ActiveProjectProvider';

interface CampaignStats {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  deliveryRate: number;
}

export default function CampaignDetailsPage() {
  const router = useRouter();
  const {id} = router.query;
  const {activeProject} = useActiveProject();

  const {
    data: campaign,
    mutate,
    isLoading,
  } = useSWR<{data: Campaign}>(id ? `/campaigns/${id}` : null, {revalidateOnFocus: false});

  const {data: stats} = useSWR<{data: CampaignStats}>(
    id && campaign?.data.status !== CampaignStatus.DRAFT ? `/campaigns/${id}/stats` : null,
    {
      revalidateOnFocus: false,
      refreshInterval: campaign?.data.status === CampaignStatus.SENDING ? 15000 : 0, // Refresh every 15s while sending
    },
  );

  // Fetch segments for audience selection
  const {data: segments} = useSWR<Segment[]>('/segments', {
    revalidateOnFocus: false,
  });

  // Fetch project members for test email
  const {data: projectMembers} = useSWR<{data: Array<{userId: string; email: string; role: string}>}>(
    id && campaign?.data.projectId ? `/projects/${campaign.data.projectId}/members` : null,
    {revalidateOnFocus: false},
  );

  const [editedCampaign, setEditedCampaign] = useState<Partial<Campaign>>({});
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [testEmailAddress, setTestEmailAddress] = useState('');

  type CampaignDialog =
    | {type: 'none'}
    | {type: 'schedule'}
    | {type: 'testEmail'; sending: boolean}
    | {type: 'send'}
    | {type: 'cancel'}
    | {type: 'delete'};

  const [dialog, setDialog] = useState<CampaignDialog>({type: 'none'});

  // Automatically initialize edit fields when campaign is loaded and is a draft
  const isEditMode = campaign?.data.status === CampaignStatus.DRAFT;

  const handleCancel = async () => {
    try {
      await network.fetch('POST', `/campaigns/${id}/cancel`);
      toast.success('Campaign cancelled successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel campaign');
    }
  };

  const handleDelete = async () => {
    try {
      await network.fetch('DELETE', `/campaigns/${id}`);
      toast.success('Campaign deleted successfully');
      void router.push('/campaigns');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete campaign');
    }
  };

  const handleSend = async () => {
    try {
      await network.fetch<void>('POST', `/campaigns/${id}/send`);
      toast.success('Campaign is being sent!');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send campaign');
    }
  };

  const handleSchedule = async () => {
    if (!scheduledDateTime) {
      toast.error('Please select a date and time');
      return;
    }

    // Parse the datetime-local value as local time, then convert to UTC
    const scheduledDate = new Date(scheduledDateTime);
    const now = new Date();

    if (scheduledDate.getTime() <= now.getTime()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    try {
      // Send as ISO string (UTC)
      await network.fetch<void, typeof CampaignSchemas.schedule>('POST', `/campaigns/${id}/send`, {
        scheduledFor: scheduledDate.toISOString(),
      });

      // Show confirmation with user's local time
      const localTimeString = formatFullDateTime(scheduledDate);
      toast.success(`Campaign scheduled for ${localTimeString}`);
      setDialog({type: 'none'});
      setScheduledDateTime('');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to schedule campaign');
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) {
      toast.error('Please select a project member');
      return;
    }

    setDialog({type: 'testEmail', sending: true});

    try {
      await network.fetch<{success: boolean; message: string}>('POST', `/campaigns/${id}/test`, {
        email: testEmailAddress,
      } as any);

      toast.success(`Test email sent to ${testEmailAddress}`);
      setDialog({type: 'none'});
      setTestEmailAddress('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send test email');
    } finally {
      setDialog(d => (d.type === 'testEmail' ? {type: 'testEmail', sending: false} : d));
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);

    try {
      await network.fetch<Campaign, typeof CampaignSchemas.update>('PUT', `/campaigns/${id}`, {
        name: editedCampaign.name,
        description: editedCampaign.description || undefined,
        subject: editedCampaign.subject,
        body: editedCampaign.body,
        from: editedCampaign.from,
        fromName: editedCampaign.fromName || null,
        replyTo: editedCampaign.replyTo || null,
        type: editedCampaign.type,
        audienceType: editedCampaign.audienceType,
        segmentId: editedCampaign.segmentId || undefined,
      });
      // Silent save - no toast notification
      setHasChanges(false);
      // Refetch and re-sync the edited campaign with fresh data
      const updated = await mutate();
      if (updated?.data) {
        setEditedCampaign({
          name: updated.data.name,
          description: updated.data.description || '',
          subject: updated.data.subject,
          body: updated.data.body,
          from: updated.data.from,
          fromName: updated.data.fromName || '',
          replyTo: updated.data.replyTo || '',
          type: updated.data.type,
          audienceType: updated.data.audienceType,
          segmentId: updated.data.segmentId || undefined,
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update campaign');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initialize edit fields when campaign loads and is a draft
  useEffect(() => {
    if (campaign?.data && isEditMode && Object.keys(editedCampaign).length === 0) {
      setEditedCampaign({
        name: campaign.data.name,
        description: campaign.data.description || '',
        subject: campaign.data.subject,
        body: campaign.data.body,
        from: campaign.data.from,
        fromName: campaign.data.fromName || '',
        replyTo: campaign.data.replyTo || '',
        type: campaign.data.type,
        audienceType: campaign.data.audienceType,
        segmentId: campaign.data.segmentId || undefined,
      });
      // Reset hasChanges when loading fresh data
      setHasChanges(false);
    }
  }, [campaign, isEditMode, editedCampaign]);

  // Track changes
  useEffect(() => {
    if (!campaign?.data || Object.keys(editedCampaign).length === 0) return;

    const changed =
      editedCampaign.name !== campaign.data.name ||
      (editedCampaign.description || '') !== (campaign.data.description || '') ||
      editedCampaign.subject !== campaign.data.subject ||
      editedCampaign.body !== campaign.data.body ||
      editedCampaign.from !== campaign.data.from ||
      (editedCampaign.fromName || '') !== (campaign.data.fromName || '') ||
      (editedCampaign.replyTo || '') !== (campaign.data.replyTo || '') ||
      editedCampaign.type !== campaign.data.type ||
      editedCampaign.audienceType !== campaign.data.audienceType ||
      (editedCampaign.segmentId || null) !== (campaign.data.segmentId || null);

    setHasChanges(changed);
  }, [editedCampaign, campaign]);

  // Warn before leaving page with unsaved changes (only in edit mode)
  useChangeTracking(hasChanges, isEditMode);

  const getStatusBadge = (status: CampaignStatus) => {
    const variants: Record<
      CampaignStatus,
      {variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string}
    > = {
      DRAFT: {variant: 'secondary', label: 'Draft'},
      SCHEDULED: {variant: 'default', label: 'Scheduled'},
      SENDING: {variant: 'default', label: 'Sending'},
      SENT: {variant: 'default', label: 'Sent'},
      CANCELLED: {variant: 'destructive', label: 'Cancelled'},
    };

    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <IconSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-neutral-500">Campaign not found</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const c = campaign.data;
  const s = stats?.data;

  // Get recipient count for draft campaigns from the campaign's totalRecipients field
  // The backend calculates this for all audience types when the campaign is created/updated
  const draftRecipientCount = isEditMode && campaign?.data ? campaign.data.totalRecipients : 0;

  // Render edit form for drafts
  if (isEditMode) {
    return (
      <DashboardLayout>
        <NextSeo title={campaign.data.name} />
        <form onSubmit={handleSave} className={`space-y-6 ${hasChanges ? 'pb-32' : ''}`}>
          {/* Header */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /></Link>
              </Button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 truncate">{c.name}</h1>
                  <Badge variant="secondary">Draft</Badge>
                </div>
                <p className="text-neutral-500 mt-1 text-sm sm:text-base">
                  Make changes to your campaign before sending
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                {!hasChanges && !isSubmitting && (
                  <span className="text-xs sm:text-sm text-neutral-500">All changes saved</span>
                )}
                {hasChanges && !isSubmitting && (
                  <span className="text-xs sm:text-sm text-amber-600">Unsaved changes</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDialog({type: 'delete'})}
                  className="flex-1 sm:flex-none"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
                <Button
                  type="submit"
                  disabled={!hasChanges || isSubmitting}
                  variant="outline"
                  className="flex-1 sm:flex-none"
                >
                  <Save className="h-4 w-4" />
                  <span className="hidden sm:inline">{isSubmitting ? 'Saving...' : 'Save'}</span>
                  <span className="sm:hidden">Save</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" className="flex-1 sm:flex-none">
                      <Send className="h-4 w-4" />
                      <span className="hidden sm:inline">Send</span>
                      <ChevronDown className="h-4 w-4 sm:ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuItem onClick={() => setDialog({type: 'testEmail', sending: false})} className="py-3 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <TestTube className="h-4 w-4 mt-0.5 text-neutral-700" />
                        <div className="flex flex-col gap-0.5 flex-1">
                          <span className="font-medium text-sm">Send Test Email</span>
                          <span className="text-xs text-neutral-500 leading-snug">
                            Preview in your inbox before sending
                          </span>
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialog({type: 'send'})} className="py-3 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <Send className="h-4 w-4 mt-0.5 text-neutral-700" />
                        <div className="flex flex-col gap-0.5 flex-1">
                          <span className="font-medium text-sm">Send Now</span>
                          <span className="text-xs text-neutral-500 leading-snug">
                            Send immediately to all recipients
                          </span>
                        </div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialog({type: 'schedule'})} className="py-3 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-4 w-4 mt-0.5 text-neutral-700" />
                        <div className="flex flex-col gap-0.5 flex-1">
                          <span className="font-medium text-sm">Schedule for Later</span>
                          <span className="text-xs text-neutral-500 leading-snug">Choose a specific date and time</span>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Campaign Settings - Horizontal Layout */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Campaign Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Campaign Settings</CardTitle>
                <CardDescription>Basic information about your campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    value={editedCampaign.name || ''}
                    onChange={e => setEditedCampaign({...editedCampaign, name: e.target.value})}
                    required
                    placeholder="Spring Sale Campaign"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    type="text"
                    value={editedCampaign.description || ''}
                    onChange={e => setEditedCampaign({...editedCampaign, description: e.target.value})}
                    placeholder="Optional description for internal use"
                  />
                </div>

                <div>
                  <Label>Campaign Type</Label>
                  <div className="flex flex-col gap-2 mt-2">
                    {([
                      {value: TemplateType.MARKETING, label: 'Marketing', description: 'Subscribed contacts, includes unsubscribe link'},
                      {value: TemplateType.TRANSACTIONAL, label: 'Transactional', description: 'All contacts, no subscription check or footer'},
                      {value: TemplateType.HEADLESS, label: 'Headless', description: 'Subscribed contacts, no Plunk footer'},
                    ] as const).map(({value, label, description}) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEditedCampaign({...editedCampaign, type: value})}
                        className={`flex items-center justify-between w-full min-h-[44px] px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                          (editedCampaign.type ?? c.type) === value
                            ? 'border-neutral-900 bg-neutral-50'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span className="font-medium text-sm text-neutral-900 shrink-0">{label}</span>
                        <span className="text-xs text-neutral-500 ml-4 text-right">{description}</span>
                      </button>
                    ))}
                  </div>
                  {(editedCampaign.type ?? c.type) === TemplateType.HEADLESS &&
                    !detectUnsubscribeSignal(editedCampaign.body ?? c.body) && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-100/60 px-3 py-2">
                        <TriangleAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <p className="text-xs font-semibold text-amber-900">No unsubscribe link detected</p>
                      </div>
                      <div className="px-3 py-2.5 space-y-2">
                        <p className="text-xs text-amber-800 leading-relaxed">
                          You are responsible for providing recipients a way to opt out. Use the Plunk variables below to build your own footer.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <code className="inline-flex items-center rounded bg-amber-100 border border-amber-200 px-1.5 py-0.5 font-mono text-[11px] text-amber-900">
                            {'{{unsubscribeUrl}}'}
                          </code>
                          <code className="inline-flex items-center rounded bg-amber-100 border border-amber-200 px-1.5 py-0.5 font-mono text-[11px] text-amber-900">
                            {'{{manageUrl}}'}
                          </code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="subject">Subject Line *</Label>
                  <Input
                    id="subject"
                    type="text"
                    value={editedCampaign.subject || ''}
                    onChange={e => setEditedCampaign({...editedCampaign, subject: e.target.value})}
                    required
                    placeholder="Introducing our Spring Sale!"
                  />
                </div>

                <EmailSettings
                  from={editedCampaign.from || ''}
                  fromName={editedCampaign.fromName || ''}
                  replyTo={editedCampaign.replyTo || ''}
                  onFromChange={value => setEditedCampaign({...editedCampaign, from: value})}
                  onFromNameChange={value => setEditedCampaign({...editedCampaign, fromName: value})}
                  onReplyToChange={value => setEditedCampaign({...editedCampaign, replyTo: value})}
                  fromNamePlaceholder={activeProject?.name || 'Your Company'}
                  layout="vertical"
                />
              </CardContent>
            </Card>

            {/* Audience Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Audience</CardTitle>
                <CardDescription>Who will receive this campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="audienceType">Audience Type *</Label>
                  <Select
                    value={editedCampaign.audienceType ?? c.audienceType}
                    onValueChange={(value: CampaignAudienceType) => {
                      setEditedCampaign({
                        ...editedCampaign,
                        audienceType: value,
                        // Clear segmentId if changing away from SEGMENT
                        segmentId: value === CampaignAudienceType.SEGMENT ? editedCampaign.segmentId : undefined,
                      });
                    }}
                  >
                    <SelectTrigger id="audienceType">
                      <SelectValue placeholder="Select audience type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItemWithDescription
                        value={CampaignAudienceType.ALL}
                        title={(editedCampaign.type ?? c.type) === TemplateType.TRANSACTIONAL ? 'All Contacts' : 'All Subscribed Contacts'}
                        description={(editedCampaign.type ?? c.type) === TemplateType.TRANSACTIONAL ? 'Send to all contacts regardless of subscription status' : "Send to everyone who hasn't unsubscribed"}
                      />
                      <SelectItemWithDescription
                        value={CampaignAudienceType.SEGMENT}
                        title="Segment"
                        description="Target a defined group of contacts"
                      />
                    </SelectContent>
                  </Select>
                </div>

                {(editedCampaign.audienceType ?? c.audienceType) === CampaignAudienceType.SEGMENT && (
                  <div>
                    <Label htmlFor="segment">Select Segment *</Label>
                    <Select
                      value={editedCampaign.segmentId ?? c.segmentId ?? undefined}
                      onValueChange={(value: string) => {
                        setEditedCampaign({
                          ...editedCampaign,
                          segmentId: value,
                        });
                      }}
                      disabled={!segments || segments.length === 0}
                    >
                      <SelectTrigger id="segment">
                        <SelectValue
                          placeholder={segments && segments.length > 0 ? 'Choose a segment' : 'No segments available'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {segments &&
                          segments.length > 0 &&
                          segments.map(segment => (
                            <SelectItemWithDescription
                              key={segment.id}
                              value={segment.id}
                              title={segment.name}
                              description={`${segment.memberCount.toLocaleString()} contacts`}
                            />
                          ))}
                      </SelectContent>
                    </Select>
                    {segments && segments.length === 0 && (
                      <p className="text-xs text-neutral-500 mt-1">Create a segment first to use this option</p>
                    )}
                  </div>
                )}

                {editedCampaign.audienceType === CampaignAudienceType.FILTERED && (
                  <p className="text-sm text-neutral-500">
                    Filtered audiences are configured with advanced filter conditions
                  </p>
                )}

                {/* Show recipient count */}
                {draftRecipientCount > 0 && (
                  <div className="mt-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-neutral-400" />
                      <span className="text-sm font-medium text-neutral-900">
                        {draftRecipientCount.toLocaleString()} recipients
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 pl-6">
                      Recalculated at send time. Final count may differ if contacts{' '}
                      {(editedCampaign.type ?? c.type) === TemplateType.TRANSACTIONAL
                        ? 'are added or removed, or segment membership changes.'
                        : 'subscribe, unsubscribe, or segment membership changes.'
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Email Editor - Full Width */}
          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle>Email Content</CardTitle>
              <CardDescription>Design your email using the visual editor or paste custom HTML</CardDescription>
            </CardHeader>
            <CardContent>
              <EmailEditor
                value={editedCampaign.body || ''}
                onChange={body => {
                  setEditedCampaign({...editedCampaign, body});
                  setHasChanges(true);
                }}
              />
            </CardContent>
          </Card>

          {/* Test Email Dialog */}
          <Dialog open={dialog.type === 'testEmail'} onOpenChange={open => !open && setDialog({type: 'none'})}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Send Test Email</DialogTitle>
                <DialogDescription>
                  Send a test version of this campaign to a project member to verify how it looks. The test email will
                  be prefixed with [TEST] in the subject line.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="testEmail">Project Member</Label>
                  <Select value={testEmailAddress} onValueChange={setTestEmailAddress}>
                    <SelectTrigger id="testEmail" className="mt-2">
                      <SelectValue placeholder="Select a project member..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projectMembers?.data.map(member => (
                        <SelectItem key={member.userId} value={member.email}>
                          {member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-500 mt-2">
                    For security reasons, test emails can only be sent to project members.
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    Note: Variables will not be replaced in test emails. The email will be sent exactly as designed.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialog({type: 'none'});
                    setTestEmailAddress('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={(dialog.type === 'testEmail' && dialog.sending) || !testEmailAddress}
                >
                  {dialog.type === 'testEmail' && dialog.sending ? 'Sending...' : 'Send Test Email'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Schedule Dialog */}
          <Dialog open={dialog.type === 'schedule'} onOpenChange={open => !open && setDialog({type: 'none'})}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Schedule Campaign</DialogTitle>
                <DialogDescription>
                  Choose when you want this campaign to be sent (times shown in your local timezone: {getUserTimezone()}
                  )
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Quick Presets */}
                <div>
                  <Label>Quick Schedule</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduledDateTime(schedulePresets.inOneHour())}
                    >
                      In 1 hour
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduledDateTime(schedulePresets.inThreeHours())}
                    >
                      In 3 hours
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduledDateTime(schedulePresets.tomorrowAt9AM())}
                    >
                      Tomorrow at 9 AM
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduledDateTime(schedulePresets.tomorrowAt2PM())}
                    >
                      Tomorrow at 2 PM
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduledDateTime(schedulePresets.nextMonday())}
                    >
                      Next Monday
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduledDateTime(schedulePresets.inOneWeek())}
                    >
                      In 1 week
                    </Button>
                  </div>
                </div>

                {/* Custom Date/Time */}
                <div>
                  <Label htmlFor="scheduledDateTime">Or choose a specific time</Label>
                  <Input
                    id="scheduledDateTime"
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={e => setScheduledDateTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="mt-2"
                  />
                  {scheduledDateTime && (
                    <div className="mt-2 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                      <p className="text-xs font-medium text-neutral-500 mb-1">Scheduled for:</p>
                      <p className="text-sm font-medium text-neutral-900">{formatFullDateTime(new Date(scheduledDateTime))}</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        UTC: {formatUTCDateTime(new Date(scheduledDateTime))}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialog({type: 'none'});
                    setScheduledDateTime('');
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSchedule}>
                  Schedule Campaign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </form>

        {/* Sticky Save Bar */}
        <StickySaveBar status={isSubmitting ? 'saving' : hasChanges ? 'dirty' : 'idle'} onSave={handleSave} />

        <ConfirmDialog
          open={dialog.type === 'send'}
          onOpenChange={open => !open && setDialog({type: 'none'})}
          onConfirm={handleSend}
          title="Send Campaign"
          description="Are you sure you want to send this campaign now? This action cannot be undone."
          confirmText="Send Now"
          variant="default"
        />

        <ConfirmDialog
          open={dialog.type === 'delete'}
          onOpenChange={open => !open && setDialog({type: 'none'})}
          onConfirm={handleDelete}
          title="Delete Campaign"
          description="Are you sure you want to delete this draft campaign? This action cannot be undone."
          confirmText="Delete Campaign"
          variant="destructive"
        />
      </DashboardLayout>
    );
  }

  // Render stats view for sent/scheduled campaigns
  return (
    <DashboardLayout>
      <NextSeo title={campaign.data.name} />
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 truncate">{c.name}</h1>
                {getStatusBadge(c.status)}
              </div>
              {c.description && <p className="text-neutral-500 text-sm sm:text-base">{c.description}</p>}
            </div>
          </div>

          {/* Actions */}
          {(c.status === CampaignStatus.SCHEDULED || c.status === CampaignStatus.SENDING) && (
            <div className="flex justify-end">
              <Button variant="destructive" onClick={() => setDialog({type: 'cancel'})} className="w-full sm:w-auto">
                <XCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Cancel Campaign</span>
                <span className="sm:hidden">Cancel</span>
              </Button>
            </div>
          )}
        </div>

        {/* Sending Progress Banner */}
        {c.status === CampaignStatus.SENDING && s && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-neutral-900 text-lg">Sending in progress</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                      {s.sentCount.toLocaleString()} of {s.totalRecipients.toLocaleString()} emails sent
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-neutral-900">
                      {((s.sentCount / s.totalRecipients) * 100).toFixed(0)}%
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">Complete</p>
                  </div>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-2">
                  <div
                    className="bg-neutral-900 h-2 rounded-full transition-all duration-500"
                    style={{width: `${(s.sentCount / s.totalRecipients) * 100}%`}}
                  />
                </div>
                <p className="text-xs text-neutral-400">This page updates automatically every 5 seconds</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        {s && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500">Total Recipients</CardTitle>
                <Users className="h-4 w-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-neutral-900">{s.totalRecipients.toLocaleString()}</div>
                <p className="text-xs text-neutral-500 mt-2">
                  {s.sentCount.toLocaleString()} sent ({((s.sentCount / s.totalRecipients) * 100).toFixed(1)}%)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500">Delivery Rate</CardTitle>
                <Mail className="h-4 w-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-neutral-900">{s.deliveryRate.toFixed(1)}%</div>
                <p className="text-xs text-neutral-500 mt-2">
                  {s.deliveredCount.toLocaleString()} delivered
                  {s.bouncedCount > 0 && `, ${s.bouncedCount} bounced`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500">Open Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-neutral-900">{s.openRate.toFixed(1)}%</div>
                <p className="text-xs text-neutral-500 mt-2">{s.openedCount.toLocaleString()} opened</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-neutral-500">Click Rate</CardTitle>
                <MousePointer className="h-4 w-4 text-neutral-400" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-neutral-900">{s.clickRate.toFixed(1)}%</div>
                <p className="text-xs text-neutral-500 mt-2">{s.clickedCount.toLocaleString()} clicked</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Campaign Details in Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Email Content - Takes 2 columns */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Email Preview</CardTitle>
              <CardDescription>How your email will appear to recipients</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Email Header Info */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-neutral-500 uppercase tracking-wide font-medium">Subject</p>
                    <p className="text-base font-semibold text-neutral-900 mt-1">{c.subject}</p>
                  </div>
                </div>
                <div className="flex gap-6 pt-2 border-t border-neutral-200">
                  <div>
                    <p className="text-xs text-neutral-500">From</p>
                    <p className="text-sm text-neutral-900 mt-0.5">{c.from}</p>
                  </div>
                  {c.replyTo && (
                    <div>
                      <p className="text-xs text-neutral-500">Reply-To</p>
                      <p className="text-sm text-neutral-900 mt-0.5">{c.replyTo}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Email Body Preview */}
              <div>
                <p className="text-sm font-medium text-neutral-700 mb-3">Message Content</p>
                <div className="border-2 border-neutral-200 rounded-lg overflow-hidden bg-white">
                  <div className="p-6 max-h-96 overflow-y-auto">
                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(c.body)}} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Details */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Info</CardTitle>
              <CardDescription>Configuration and metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Audience */}
              <div className="pb-3 border-b border-neutral-100">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Audience</p>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-neutral-400" />
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {c.audienceType === CampaignAudienceType.ALL && 'All Subscribed Contacts'}
                      {c.audienceType === CampaignAudienceType.SEGMENT &&
                        (segments?.find(s => s.id === c.segmentId)?.name || 'Selected Segment')}
                      {c.audienceType === CampaignAudienceType.FILTERED && 'Filtered Contacts'}
                    </p>
                    {c.audienceType === CampaignAudienceType.SEGMENT &&
                      segments?.find(s => s.id === c.segmentId)?.memberCount && (
                        <p className="text-xs text-neutral-500">
                          {segments.find(s => s.id === c.segmentId)!.memberCount.toLocaleString()} contacts
                        </p>
                      )}
                  </div>
                </div>
              </div>

              {/* Scheduling Info */}
              {c.scheduledFor && (
                <div className="pb-3 border-b border-neutral-100">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Scheduled For</p>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-neutral-400 mt-0.5" />
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">
                          {formatFullDateTime(new Date(c.scheduledFor))}
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                          UTC: {formatUTCDateTime(new Date(c.scheduledFor))}
                        </p>
                      </div>
                      {c.status === CampaignStatus.SCHEDULED && (
                        <p className="text-xs text-neutral-500">Recipient count will be recalculated at send time</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Sent At */}
              {c.sentAt && (
                <div className="pb-3 border-b border-neutral-100">
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Sent On</p>
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-neutral-400" />
                    <p className="text-sm font-medium text-neutral-900">{formatFullDateTime(new Date(c.sentAt))}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={dialog.type === 'cancel'}
        onOpenChange={open => !open && setDialog({type: 'none'})}
        onConfirm={handleCancel}
        title="Cancel Campaign"
        description="Are you sure you want to cancel this campaign?"
        confirmText="Cancel Campaign"
        variant="destructive"
      />
    </DashboardLayout>
  );
}
