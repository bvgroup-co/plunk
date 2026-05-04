import {useState} from 'react';
import {toast} from 'sonner';

import {KeyValueEditor} from '../KeyValueEditor';

import {type EditStepDialogProps, getStepConfig, StepDialogShell, useStepUpdate} from './shared';

export function UpdateContactStepDialog({step, workflowId, open, onOpenChange, onSuccess}: EditStepDialogProps) {
  const config = getStepConfig(step);
  const initialUpdates =
    config.updates && typeof config.updates === 'object'
      ? (config.updates as Record<string, string | number | boolean>)
      : null;

  const [name, setName] = useState(step.name);
  const [contactUpdateData, setContactUpdateData] = useState<Record<string, string | number | boolean> | null>(
    initialUpdates,
  );

  const {update, isSubmitting} = useStepUpdate(workflowId, step.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contactUpdateData || Object.keys(contactUpdateData).length === 0) {
      toast.error('At least one field to update is required');
      return;
    }

    const ok = await update({
      name,
      config: {updates: contactUpdateData},
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
      <KeyValueEditor key={`edit-${step.id}`} initialData={contactUpdateData} onChange={setContactUpdateData} />
    </StepDialogShell>
  );
}
