import {Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@plunk/ui';
import {useState} from 'react';
import {toast} from 'sonner';

import {type EditStepDialogProps, getStepConfig, StepDialogShell, useStepUpdate} from './shared';

type DelayUnit = 'minutes' | 'hours' | 'days';

const MAX_DELAY_BY_UNIT: Record<DelayUnit, number> = {
  minutes: 525600,
  hours:   8760,
  days:    365,
};

function isDelayUnit(value: unknown): value is DelayUnit {
  return value === 'minutes' || value === 'hours' || value === 'days';
}

export function DelayStepDialog({step, workflowId, open, onOpenChange, onSuccess}: EditStepDialogProps) {
  const config = getStepConfig(step);

  const [name, setName] = useState(step.name);
  const [delayAmount, setDelayAmount] = useState(String(config.amount ?? '24'));
  const [delayUnit, setDelayUnit] = useState<DelayUnit>(isDelayUnit(config.unit) ? config.unit : 'hours');

  const {update, isSubmitting} = useStepUpdate(workflowId, step.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseInt(delayAmount, 10);
    if (amount > MAX_DELAY_BY_UNIT[delayUnit]) {
      toast.error(`Delay cannot exceed 365 days (${MAX_DELAY_BY_UNIT[delayUnit]} ${delayUnit})`);
      return;
    }

    const ok = await update({
      name,
      config: {amount, unit: delayUnit},
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="editDelayAmount">Amount</Label>
          <Input
            id="editDelayAmount"
            type="number"
            value={delayAmount}
            onChange={e => setDelayAmount(e.target.value)}
            required
            min="1"
            max={MAX_DELAY_BY_UNIT[delayUnit]}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="editDelayUnit">Unit</Label>
          <Select value={delayUnit} onValueChange={value => setDelayUnit(value as DelayUnit)}>
            <SelectTrigger id="editDelayUnit" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </StepDialogShell>
  );
}
