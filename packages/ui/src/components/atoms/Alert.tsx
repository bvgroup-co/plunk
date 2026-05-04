import * as React from 'react';
import {cva, type VariantProps} from 'class-variance-authority';
import {cn} from '../../lib';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-neutral-950',
  {
    variants: {
      variant: {
        default: 'bg-white text-neutral-950',
        destructive: 'border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-600',
        warning: 'border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600',
        success: 'border-green-200 bg-green-50 text-green-900 [&>svg]:text-green-600',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ref,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div ref={ref} role="alert" className={cn(alertVariants({variant}), className)} {...props} />;
}
Alert.displayName = 'Alert';

function AlertTitle({className, ref, ...props}: React.ComponentProps<'h5'>) {
  return <h5 ref={ref} className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />;
}
AlertTitle.displayName = 'AlertTitle';

function AlertDescription({className, ref, ...props}: React.ComponentProps<'div'>) {
  return <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />;
}
AlertDescription.displayName = 'AlertDescription';

export {Alert, AlertTitle, AlertDescription};
