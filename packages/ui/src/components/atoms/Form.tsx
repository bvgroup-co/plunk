import type * as LabelPrimitive from '@radix-ui/react-label';
import {Slot} from '@radix-ui/react-slot';
import * as React from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
} from 'react-hook-form';

import {cn} from '../../lib';

import {Label} from './Label';

const Form = FormProvider;

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{name: props.name}}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.use(FormFieldContext);
  const itemContext = React.use(FormItemContext);
  const {getFieldState, formState} = useFormContext();

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const fieldState = getFieldState(fieldContext.name, formState);

  const {id} = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

interface FormItemContextValue {
  id: string;
}

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

function FormItem({className, ref, ...props}: React.ComponentProps<'div'>) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{id}}>
      <div ref={ref} className={cn('space-y-2', className)} {...props} />
    </FormItemContext.Provider>
  );
}
FormItem.displayName = 'FormItem';

function FormLabel({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const {formItemId} = useFormField();

  return <Label ref={ref} className={cn(className)} htmlFor={formItemId} {...props} />;
}
FormLabel.displayName = 'FormLabel';

function FormControl({ref, ...props}: React.ComponentProps<typeof Slot>) {
  const {formItemId, formDescriptionId, formMessageId} = useFormField();

  return (
    <Slot ref={ref} id={formItemId} aria-describedby={formDescriptionId} aria-invalid={!!formMessageId} {...props} />
  );
}
FormControl.displayName = 'FormControl';

function FormDescription({className, ref, ...props}: React.ComponentProps<'p'>) {
  const {formDescriptionId} = useFormField();

  return (
    <p ref={ref} id={formDescriptionId} className={cn('text-[0.8rem] text-neutral-500', className)} {...props} />
  );
}
FormDescription.displayName = 'FormDescription';

function FormMessage({className, children, ref, ...props}: React.ComponentProps<'p'>) {
  const {error, formMessageId} = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p ref={ref} id={formMessageId} className={cn('text-[0.8rem] font-medium text-red-600', className)} {...props}>
      {body}
    </p>
  );
}
FormMessage.displayName = 'FormMessage';

export {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField};
