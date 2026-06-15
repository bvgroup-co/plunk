import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@plunk/ui';
import {NextSeo} from 'next-seo';
import {DashboardLayout} from '../../components/DashboardLayout';
import {EmailSettings} from '../../components/EmailSettings';
import {EmailEditor} from '../../components/EmailEditor';
import {network} from '../../lib/network';
import {EmailFormValidator} from '../../lib/validation';
import {ArrowLeft, TriangleAlert} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {useState} from 'react';
import {toast} from 'sonner';
import {TemplateSchemas, detectUnsubscribeSignal} from '@plunk/shared';
import {useActiveProject} from '../../lib/contexts/ActiveProjectProvider';

export default function CreateTemplatePage() {
  const router = useRouter();
  const {activeProject} = useActiveProject();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [from, setFrom] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [type, setType] = useState<'MARKETING' | 'TRANSACTIONAL' | 'HEADLESS'>('MARKETING');
  const [mode, setMode] = useState<'HTML' | 'PLAIN_TEXT'>('HTML');
  const [cssMode, setCssMode] = useState<'GLOBAL' | 'CUSTOM'>('GLOBAL');
  const [customCss, setCustomCss] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = EmailFormValidator.validateTemplate({name, subject, body, from});
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);

    try {
      const template = await network.fetch<{id: string}, typeof TemplateSchemas.create>('POST', '/templates', {
        name,
        description: description || undefined,
        subject,
        body,
        from,
        fromName: fromName || null,
        replyTo: replyTo || null,
        type,
        mode,
        cssMode,
        customCss: customCss || null,
      });

      toast.success('Template created successfully');
      void router.push(`/templates/${template.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create template');
      setSaving(false);
    }
  };

  return (
    <>
      <NextSeo title="Create Template" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link href="/templates"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">Create Template</h1>
              <p className="text-neutral-500 mt-1 text-sm sm:text-base">
                Create a reusable email template for campaigns and workflows
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Template Mode</CardTitle>
                  <CardDescription>Choose HTML styling or native plain text delivery</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {([
                      {value: 'HTML', label: 'HTML', description: 'Use the existing Plunk HTML wrapper and CSS'},
                      {value: 'PLAIN_TEXT', label: 'Plain text', description: 'Send as text/plain without HTML or CSS'},
                    ] as const).map(({value, label, description}) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        className={`flex items-center justify-between w-full min-h-[44px] px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                          mode === value ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span className="font-medium text-sm text-neutral-900 shrink-0">{label}</span>
                        <span className="text-xs text-neutral-500 ml-4 text-right">{description}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Email CSS</CardTitle>
                  <CardDescription>Use project CSS or override CSS for this template</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2">
                    {([
                      {value: 'GLOBAL', label: 'Project CSS', description: 'Inherit global email CSS'},
                      {value: 'CUSTOM', label: 'Custom CSS', description: 'Use CSS saved on this template'},
                    ] as const).map(({value, label, description}) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCssMode(value)}
                        disabled={mode === 'PLAIN_TEXT'}
                        className={`flex items-center justify-between w-full min-h-[44px] px-4 py-3 rounded-lg border-2 text-left transition-colors disabled:opacity-50 ${
                          cssMode === value ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span className="font-medium text-sm text-neutral-900 shrink-0">{label}</span>
                        <span className="text-xs text-neutral-500 ml-4 text-right">{description}</span>
                      </button>
                    ))}
                  </div>
                  {cssMode === 'CUSTOM' && mode !== 'PLAIN_TEXT' && (
                    <div className="space-y-2">
                      <Label htmlFor="customCss">Custom CSS</Label>
                      <Textarea
                        id="customCss"
                        value={customCss}
                        onChange={e => setCustomCss(e.target.value)}
                        className="min-h-48 font-mono text-xs"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Row 1: Basic Info + Template Type */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Name and describe your template</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Template Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      placeholder="Welcome Email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Sent to new subscribers"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Template Type</CardTitle>
                  <CardDescription>Choose how this template should be treated</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {([
                      {value: 'MARKETING', label: 'Marketing', description: 'Subscribed contacts, includes unsubscribe link'},
                      {value: 'TRANSACTIONAL', label: 'Transactional', description: 'All contacts, no subscription check or footer'},
                      {value: 'HEADLESS', label: 'Headless', description: 'Subscribed contacts, no Plunk footer'},
                    ] as const).map(({value, label, description}) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setType(value)}
                        className={`flex items-center justify-between w-full min-h-[44px] px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                          type === value
                            ? 'border-neutral-900 bg-neutral-50'
                            : 'border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span className="font-medium text-sm text-neutral-900 shrink-0">{label}</span>
                        <span className="text-xs text-neutral-500 ml-4 text-right">{description}</span>
                      </button>
                    ))}
                  </div>
                  {type === 'HEADLESS' && !detectUnsubscribeSignal(body) && (
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
                </CardContent>
              </Card>
            </div>

            {/* Email Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Email Settings</CardTitle>
                <CardDescription>Configure sender information and subject</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line <span className="text-red-500">*</span></Label>
                  <Input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    required
                    placeholder="Welcome to our platform!"
                  />
                  <p className="text-xs text-neutral-500">Use {'{{variableName}}'} for dynamic content</p>
                </div>

                <EmailSettings
                  from={from}
                  fromName={fromName}
                  replyTo={replyTo}
                  onFromChange={setFrom}
                  onFromNameChange={setFromName}
                  onReplyToChange={setReplyTo}
                  fromNamePlaceholder={activeProject?.name || 'Your Company'}
                />
              </CardContent>
            </Card>

            {/* Email Body */}
            <Card className="overflow-visible">
              <CardHeader>
                <CardTitle>Email Body</CardTitle>
                <CardDescription>Create your email using the visual editor or paste custom HTML</CardDescription>
              </CardHeader>
              <CardContent>
                <EmailEditor
                  value={body}
                  onChange={setBody}
                  templateMode={mode}
                  emailCss={cssMode === 'CUSTOM' ? customCss : activeProject?.globalEmailCss}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button asChild variant="outline">
                <Link href="/templates">Cancel</Link>
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Template'}
              </Button>
            </div>
          </form>
        </div>
      </DashboardLayout>
    </>
  );
}
