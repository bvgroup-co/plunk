import {Label, Select, SelectContent, SelectItemWithDescription, SelectTrigger, SelectValue, Input} from '@plunk/ui';
import {useState} from 'react';
import {toast} from 'sonner';

import {TemplateSearchPicker} from '../TemplateSearchPicker';

import {type EditStepDialogProps, getStepConfig, StepDialogShell, useStepUpdate} from './shared';

export function SendEmailStepDialog({step, workflowId, open, onOpenChange, onSuccess}: EditStepDialogProps) {
  const config = getStepConfig(step);
  const recipient = config.recipient as {type?: string; customEmail?: string} | undefined;

  const [name, setName] = useState(step.name);
  const [templateId, setTemplateId] = useState(step.template?.id ?? '');
  const [recipientType, setRecipientType] = useState<'CONTACT' | 'CUSTOM'>(
    recipient?.type === 'CUSTOM' ? 'CUSTOM' : 'CONTACT',
  );
  const [customEmail, setCustomEmail] = useState(recipient?.customEmail ?? '');

  const {update, isSubmitting} = useStepUpdate(workflowId, step.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!templateId) {
      toast.error('Please select a template');
      return;
    }

    if (recipientType === 'CUSTOM') {
      if (!customEmail.trim()) {
        toast.error('Please enter a custom email address');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
    }

    const ok = await update({
      name,
      templateId,
      config: {
        templateId,
        recipient: {
          type: recipientType,
          ...(recipientType === 'CUSTOM' && {customEmail: customEmail.trim()}),
        },
      },
    });

    if (ok) {
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <StepDialogShell
      step={step}
      open={open}
      onOpenChange={onOpenChange}
      name={name}
      onNameChange={setName}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="editTemplate">Email Template</Label>
          <TemplateSearchPicker value={templateId} initialName={step.template?.name} onChange={setTemplateId} />
        </div>

        <div>
          <Label htmlFor="editRecipientType">Send To</Label>
          <Select value={recipientType} onValueChange={value => setRecipientType(value as 'CONTACT' | 'CUSTOM')}>
            <SelectTrigger id="editRecipientType" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItemWithDescription
                value="CONTACT"
                title="Contact"
                description="Send to the contact that triggered the workflow"
              />
              <SelectItemWithDescription
                value="CUSTOM"
                title="Custom Email"
                description="Send to a specific email address"
              />
            </SelectContent>
          </Select>
        </div>

        {recipientType === 'CUSTOM' && (
          <div>
            <Label htmlFor="editCustomEmail">Email Address</Label>
            <Input
              id="editCustomEmail"
              type="email"
              value={customEmail}
              onChange={e => setCustomEmail(e.target.value)}
              required
              placeholder="e.g., admin@example.com"
              className="mt-1.5"
            />
          </div>
        )}
      </div>
    </StepDialogShell>
  );
}
