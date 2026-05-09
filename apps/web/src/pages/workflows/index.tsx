import {
  Badge,
  Button,
  Card,
  CardContent,
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconSpinner,
  Input,
  Label,
} from '@plunk/ui';
import type {Workflow} from '@plunk/db';
import type {PaginatedResponse} from '@plunk/types';
import {EmptyState} from '@plunk/ui';
import {DashboardLayout} from '../../components/DashboardLayout';
import {network} from '../../lib/network';
import {formatRelativeTime} from '../../lib/dateUtils';
import {Calendar, Copy, Edit, Plus, Power, PowerOff, Search, Trash2, Workflow as WorkflowIcon, X, Zap} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useEffect, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {WorkflowSchemas} from '@plunk/shared';
import dayjs from 'dayjs';

export default function WorkflowsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  const {data, mutate, isLoading} = useSWR<
    PaginatedResponse<Workflow & {_count?: {steps: number; executions: number}}>
  >(`/workflows?page=${page}&pageSize=20${search ? `&search=${search}` : ''}`, {revalidateOnFocus: false});

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDelete = async () => {
    if (!workflowToDelete) return;

    try {
      await network.fetch('DELETE', `/workflows/${workflowToDelete}`);
      toast.success('Workflow deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete workflow');
    } finally {
      setWorkflowToDelete(null);
    }
  };

  const handleDuplicate = async (workflowId: string) => {
    try {
      await network.fetch('POST', `/workflows/${workflowId}/duplicate`);
      toast.success('Workflow duplicated successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate workflow');
    }
  };

  const handleToggleEnabled = async (workflowId: string, currentlyEnabled: boolean) => {
    try {
      await network.fetch<Workflow, typeof WorkflowSchemas.update>('PATCH', `/workflows/${workflowId}`, {
        enabled: !currentlyEnabled,
      });
      toast.success(`Workflow ${!currentlyEnabled ? 'enabled' : 'disabled'} successfully`);
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle workflow');
    }
  };

  return (
    <>
      <NextSeo title="Workflows" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Workflows</h1>
              <p className="text-neutral-500 mt-2 text-sm sm:text-base">
                Automate your email campaigns with powerful workflows.{' '}
                {data?.total ? `${data.total} total workflows` : ''}
              </p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Workflow</span>
              <span className="sm:hidden">Create</span>
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search workflows..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-10 pr-10"
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

          {/* Workflows */}
          <div>
            {isLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center py-12">
                    <IconSpinner />
                  </div>
                </CardContent>
              </Card>
            ) : data?.data.length === 0 ? (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={WorkflowIcon}
                    title={search ? 'No workflows match' : 'No workflows yet'}
                    description={search ? 'Try a different search term.' : 'Automate emails triggered by contact events.'}
                    action={
                      !search ? (
                        <Button onClick={() => setShowCreateDialog(true)}>
                          <Plus className="h-4 w-4" />
                          Create Workflow
                        </Button>
                      ) : undefined
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data?.data.map(workflow => (
                    <Card key={workflow.id} className="transition-colors hover:border-neutral-300 flex flex-col [&:has([data-card-link]:focus-visible)]:ring-2 [&:has([data-card-link]:focus-visible)]:ring-ring [&:has([data-card-link]:focus-visible)]:ring-offset-2">
                      <Link
                        href={`/workflows/${workflow.id}`}
                        data-card-link=""
                        className="flex-1 block p-6 pb-4 hover:bg-neutral-50/50 transition-colors rounded-t-xl focus-visible:outline-none"
                        aria-label={`Open ${workflow.name}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h3 className="font-semibold text-neutral-900 leading-snug">{workflow.name}</h3>
                          <Badge variant={workflow.enabled ? 'success' : 'neutral'} className="shrink-0 mt-0.5">
                            {workflow.enabled ? (
                              <><Power className="h-3 w-3 mr-1" />Active</>
                            ) : (
                              <><PowerOff className="h-3 w-3 mr-1" />Disabled</>
                            )}
                          </Badge>
                        </div>
                        {workflow.triggerConfig &&
                          typeof workflow.triggerConfig === 'object' &&
                          'eventName' in workflow.triggerConfig && (
                            <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-3">
                              <Zap className="h-3 w-3 shrink-0" />
                              <span>Triggers on</span>
                              <code className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700">
                                {String(workflow.triggerConfig.eventName)}
                              </code>
                            </div>
                          )}
                        <div className="flex items-center gap-4 text-sm">
                          <span>
                            <strong className="font-semibold text-neutral-900">{workflow._count?.steps ?? 0}</strong>
                            <span className="text-neutral-400 ml-1 text-xs">steps</span>
                          </span>
                          <span className="h-3 w-px bg-neutral-200" />
                          <span>
                            <strong className="font-semibold text-neutral-900">{workflow._count?.executions ?? 0}</strong>
                            <span className="text-neutral-400 ml-1 text-xs">executions</span>
                          </span>
                        </div>
                      </Link>
                      <div className="px-6 py-3 border-t border-neutral-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          <Calendar className="h-3 w-3" />
                          <div className="group relative inline-block cursor-help">
                            <span>Updated {formatRelativeTime(workflow.updatedAt)}</span>
                            <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                              {dayjs(workflow.updatedAt).format('DD MMMM YYYY, hh:mm')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={workflow.enabled ? 'Disable workflow' : 'Enable workflow'}
                            onClick={() => handleToggleEnabled(workflow.id, workflow.enabled)}
                          >
                            {workflow.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                          <Button asChild variant="ghost" size="sm" title="Edit workflow">
                            <Link href={`/workflows/${workflow.id}`} aria-label="Edit workflow"><Edit className="h-4 w-4" /></Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Duplicate workflow"
                            onClick={() => handleDuplicate(workflow.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete workflow"
                            onClick={() => {
                              setWorkflowToDelete(workflow.id);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                {data && data.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <p className="text-sm text-neutral-500">
                      Showing {(page - 1) * data.pageSize + 1} to {Math.min(page * data.pageSize, data.total)} of{' '}
                      {data.total} workflows
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                        Previous
                      </Button>
                      <span className="text-sm text-neutral-700">
                        Page {page} of {data.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={page === data.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Create Workflow Dialog */}
        <CreateWorkflowDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={() => mutate()} />

        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          title="Delete Workflow"
          description="Are you sure you want to delete this workflow? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
        />
      </DashboardLayout>
    </>
  );
}

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateWorkflowDialog({open, onOpenChange, onSuccess}: CreateWorkflowDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventPopoverOpen, setEventPopoverOpen] = useState(false);
  const [allowReentry, setAllowReentry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available event names
  const {data: eventNamesData} = useSWR<{eventNames: string[]}>(open ? '/events/names' : null, {
    revalidateOnFocus: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const workflow = await network.fetch<Workflow, typeof WorkflowSchemas.create>('POST', '/workflows', {
        name,
        description: description || undefined,
        eventName: eventName.trim(),
        allowReentry,
        enabled: false,
      });

      toast.success('Workflow created successfully');
      setName('');
      setDescription('');
      setEventName('');
      setAllowReentry(false);
      onOpenChange(false);
      onSuccess();

      // Redirect to the workflow editor
      window.location.href = `/workflows/${workflow.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create workflow');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Workflow</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Welcome Email Sequence"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Send a series of welcome emails to new subscribers"
              className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="createEventName">Trigger Event *</Label>
            {/* Combobox: 可自由輸入 event name，同時提供已追蹤 event 的下拉建議 */}
            <div className="relative">
              <Input
                id="createEventName"
                type="text"
                value={eventName}
                onChange={e => {
                  setEventName(e.target.value);
                  setEventPopoverOpen(true);
                }}
                onFocus={() => setEventPopoverOpen(true)}
                onBlur={() => {
                  // 延遲關閉，讓 CommandItem 的 onSelect 有時間觸發
                  setTimeout(() => setEventPopoverOpen(false), 150);
                }}
                placeholder="e.g., contact.created, email.opened"
                required
                autoComplete="off"
              />
              {eventPopoverOpen && ((eventNamesData?.eventNames?.length ?? 0) > 0 || eventName?.trim()) && (
                <div className="absolute z-50 w-full mt-1 rounded-md border border-neutral-200 bg-white shadow-md">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {eventNamesData?.eventNames
                          ?.filter(n => !eventName || n.toLowerCase().includes(eventName.toLowerCase()))
                          .map(n => (
                            <CommandItem
                              key={n}
                              value={n}
                              onSelect={() => {
                                setEventName(n);
                                setEventPopoverOpen(false);
                              }}
                            >
                              {n}
                            </CommandItem>
                          ))}
                        {eventName?.trim() && !eventNamesData?.eventNames?.some(n => n === eventName.trim()) && (
                          <CommandItem
                            key="__custom__"
                            value={eventName.trim()}
                            onSelect={() => {
                              setEventName(eventName.trim());
                              setEventPopoverOpen(false);
                            }}
                          >
                            Use &ldquo;{eventName.trim()}&rdquo;
                          </CommandItem>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              The event that triggers this workflow to start for a contact
            </p>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="allowReentry"
              type="checkbox"
              checked={allowReentry}
              onChange={e => setAllowReentry(e.target.checked)}
              className="mt-0.5 h-4 w-4 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border-neutral-300 rounded"
            />
            <div className="flex-1">
              <Label htmlFor="allowReentry" className="font-medium cursor-pointer">
                Allow Re-entry
              </Label>
              <p className="text-xs text-neutral-500 mt-0.5">
                When enabled, contacts can enter this workflow multiple times.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? 'Creating...' : 'Create Workflow'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
