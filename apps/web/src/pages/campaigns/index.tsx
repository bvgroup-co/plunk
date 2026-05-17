import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@plunk/ui';
import type {Campaign, Template} from '@plunk/db';
import {CampaignStatus} from '@plunk/db';
import type {PaginatedResponse} from '@plunk/types';
import {EmptyState} from '@plunk/ui';
import {DashboardLayout} from '../../components/DashboardLayout';
import {TemplateSelectionDialog} from '../../components/TemplateSelectionDialog';
import {CampaignSelectionDialog} from '../../components/CampaignSelectionDialog';
import {network} from '../../lib/network';
import {formatRelativeTime} from '../../lib/dateUtils';
import {Ban, Calendar, ChevronDown, Copy, Edit, FileText, Mail, Plus, RefreshCw, Search, Trash2, X} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import dayjs from 'dayjs';

export default function CampaignsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED'>('ALL');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [campaignToCancel, setCampaignToCancel] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);

  const {data, mutate, isLoading} = useSWR<PaginatedResponse<Campaign>>(
    `/campaigns?page=${page}&pageSize=20${search ? `&search=${encodeURIComponent(search)}` : ''}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`,
    {revalidateOnFocus: false},
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const getStatusBadge = (status: CampaignStatus) => {
    const config: Record<CampaignStatus, {label: string; variant: 'neutral' | 'default' | 'success'}> = {
      DRAFT:     {label: 'Draft',     variant: 'neutral'},
      SCHEDULED: {label: 'Scheduled', variant: 'default'},
      SENDING:   {label: 'Sending',   variant: 'default'},
      SENT:      {label: 'Sent',      variant: 'success'},
      CANCELLED: {label: 'Cancelled', variant: 'neutral'},
    };
    const {label, variant} = config[status];
    return <Badge variant={variant} className="shrink-0">{label}</Badge>;
  };

  const handleCancel = async () => {
    if (!campaignToCancel) return;

    try {
      await network.fetch('POST', `/campaigns/${campaignToCancel}/cancel`);
      toast.success('Campaign cancelled successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel campaign');
    } finally {
      setCampaignToCancel(null);
    }
  };

  const handleDuplicate = async (campaignId: string) => {
    try {
      await network.fetch('POST', `/campaigns/${campaignId}/duplicate`);
      toast.success('Campaign duplicated successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate campaign');
    }
  };

  const handleDelete = async () => {
    if (!campaignToDelete) return;

    try {
      await network.fetch('DELETE', `/campaigns/${campaignToDelete}`);
      toast.success('Campaign deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete campaign');
    } finally {
      setCampaignToDelete(null);
    }
  };

  const handleSelectTemplate = (
    template: Template,
    selectedFields: {
      subject: boolean;
      body: boolean;
      from: boolean;
      fromName: boolean;
      replyTo: boolean;
    },
  ) => {
    // Navigate to create page with template data as query params
    const query: Record<string, string> = {
      name: `${template.name}`,
    };

    // Only include templateId if body is selected (needed to fetch body content)
    if (selectedFields.body) {
      query.templateId = template.id;
    }

    // Add selected fields to query params
    if (selectedFields.subject) {
      query.subject = template.subject;
    }
    if (selectedFields.from) {
      query.from = template.from;
    }
    if (selectedFields.fromName && template.fromName) {
      query.fromName = template.fromName;
    }
    if (selectedFields.replyTo && template.replyTo) {
      query.replyTo = template.replyTo;
    }

    void router.push({
      pathname: '/campaigns/create',
      query,
    });
  };

  const handleSelectCampaign = (
    campaign: Campaign,
    selectedFields: {
      subject: boolean;
      body: boolean;
      from: boolean;
      fromName: boolean;
      replyTo: boolean;
      audience: boolean;
    },
  ) => {
    // Navigate to create page with campaign data as query params
    const query: Record<string, string> = {
      name: `${campaign.name}`,
    };

    // Only include campaignId if body is selected (needed to fetch body content)
    if (selectedFields.body) {
      query.campaignId = campaign.id;
    }

    // Add selected fields to query params
    if (selectedFields.subject) {
      query.subject = campaign.subject;
    }
    if (selectedFields.from) {
      query.from = campaign.from;
    }
    if (selectedFields.fromName && campaign.fromName) {
      query.fromName = campaign.fromName;
    }
    if (selectedFields.replyTo && campaign.replyTo) {
      query.replyTo = campaign.replyTo;
    }
    if (selectedFields.audience) {
      query.audienceType = campaign.audienceType;
      if (campaign.segmentId) {
        query.segmentId = campaign.segmentId;
      }
    }

    void router.push({
      pathname: '/campaigns/create',
      query,
    });
  };

  return (
    <>
      <NextSeo title="Campaigns" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Campaigns</h1>
              <p className="text-neutral-500 mt-2 text-sm sm:text-base">
                Send one-time email broadcasts to your contacts. {data?.total ? `${data.total} total campaigns` : ''}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Create Campaign</span>
                  <span className="sm:hidden">Create</span>
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuItem asChild className="py-3 cursor-pointer">
                  <Link href="/campaigns/create" className="flex items-start gap-3">
                    <Mail className="h-4 w-4 mt-0.5 text-neutral-700" />
                    <div className="flex flex-col gap-0.5 flex-1">
                      <span className="font-medium text-sm">Empty Campaign</span>
                      <span className="text-xs text-neutral-500 leading-snug">
                        Start from scratch with a blank canvas
                      </span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTemplateDialog(true)} className="py-3 cursor-pointer">
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 mt-0.5 text-neutral-700" />
                    <div className="flex flex-col gap-0.5 flex-1">
                      <span className="font-medium text-sm">From Template</span>
                      <span className="text-xs text-neutral-500 leading-snug">
                        Use an existing template as a starting point
                      </span>
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowCampaignDialog(true)} className="py-3 cursor-pointer">
                  <div className="flex items-start gap-3">
                    <RefreshCw className="h-4 w-4 mt-0.5 text-neutral-700" />
                    <div className="flex flex-col gap-0.5 flex-1">
                      <span className="font-medium text-sm">From Previous Campaign</span>
                      <span className="text-xs text-neutral-500 leading-snug">
                        Copy content and settings from an existing campaign
                      </span>
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="text"
                placeholder="Search campaigns..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-10 pr-10 h-8 text-xs"
              />
              {searchInput && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0 flex-wrap">
              {(['ALL', 'DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'] as const).map(status => (
                <Button
                  key={status}
                  type="button"
                  onClick={() => { setStatusFilter(status); setPage(1); }}
                  variant={statusFilter === status ? 'default' : 'secondary'}
                  size="sm"
                >
                  {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Campaigns List */}
          <div className="space-y-4">
            {isLoading && (
              <Card>
                <CardContent className="py-8 text-center text-neutral-500">Loading campaigns...</CardContent>
              </Card>
            )}

            {!isLoading && data?.data.length === 0 && (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={Mail}
                    title={search ? 'No campaigns match' : statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} campaigns` : 'No campaigns yet'}
                    description={
                      search
                        ? 'Try a different search term.'
                        : statusFilter !== 'ALL'
                          ? 'Adjust your filters or create a new campaign.'
                          : 'Send one-off emails to groups of contacts.'
                    }
                    action={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button>
                            <Plus className="h-4 w-4" />
                            Create Campaign
                            <ChevronDown className="h-4 w-4 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="w-80">
                          <DropdownMenuItem asChild className="py-3 cursor-pointer">
                            <Link href="/campaigns/create" className="flex items-start gap-3">
                              <Mail className="h-4 w-4 mt-0.5 text-neutral-700" />
                              <div className="flex flex-col gap-0.5 flex-1">
                                <span className="font-medium text-sm">Empty Campaign</span>
                                <span className="text-xs text-neutral-500 leading-snug">
                                  Start from scratch with a blank canvas
                                </span>
                              </div>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowTemplateDialog(true)} className="py-3 cursor-pointer">
                            <div className="flex items-start gap-3">
                              <FileText className="h-4 w-4 mt-0.5 text-neutral-700" />
                              <div className="flex flex-col gap-0.5 flex-1">
                                <span className="font-medium text-sm">From Template</span>
                                <span className="text-xs text-neutral-500 leading-snug">
                                  Use an existing template as a starting point
                                </span>
                              </div>
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowCampaignDialog(true)} className="py-3 cursor-pointer">
                            <div className="flex items-start gap-3">
                              <RefreshCw className="h-4 w-4 mt-0.5 text-neutral-700" />
                              <div className="flex flex-col gap-0.5 flex-1">
                                <span className="font-medium text-sm">From Previous Campaign</span>
                                <span className="text-xs text-neutral-500 leading-snug">
                                  Copy content and settings from an existing campaign
                                </span>
                              </div>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                </CardContent>
              </Card>
            )}

            {data?.data.map(campaign => {
              const openRate = campaign.sentCount > 0 ? (campaign.openedCount / campaign.sentCount) * 100 : 0;
              const clickRate = campaign.sentCount > 0 ? (campaign.clickedCount / campaign.sentCount) * 100 : 0;
              const deliveryPct = campaign.totalRecipients > 0 ? (campaign.sentCount / campaign.totalRecipients) * 100 : 0;

              return (
                <Card key={campaign.id} className="transition-colors hover:border-neutral-300 flex flex-col [&:has([data-card-link]:focus-visible)]:ring-2 [&:has([data-card-link]:focus-visible)]:ring-ring [&:has([data-card-link]:focus-visible)]:ring-offset-2">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    data-card-link=""
                    className="flex-1 block p-6 pb-4 hover:bg-neutral-50/50 transition-colors rounded-t-xl focus-visible:outline-none"
                    aria-label={`Open ${campaign.name}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-neutral-900 leading-snug truncate">{campaign.name}</h3>
                      {getStatusBadge(campaign.status)}
                    </div>

                    <div className="flex items-center gap-3 text-sm flex-wrap">
                      {campaign.status === 'DRAFT' && (
                        <>
                          <span>
                            <strong className="font-semibold text-neutral-900">{campaign.totalRecipients.toLocaleString()}</strong>
                            <span className="text-neutral-400 ml-1 text-xs">estimated recipients</span>
                          </span>
                        </>
                      )}
                      {campaign.status === 'SCHEDULED' && (
                        <>
                          <span>
                            <strong className="font-semibold text-neutral-900">{campaign.totalRecipients.toLocaleString()}</strong>
                            <span className="text-neutral-400 ml-1 text-xs">recipients</span>
                          </span>
                          {campaign.scheduledFor && (
                            <>
                              <span className="h-3 w-px bg-neutral-200" />
                              <span className="text-xs text-neutral-500">
                                Sending {dayjs(campaign.scheduledFor).format('MMM D, YYYY [at] h:mm A')}
                              </span>
                            </>
                          )}
                        </>
                      )}
                      {campaign.status === 'SENDING' && (
                        <>
                          <span>
                            <strong className="font-semibold text-neutral-900">{deliveryPct.toFixed(0)}%</strong>
                            <span className="text-neutral-400 ml-1 text-xs">delivered</span>
                          </span>
                          <span className="h-3 w-px bg-neutral-200" />
                          <span>
                            <strong className="font-semibold text-neutral-900">{openRate.toFixed(1)}%</strong>
                            <span className="text-neutral-400 ml-1 text-xs">opens</span>
                          </span>
                        </>
                      )}
                      {campaign.status === 'SENT' && (
                        <>
                          <span>
                            <strong className="font-semibold text-neutral-900">{campaign.sentCount.toLocaleString()}</strong>
                            <span className="text-neutral-400 ml-1 text-xs">sent</span>
                          </span>
                          <span className="h-3 w-px bg-neutral-200" />
                          <span>
                            <strong className="font-semibold text-neutral-900">{openRate.toFixed(1)}%</strong>
                            <span className="text-neutral-400 ml-1 text-xs">opens</span>
                          </span>
                          {clickRate > 0 && (
                            <>
                              <span className="h-3 w-px bg-neutral-200" />
                              <span>
                                <strong className="font-semibold text-neutral-900">{clickRate.toFixed(1)}%</strong>
                                <span className="text-neutral-400 ml-1 text-xs">clicks</span>
                              </span>
                            </>
                          )}
                        </>
                      )}
                      {campaign.status === 'CANCELLED' && (
                        <span>
                          <strong className="font-semibold text-neutral-900">{campaign.totalRecipients.toLocaleString()}</strong>
                          <span className="text-neutral-400 ml-1 text-xs">recipients</span>
                        </span>
                      )}
                    </div>
                  </Link>

                  <div className="px-6 py-3 border-t border-neutral-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Calendar className="h-3 w-3" />
                      <div className="group relative inline-block cursor-help">
                        <span>Updated {formatRelativeTime(campaign.updatedAt)}</span>
                        <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                          {dayjs(campaign.updatedAt).format('DD MMMM YYYY, hh:mm')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button asChild variant="ghost" size="sm" title={campaign.status === 'DRAFT' ? 'Edit campaign' : 'View campaign'}>
                        <Link href={`/campaigns/${campaign.id}`} aria-label={campaign.status === 'DRAFT' ? 'Edit campaign' : 'View campaign'}><Edit className="h-4 w-4" /></Link>
                      </Button>
                      <Button variant="ghost" size="sm" title="Duplicate campaign" onClick={() => handleDuplicate(campaign.id)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {campaign.status === 'DRAFT' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Delete campaign"
                          onClick={() => {
                            setCampaignToDelete(campaign.id);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {(campaign.status === 'SCHEDULED' || campaign.status === 'SENDING') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Cancel campaign"
                          onClick={() => {
                            setCampaignToCancel(campaign.id);
                            setShowCancelDialog(true);
                          }}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <span className="flex items-center px-4 text-sm text-neutral-600">
                Page {page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={showCancelDialog}
          onOpenChange={setShowCancelDialog}
          onConfirm={handleCancel}
          title="Cancel Campaign"
          description="Are you sure you want to cancel this campaign?"
          confirmText="Cancel Campaign"
          variant="destructive"
        />

        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          title="Delete Campaign"
          description="Are you sure you want to delete this draft campaign? This action cannot be undone."
          confirmText="Delete Campaign"
          variant="destructive"
        />

        <TemplateSelectionDialog
          open={showTemplateDialog}
          onOpenChange={setShowTemplateDialog}
          onSelectTemplate={handleSelectTemplate}
        />

        <CampaignSelectionDialog
          open={showCampaignDialog}
          onOpenChange={setShowCampaignDialog}
          onSelectCampaign={handleSelectCampaign}
        />
      </DashboardLayout>
    </>
  );
}
