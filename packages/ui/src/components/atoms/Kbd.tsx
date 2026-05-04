import * as React from 'react';
import {cn} from '../../lib';

export function Kbd({className, ref, ...props}: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      ref={ref}
      className={cn(
        'inline-flex h-5 items-center justify-center rounded border border-neutral-300 bg-neutral-100 px-1.5 font-mono text-[10px] font-medium text-neutral-600',
        className,
      )}
      {...props}
    />
  );
}
Kbd.displayName = 'Kbd';
