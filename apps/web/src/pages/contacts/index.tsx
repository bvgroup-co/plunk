import {
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconSpinner,
  Input,
  Label,
  Switch,
} from '@plunk/ui';
import type {Contact} from '@plunk/db';
import type {CursorPaginatedResponse} from '@plunk/types';
import {EmptyState} from '@plunk/ui';
import {DashboardLayout} from '../../components/DashboardLayout';
import {KeyValueEditor} from '../../components/KeyValueEditor';
import {network} from '../../lib/network';
import {formatRelativeTime} from '../../lib/dateUtils';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Edit,
  FileUp,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  Minus,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {NextSeo} from 'next-seo';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';
import {ContactSchemas} from '@plunk/shared';
import dayjs from 'dayjs';

export default function ContactsPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([undefined]);
  const [currentPage, setCurrentPage] = useState(0);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [excludedContacts, setExcludedContacts] = useState<Set<string>>(new Set());
  const [showBulkActionsDialog, setShowBulkActionsDialog] = useState(false);
  const [bulkOperation, setBulkOperation] = useState<'subscribe' | 'unsubscribe' | 'delete' | null>(null);
  const pageSize = 50;

  const {data, mutate, isLoading} = useSWR<CursorPaginatedResponse<Contact>>(
    `/contacts?limit=${pageSize}${cursor ? `&cursor=${cursor}` : ''}${search ? `&search=${search}` : ''}`,
    {revalidateOnFocus: false},
  );

    useEffect(() => {
    if (data) {
      setContacts(data.data);
      if (!cursor) {
        setTotalCount(data.total || data.data.length);
      }
    }
  }, [data, cursor]);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setCursor(undefined);
      setCursorHistory([undefined]);
      setCurrentPage(0);
      setContacts([]);
      setSelectedContacts(new Set());
      setSelectAllMatching(false);
      setExcludedContacts(new Set());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const handleNextPage = () => {
    if (data?.cursor) {
      const newPage = currentPage + 1;
      setCursor(data.cursor);
      setCurrentPage(newPage);
      // Preserve selection across pages only when "select all matching" is on; otherwise
      // clear, since per-page id sets stop being meaningful once you've left the page.
      if (!selectAllMatching) {
        setSelectedContacts(new Set());
      }

      if (cursorHistory.length <= newPage) {
        setCursorHistory(prev => [...prev, data.cursor]);
      }
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      const newPage = currentPage - 1;
      const previousCursor = cursorHistory[newPage];
      setCursor(previousCursor);
      setCurrentPage(newPage);
      if (!selectAllMatching) {
        setSelectedContacts(new Set());
      }
    }
  };

  // True when the current page's checkbox should appear "all selected"
  const allOnPageSelected = contacts.length > 0 && (
    selectAllMatching
      ? contacts.every(c => !excludedContacts.has(c.id))
      : selectedContacts.size === contacts.length && contacts.every(c => selectedContacts.has(c.id))
  );

  const handleSelectAll = () => {
    if (selectAllMatching) {
      // Toggle: exclude or re-include all on this page
      if (allOnPageSelected) {
        setExcludedContacts(prev => {
          const next = new Set(prev);
          contacts.forEach(c => next.add(c.id));
          return next;
        });
      } else {
        setExcludedContacts(prev => {
          const next = new Set(prev);
          contacts.forEach(c => next.delete(c.id));
          return next;
        });
      }
      return;
    }
    if (allOnPageSelected) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.map(c => c.id)));
    }
  };

  const handleSelectContact = (contactId: string) => {
    if (selectAllMatching) {
      setExcludedContacts(prev => {
        const next = new Set(prev);
        if (next.has(contactId)) next.delete(contactId);
        else next.add(contactId);
        return next;
      });
      return;
    }
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const isContactSelected = (contactId: string) =>
    selectAllMatching ? !excludedContacts.has(contactId) : selectedContacts.has(contactId);

  const effectiveSelectionCount = selectAllMatching
    ? Math.max(0, totalCount - excludedContacts.size)
    : selectedContacts.size;

  const handleBulkAction = (operation: 'subscribe' | 'unsubscribe' | 'delete') => {
    setBulkOperation(operation);
    setShowBulkActionsDialog(true);
  };

  const clearSelection = () => {
    setSelectedContacts(new Set());
    setSelectAllMatching(false);
    setExcludedContacts(new Set());
  };

  const handleSelectAllMatching = () => {
    setSelectAllMatching(true);
    setSelectedContacts(new Set());
    setExcludedContacts(new Set());
  };

  const promptDelete = (contactId: string) => {
    setContactToDelete(contactId);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!contactToDelete) return;

    try {
      await network.fetch('DELETE', `/contacts/${contactToDelete}`);
      toast.success('Contact deleted successfully');
      void mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete contact');
    } finally {
      setContactToDelete(null);
    }
  };

  return (
    <>
      <NextSeo title="Contacts" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Contacts</h1>
                <p className="text-neutral-500 mt-2 text-sm sm:text-base">
                  Manage your email subscribers and their data.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowImportDialog(true)} className="flex-1 sm:flex-none">
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">Import CSV</span>
                  <span className="sm:hidden">Import</span>
                </Button>
                <Button onClick={() => setShowCreateDialog(true)} className="flex-1 sm:flex-none">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Contact</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Contacts Table */}
          <Card>
            {/* Contextual header strip: idle = search + count, selecting = bulk actions.
                Single fixed-min-height row prevents layout shift as state toggles.
                The select-all-matching link is folded inline into the toolbar. */}
            <div
              key={effectiveSelectionCount === 0 ? 'idle' : 'selecting'}
              className="border-b border-neutral-200 px-6 min-h-[68px] flex items-center py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
            >
              {effectiveSelectionCount === 0 ? (
                <div className="flex items-center gap-4 w-full">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="Search by email..."
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
                      className="pl-10 pr-9 h-10"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => {
                          setSearchInput('');
                          setSearch('');
                          setCursor(undefined);
                          setCursorHistory([undefined]);
                          setCurrentPage(0);
                          setContacts([]);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {totalCount > 0 && (
                    <span className="hidden sm:inline text-sm text-neutral-500 tabular-nums whitespace-nowrap">
                      {totalCount.toLocaleString()} {search ? 'matching' : 'total'}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-x-4 gap-y-2 min-w-0 flex-wrap">
                    <span className="text-sm font-medium text-neutral-900 tabular-nums whitespace-nowrap">
                      {effectiveSelectionCount.toLocaleString()} selected
                    </span>
                    {!selectAllMatching && allOnPageSelected && totalCount > contacts.length && (
                      <button
                        type="button"
                        onClick={handleSelectAllMatching}
                        className="text-sm font-medium text-neutral-600 underline-offset-4 transition-colors hover:text-neutral-900 hover:underline focus-visible:outline-none focus-visible:underline focus-visible:text-neutral-900 whitespace-nowrap rounded-sm tabular-nums"
                      >
                        Select all {totalCount.toLocaleString()}
                        {search ? ' matching' : ''}
                      </button>
                    )}
                    <div className="hidden sm:block h-5 w-px bg-neutral-200" aria-hidden="true" />
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => handleBulkAction('subscribe')}>
                        <MailCheck className="h-4 w-4 mr-1.5" />
                        Subscribe
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleBulkAction('unsubscribe')}>
                        <MailX className="h-4 w-4 mr-1.5" />
                        Unsubscribe
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkAction('delete')}
                        className="text-neutral-700 transition-colors hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                      >
                        <Trash2 className="h-4 w-4 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    aria-label="Clear selection"
                    className="text-neutral-500 hover:text-neutral-900"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <CardContent className="p-0">
              {isLoading && contacts.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <IconSpinner />
                </div>
              ) : contacts.length === 0 ? (
                <div className="px-6 py-12">
                  <EmptyState
                    icon={Mail}
                    title={search ? 'No contacts match' : 'No contacts yet'}
                    description={search ? 'Try a different search term.' : 'Add contacts to start tracking engagement.'}
                    action={
                      !search ? (
                        <Button onClick={() => setShowCreateDialog(true)}>
                          <Plus className="h-4 w-4" />
                          Add Contact
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <>
                  {/* Desktop Table View - Hidden on mobile */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-6 py-3 text-left w-12">
                            <Checkbox
                              checked={allOnPageSelected}
                              onCheckedChange={handleSelectAll}
                            />
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {contacts.map(contact => (
                          <tr key={contact.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Checkbox
                                checked={isContactSelected(contact.id)}
                                onCheckedChange={() => handleSelectContact(contact.id)}
                              />
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {contact.subscribed ? (
                                  <MailCheck className="h-4 w-4 text-green-600" />
                                ) : (
                                  <MailX className="h-4 w-4 text-red-600" />
                                )}
                                <Link
                                  href={`/contacts/${contact.id}`}
                                  className="text-sm font-medium text-neutral-900 hover:text-neutral-700 focus-visible:outline-none focus-visible:underline"
                                >
                                  {contact.email}
                                </Link>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  contact.subscribed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {contact.subscribed ? 'Subscribed' : 'Unsubscribed'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                              <div className="group relative inline-block cursor-help">
                                {formatRelativeTime(contact.createdAt)}
                                <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-1/2 transform -translate-x-1/2 mb-1 whitespace-nowrap">
                                  {dayjs(contact.createdAt).format('DD MMMM YYYY, hh:mm')}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end gap-2">
                                <Button asChild variant="ghost" size="sm">
                                  <Link href={`/contacts/${contact.id}`}><Edit className="h-4 w-4" /></Link>
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => promptDelete(contact.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View - Only visible on mobile */}
                  <div className="md:hidden space-y-3 p-4">
                    {contacts.map(contact => (
                      <div
                        key={contact.id}
                        className="border border-neutral-200 rounded-lg p-4 bg-white hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {contact.subscribed ? (
                              <MailCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                            ) : (
                              <MailX className="h-4 w-4 text-red-600 flex-shrink-0" />
                            )}
                            <Link
                              href={`/contacts/${contact.id}`}
                              className="text-sm font-medium text-neutral-900 truncate hover:text-neutral-700 focus-visible:outline-none focus-visible:underline"
                            >
                              {contact.email}
                            </Link>
                          </div>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                              contact.subscribed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {contact.subscribed ? 'Subscribed' : 'Unsubscribed'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="group relative inline-block cursor-help">
                            <span className="text-xs text-neutral-500">{formatRelativeTime(contact.createdAt)}</span>
                            <div className="hidden group-hover:block absolute z-10 w-48 p-2 bg-neutral-900 text-white text-xs rounded shadow-md bottom-full left-0 mb-1 whitespace-nowrap">
                              {dayjs(contact.createdAt).format('Do MMMM YYYY, h:mm A')}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/contacts/${contact.id}`}><Edit className="h-4 w-4" /></Link>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => promptDelete(contact.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {(currentPage > 0 || data?.hasMore) && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 border-t border-neutral-200">
                      <div className="text-xs sm:text-sm text-neutral-600 text-center sm:text-left">
                        Showing <span className="font-medium text-neutral-900">{currentPage * pageSize + 1}</span> to{' '}
                        <span className="font-medium text-neutral-900">{currentPage * pageSize + contacts.length}</span>
                        {totalCount > 0 && (
                          <>
                            {' '}
                            of <span className="font-medium text-neutral-900">{totalCount.toLocaleString()}</span>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2 justify-center sm:justify-end">
                        <Button
                          variant="outline"
                          onClick={handlePreviousPage}
                          disabled={currentPage === 0 || isLoading}
                          className="flex-1 sm:flex-none"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span className="hidden sm:inline">Previous</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleNextPage}
                          disabled={!data?.hasMore || isLoading}
                          className="flex-1 sm:flex-none"
                        >
                          <span className="hidden sm:inline">Next</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create Contact Dialog */}
        <CreateContactDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={() => mutate()} />

        {/* Import Contacts Dialog */}
        <ImportContactsDialog open={showImportDialog} onOpenChange={setShowImportDialog} onSuccess={() => mutate()} />

        {/* Bulk Actions Dialog */}
        <BulkActionsDialog
          open={showBulkActionsDialog}
          onOpenChange={setShowBulkActionsDialog}
          operation={bulkOperation}
          selector={
            selectAllMatching
              ? {mode: 'query', filter: search ? {search} : {}, excludeIds: Array.from(excludedContacts)}
              : {mode: 'ids', contactIds: Array.from(selectedContacts)}
          }
          targetCount={effectiveSelectionCount}
          onSuccess={() => {
            mutate();
            clearSelection();
          }}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          onConfirm={handleDelete}
          title="Delete Contact"
          description="Are you sure you want to delete this contact? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
        />
      </DashboardLayout>
    </>
  );
}

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function CreateContactDialog({open, onOpenChange, onSuccess}: CreateContactDialogProps) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(true);
  const [customData, setCustomData] = useState<Record<string, string | number | boolean> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await network.fetch<
        {
          _meta?: {isNew: boolean; isUpdate: boolean};
          email: string;
        },
        typeof ContactSchemas.create
      >('POST', '/contacts', {email, subscribed, data: customData});

      // Show appropriate message based on whether contact was new or updated
      if (response._meta?.isUpdate) {
        toast.success(`Contact ${response.email} already existed and was updated with new data`);
      } else {
        toast.success('Contact created successfully');
      }

      setEmail('');
      setSubscribed(true);
      setCustomData(null);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="contact@example.com"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="subscribed" className="font-medium cursor-pointer">
                Subscribed
              </Label>
              <p className="text-xs text-neutral-500 mt-0.5">
                Receive emails from campaigns and workflows.
              </p>
            </div>
            <Switch id="subscribed" checked={subscribed} onCheckedChange={setSubscribed} />
          </div>

          <KeyValueEditor key={open ? 'create' : 'closed'} initialData={customData} onChange={setCustomData} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ImportContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportResult {
  totalRows: number;
  successCount: number;
  createdCount: number;
  updatedCount: number;
  failureCount: number;
  errors: Array<{row: number; email: string; error: string}>;
}

function ImportContactsDialog({open, onOpenChange, onSuccess}: ImportContactsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [, setJobId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'failed'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);

  // Helper function to truncate long file names from the middle
  const truncateFileName = (fileName: string, maxLength: number = 30) => {
    if (fileName.length <= maxLength) return fileName;

    const extension = fileName.substring(fileName.lastIndexOf('.'));
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
    const charsToShow = maxLength - extension.length - 3; // 3 for "..."
    const frontChars = Math.ceil(charsToShow / 2);
    const backChars = Math.floor(charsToShow / 2);

    return `${nameWithoutExt.substring(0, frontChars)}...${nameWithoutExt.substring(nameWithoutExt.length - backChars)}${extension}`;
  };

  // Clean up polling on unmount or dialog close
  useEffect(() => {
    if (!open) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      // Reset state when dialog closes
      setTimeout(() => {
        setFile(null);
        setJobId(null);
        setProgress(0);
        setStatus('idle');
        setResult(null);
        setErrorMessage(null);
      }, 300);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.endsWith('.csv')) {
        toast.error('Please select a CSV file');
        return;
      }

      // Validate file size (5MB max)
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }

      setFile(selectedFile);
      setStatus('idle');
    }
  };

  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await network.fetch<{
        id: string;
        state: string;
        progress: number;
        result: ImportResult | null;
        failedReason?: string;
      }>('GET', `/contacts/import/${jobId}`);

      setProgress(response.progress || 0);

      if (response.state === 'completed') {
        setStatus('completed');
        setResult(response.result);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        // Show success message
        if (response.result) {
          const {createdCount, updatedCount, failureCount} = response.result;
          const parts = [];
          if (createdCount > 0) parts.push(`${createdCount} created`);
          if (updatedCount > 0) parts.push(`${updatedCount} updated`);
          if (failureCount > 0) parts.push(`${failureCount} failed`);

          toast.success(`Import completed: ${parts.join(', ')}`);
        }

        onSuccess();
      } else if (response.state === 'failed') {
        setStatus('failed');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        // Store and show the specific error message if available, otherwise show generic error
        const errorMsg = response.failedReason || 'Import failed. Please check your CSV file and try again.';
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
      } else if (response.state === 'active') {
        setStatus('processing');
      }
    } catch (error) {
      console.error('Failed to poll job status:', error);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setStatus('failed');
      toast.error('Failed to check import status');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setStatus('uploading');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const data = await network.upload<{jobId: string; message: string}>('POST', '/contacts/import', formData);

      setJobId(data.jobId);
      setStatus('processing');

      // Start polling for job status
      pollIntervalRef.current = setInterval(() => {
        void pollJobStatus(data.jobId);
      }, 1000); // Poll every second
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to upload file';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
      setStatus('failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (status === 'processing') {
      setShowCloseConfirmDialog(true);
      return;
    }
    onOpenChange(false);
  };

  const confirmClose = () => {
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Contacts from CSV</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Instructions */}
            <div className="text-sm text-neutral-500 space-y-1">
              <p>Required column: <code className="text-neutral-700 bg-neutral-100 px-1 py-0.5 rounded text-xs">email</code>. Optional: <code className="text-neutral-700 bg-neutral-100 px-1 py-0.5 rounded text-xs">subscribed</code> (true/false) and any custom fields. Max 5MB.</p>
            </div>

            {/* File Upload */}
            {status === 'idle' || status === 'failed' ? (
              <div>
                <Label htmlFor="csv-file">Select CSV File</Label>
                <div className="mt-2">
                  <input
                    ref={fileInputRef}
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <FileUp className="h-4 w-4 mr-2" />
                    {file ? truncateFileName(file.name) : 'Choose CSV File'}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Progress */}
            {(status === 'uploading' || status === 'processing') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-600">
                    {status === 'uploading' ? 'Uploading file...' : 'Processing contacts...'}
                  </span>
                  <span className="text-neutral-900 font-medium">{progress}%</span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-1.5">
                  <div
                    className="bg-neutral-900 h-1.5 rounded-full transition-all duration-300"
                    style={{width: `${progress}%`}}
                  />
                </div>
              </div>
            )}

            {/* Results */}
            {status === 'completed' && result && (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>
                    <span className="font-medium text-neutral-900">{result.totalRows}</span> processed —{' '}
                    <span className="text-neutral-900">{result.createdCount}</span> created,{' '}
                    <span className="text-neutral-900">{result.updatedCount}</span> updated
                    {result.failureCount > 0 && (
                      <>, <span className="text-red-600">{result.failureCount}</span> failed</>
                    )}
                  </span>
                </div>

                {/* Error Details */}
                {result.errors && result.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-neutral-200 rounded-md">
                    <div className="space-y-0 text-xs text-neutral-600">
                      {result.errors.slice(0, 10).map((error, idx) => (
                        <div key={idx} className="flex gap-3 px-3 py-2 border-b border-neutral-100 last:border-0">
                          <span className="font-mono text-neutral-400 flex-shrink-0">Row {error.row}</span>
                          <span className="text-red-600">{error.email || 'N/A'} — {error.error}</span>
                        </div>
                      ))}
                      {result.errors.length > 10 && (
                        <div className="px-3 py-2 text-neutral-500">
                          +{result.errors.length - 10} more errors
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {status === 'failed' && (
              <div className="flex items-start gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-red-600">{errorMessage || 'Please check your CSV file and try again.'}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            {status === 'idle' || status === 'failed' ? (
              <>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleUpload} disabled={!file || isUploading}>
                  {isUploading ? 'Uploading...' : 'Import Contacts'}
                </Button>
              </>
            ) : status === 'completed' ? (
              <Button type="button" onClick={handleClose}>
                Close
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={handleClose}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showCloseConfirmDialog}
        onOpenChange={setShowCloseConfirmDialog}
        onConfirm={confirmClose}
        title="Close Import"
        description="Import is still in progress. Are you sure you want to close?"
        confirmText="Close Anyway"
        variant="destructive"
      />
    </>
  );
}

type BulkSelector =
  | {mode: 'ids'; contactIds: string[]}
  | {mode: 'query'; filter: {search?: string}; excludeIds: string[]};

interface BulkActionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: 'subscribe' | 'unsubscribe' | 'delete' | null;
  selector: BulkSelector;
  targetCount: number;
  onSuccess: () => void;
}

interface BulkActionResult {
  operation: 'subscribe' | 'unsubscribe' | 'delete';
  totalRequested: number;
  /** Contacts whose state was actually changed by this run. */
  successCount: number;
  /** Subscribe/unsubscribe only: contacts that were already in the target state. */
  unchangedCount: number;
  /** Contacts that errored or weren't found. */
  failureCount: number;
  errors: Array<{contactId: string; email: string; error: string}>;
}

function BulkActionsDialog({open, onOpenChange, operation, selector, targetCount, onSuccess}: BulkActionsDialogProps) {
  const [, setJobId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [result, setResult] = useState<BulkActionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);

  // Clean up polling on unmount or dialog close
  useEffect(() => {
    if (!open) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setTimeout(() => {
        setJobId(null);
        setProgress(0);
        setStatus('idle');
        setResult(null);
        setErrorMessage(null);
      }, 300);
    }
  }, [open]);

  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await network.fetch<{
        id: string;
        state: string;
        progress: number;
        result: BulkActionResult | null;
        failedReason?: string;
      }>('GET', `/contacts/bulk/${jobId}`);

      setProgress(response.progress || 0);

      if (response.state === 'completed') {
        setStatus('completed');
        setResult(response.result);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        if (response.result) {
          toast.success(buildToastSummary(response.result));
        }

        onSuccess();
      } else if (response.state === 'failed') {
        setStatus('failed');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        const errorMsg = response.failedReason || 'Operation failed';
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
      } else if (response.state === 'active') {
        setStatus('processing');
      }
    } catch (error) {
      console.error('Failed to poll job status:', error);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setStatus('failed');
      toast.error('Failed to check operation status');
    }
  };

  const handleConfirm = async () => {
    if (!operation) return;

    setIsProcessing(true);
    setStatus('processing');

    try {
      const endpoint = `/contacts/bulk-${operation}`;
      const data = await network.fetch<{jobId: string; message: string}, typeof ContactSchemas.bulkAction>(
        'POST',
        endpoint,
        selector,
      );

      setJobId(data.jobId);

      // Start polling for job status
      pollIntervalRef.current = setInterval(() => {
        void pollJobStatus(data.jobId);
      }, 1000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to start operation';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
      setStatus('failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (status === 'processing') {
      setShowCloseConfirmDialog(true);
      return;
    }
    onOpenChange(false);
  };

  const confirmClose = () => {
    onOpenChange(false);
  };

  const copy = getOperationCopy(operation);

  const isQueueing = status === 'processing' && progress === 0;
  const dialogTitle =
    status === 'completed'
      ? copy.completedTitle
      : status === 'processing'
      ? copy.progressTitle
      : status === 'failed'
      ? copy.failedTitle
      : copy.title;

  const handleRetry = () => {
    setErrorMessage(null);
    setStatus('idle');
    void handleConfirm();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="transition-colors">{dialogTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {status === 'idle' && (
              <div className="space-y-3 motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-200">
                <p className="text-sm text-neutral-700 leading-relaxed">
                  {copy.confirmVerb}{' '}
                  <span className="font-medium text-neutral-900 tabular-nums">
                    {targetCount.toLocaleString()} contact{targetCount !== 1 ? 's' : ''}
                  </span>
                  ?
                  {copy.skipNote && <span className="text-neutral-500"> {copy.skipNote}</span>}
                </p>
                {operation === 'delete' && (
                  <div className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    <p className="leading-relaxed">
                      <span className="font-medium">This action cannot be undone.</span> Contacts and their event history will be permanently removed.
                    </p>
                  </div>
                )}
                {selector.mode === 'query' && (
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Contacts are evaluated when the job runs — any added in the meantime may also be included.
                  </p>
                )}
              </div>
            )}

            {status === 'processing' && (
              <div className="space-y-3 py-1 motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-200">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2 text-neutral-600">
                    {isQueueing && <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />}
                    <span>
                      {isQueueing
                        ? 'Queued — starting up…'
                        : `${copy.processingLabel} ${targetCount.toLocaleString()} contact${targetCount !== 1 ? 's' : ''}`}
                    </span>
                  </span>
                  <span
                    className={`tabular-nums font-medium transition-opacity ${
                      isQueueing ? 'text-neutral-400' : 'text-neutral-900'
                    }`}
                  >
                    {progress}%
                  </span>
                </div>
                <div className="relative w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                  {isQueueing ? (
                    <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-neutral-300 motion-safe:animate-[indeterminate_1.4s_ease-in-out_infinite]" />
                  ) : (
                    <div
                      className="bg-neutral-900 h-full rounded-full transition-[width] duration-500 ease-out"
                      style={{width: `${progress}%`}}
                    />
                  )}
                </div>
              </div>
            )}

            {status === 'completed' && result && <BulkResultSummary result={result} />}

            {status === 'failed' && (
              <div className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
                <p className="leading-relaxed">{errorMessage || 'Something went wrong. Please try again.'}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            {status === 'idle' ? (
              <>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  variant={operation === 'delete' ? 'destructive' : 'default'}
                >
                  {isProcessing ? 'Starting…' : copy.confirmButton}
                </Button>
              </>
            ) : status === 'failed' ? (
              <>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Close
                </Button>
                <Button type="button" onClick={handleRetry} variant={operation === 'delete' ? 'destructive' : 'default'}>
                  Try again
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={handleClose}
                variant={status === 'completed' ? 'default' : 'outline'}
              >
                {status === 'completed' ? 'Done' : 'Hide'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showCloseConfirmDialog}
        onOpenChange={setShowCloseConfirmDialog}
        onConfirm={confirmClose}
        title="Hide this dialog?"
        description="The job will keep running in the background. You won't see the result here, but the contacts will still be updated."
        confirmText="Hide"
        variant="default"
      />
    </>
  );
}

interface OperationCopy {
  title: string;
  progressTitle: string;
  completedTitle: string;
  failedTitle: string;
  confirmVerb: string;
  confirmButton: string;
  processingLabel: string;
  /** Past-tense verb used in result rows: "12 subscribed". */
  changedVerb: string;
  /** Result-state noun phrase: "contacts subscribed" — pluralisation handled separately. */
  summaryNoun: string;
  /** Past participle for "already X": "already subscribed". null = no skip case. */
  alreadyState: string | null;
  /** Note shown next to the confirm prompt for ops with skip semantics. */
  skipNote: string | null;
}

function getOperationCopy(operation: 'subscribe' | 'unsubscribe' | 'delete' | null): OperationCopy {
  switch (operation) {
    case 'subscribe':
      return {
        title: 'Subscribe contacts',
        progressTitle: 'Subscribing…',
        completedTitle: 'Subscribed',
        failedTitle: "Couldn't subscribe contacts",
        confirmVerb: 'Subscribe',
        confirmButton: 'Subscribe',
        processingLabel: 'Subscribing',
        changedVerb: 'subscribed',
        summaryNoun: 'subscribed',
        alreadyState: 'already subscribed',
        skipNote: 'Already-subscribed contacts will be skipped.',
      };
    case 'unsubscribe':
      return {
        title: 'Unsubscribe contacts',
        progressTitle: 'Unsubscribing…',
        completedTitle: 'Unsubscribed',
        failedTitle: "Couldn't unsubscribe contacts",
        confirmVerb: 'Unsubscribe',
        confirmButton: 'Unsubscribe',
        processingLabel: 'Unsubscribing',
        changedVerb: 'unsubscribed',
        summaryNoun: 'unsubscribed',
        alreadyState: 'already unsubscribed',
        skipNote: 'Already-unsubscribed contacts will be skipped.',
      };
    case 'delete':
      return {
        title: 'Delete contacts',
        progressTitle: 'Deleting…',
        completedTitle: 'Deleted',
        failedTitle: "Couldn't delete contacts",
        confirmVerb: 'Permanently delete',
        confirmButton: 'Delete',
        processingLabel: 'Deleting',
        changedVerb: 'deleted',
        summaryNoun: 'removed',
        alreadyState: null,
        skipNote: null,
      };
    default:
      return {
        title: 'Process contacts',
        progressTitle: 'Processing…',
        completedTitle: 'Done',
        failedTitle: 'Operation failed',
        confirmVerb: 'Process',
        confirmButton: 'Process',
        processingLabel: 'Processing',
        changedVerb: 'processed',
        summaryNoun: 'processed',
        alreadyState: null,
        skipNote: null,
      };
  }
}

function buildToastSummary(result: BulkActionResult): string {
  const copy = getOperationCopy(result.operation);
  const parts: string[] = [];
  if (result.successCount > 0) parts.push(`${result.successCount.toLocaleString()} ${copy.changedVerb}`);
  if (result.unchangedCount > 0 && copy.alreadyState) {
    parts.push(`${result.unchangedCount.toLocaleString()} ${copy.alreadyState}`);
  }
  if (result.failureCount > 0) parts.push(`${result.failureCount.toLocaleString()} failed`);
  if (parts.length === 0) return 'No contacts to update';
  return parts.join(' · ');
}

function BulkResultSummary({result}: {result: BulkActionResult}) {
  const copy = getOperationCopy(result.operation);
  const {successCount, unchangedCount, failureCount} = result;
  const noChanges = successCount === 0 && failureCount === 0 && unchangedCount > 0;
  const total = successCount + unchangedCount + failureCount;

  // Build the row list. The "primary" row is the row that represents what the
  // user actually got — usually the changed count, but when nothing changed we
  // promote the "already in state" row so the summary still has a clear lead.
  type Row = {
    key: string;
    label: string;
    count: number;
    primary?: boolean;
    tone?: 'default' | 'danger';
  };
  const rows: Row[] = [];

  if (noChanges && copy.alreadyState) {
    rows.push({key: 'already', label: copy.alreadyState, count: unchangedCount, primary: true});
  } else {
    rows.push({key: 'changed', label: copy.completedTitle, count: successCount, primary: true});
    if (unchangedCount > 0 && copy.alreadyState) {
      rows.push({key: 'already', label: copy.alreadyState, count: unchangedCount});
    }
  }
  if (failureCount > 0) {
    rows.push({key: 'failed', label: 'Failed', count: failureCount, tone: 'danger'});
  }

  return (
    <div className="space-y-3 motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
      <div className="rounded-lg border border-neutral-200 overflow-hidden divide-y divide-neutral-100">
        {rows.map(row => {
          const isPrimary = !!row.primary;
          const isDanger = row.tone === 'danger';
          return (
            <div
              key={row.key}
              className={`flex items-center gap-3 px-4 ${isPrimary ? 'py-4' : 'py-2.5'}`}
            >
              {/* Status mark — only on the primary row. Subsequent rows leave the
                  same column blank to keep the labels in a single visual track. */}
              <div className="w-7 shrink-0 flex items-center">
                {isPrimary && (
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      noChanges ? 'bg-neutral-100 text-neutral-500' : 'bg-neutral-900 text-white'
                    }`}
                  >
                    {noChanges ? (
                      <Minus className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    )}
                  </div>
                )}
              </div>
              <div
                className={`flex-1 first-letter:capitalize ${
                  isPrimary
                    ? 'text-sm font-medium text-neutral-900'
                    : isDanger
                    ? 'text-sm text-red-600'
                    : 'text-sm text-neutral-500'
                }`}
              >
                {row.label}
              </div>
              <div
                className={`tabular-nums tracking-tight ${
                  isPrimary
                    ? 'text-2xl font-semibold text-neutral-900 leading-none'
                    : isDanger
                    ? 'text-sm font-medium text-red-700'
                    : 'text-sm font-medium text-neutral-700'
                }`}
              >
                {row.count.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>

      {total > 1 && rows.length > 1 && (
        <div className="px-4 flex items-baseline justify-between text-xs text-neutral-500">
          <span>Total processed</span>
          <span className="tabular-nums font-medium text-neutral-700">{total.toLocaleString()}</span>
        </div>
      )}

      {result.errors && result.errors.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700 select-none px-4">
            Show error details ({result.errors.length.toLocaleString()})
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-neutral-200 divide-y divide-neutral-100 text-xs">
            {result.errors.slice(0, 10).map((error, idx) => (
              <div key={idx} className="px-3 py-2 text-red-700">
                {error.error}
              </div>
            ))}
            {result.errors.length > 10 && (
              <div className="px-3 py-2 text-neutral-500">
                +{(result.errors.length - 10).toLocaleString()} more
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

