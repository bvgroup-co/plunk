'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {Command as CommandPrimitive} from 'cmdk';
import {Search} from 'lucide-react';

import {cn} from '../../lib';

function Command({className, ref, ...props}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-neutral-950', className)}
      {...props}
    />
  );
}
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({children, ...props}: React.ComponentProps<typeof DialogPrimitive.Root>) => {
  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={e => e.preventDefault()}
          className={cn(
            'fixed inset-x-0 top-[14%] z-50 mx-auto w-[92vw] max-w-2xl outline-none',
            'overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl',
            'duration-150',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-3',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-3',
          )}
        >
          <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-neutral-400 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-14 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
            {children}
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

function CommandInput({className, ref, ...props}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center border-b border-neutral-200 px-4 focus-within:border-neutral-200" cmdk-input-wrapper="">
      <Search className="mr-3 h-5 w-5 shrink-0 text-neutral-400" />
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-14 w-full rounded-md bg-transparent text-sm outline-none! ring-0! shadow-none! border-transparent! placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}
CommandInput.displayName = CommandPrimitive.Input.displayName;

function CommandList({className, ref, ...props}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-[440px] overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  );
}
CommandList.displayName = CommandPrimitive.List.displayName;

function CommandEmpty({ref, ...props}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty ref={ref} className="py-6 text-center text-sm text-neutral-500" {...props} />;
}
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

function CommandGroup({className, ref, ...props}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        'overflow-hidden p-2 text-neutral-950 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-neutral-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider',
        className,
      )}
      {...props}
    />
  );
}
CommandGroup.displayName = CommandPrimitive.Group.displayName;

function CommandSeparator({className, ref, ...props}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator ref={ref} className={cn('-mx-1 h-px bg-neutral-200', className)} {...props} />
  );
}
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

function CommandItem({className, ref, ...props}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none text-neutral-900 aria-selected:bg-neutral-100 aria-selected:text-neutral-900 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 hover:bg-neutral-50',
        className,
      )}
      {...props}
    />
  );
}
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({className, ...props}: React.HTMLAttributes<HTMLSpanElement>) => {
  return <span className={cn('ml-auto text-xs tracking-widest text-neutral-500', className)} {...props} />;
};
CommandShortcut.displayName = 'CommandShortcut';

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
};
