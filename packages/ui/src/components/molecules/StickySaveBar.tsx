import {motion, AnimatePresence} from 'framer-motion';
import * as React from 'react';
import {Save, X} from 'lucide-react';

import {Button} from '../atoms/Button';
import {cn} from '../../lib';

export interface StickySaveBarProps {
  status: 'idle' | 'dirty' | 'saving';
  onSave: (e: React.FormEvent) => void | Promise<void>;
  className?: string;
}

export function StickySaveBar({status, onSave, className}: StickySaveBarProps) {
  const [dismissedForStatus, setDismissedForStatus] = React.useState<string | null>(null);

  const isVisible = status !== 'idle' && dismissedForStatus !== status;
  const isSaving = status === 'saving';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{opacity: 0, y: 20, scale: 0.95}}
          animate={{opacity: 1, y: 0, scale: 1}}
          exit={{opacity: 0, y: 20, scale: 0.95}}
          transition={{type: 'spring', stiffness: 300, damping: 25}}
          className={cn(
            'fixed bottom-6 right-6 z-50 w-72 rounded-md border border-neutral-200 bg-white shadow-lg',
            className,
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-sm font-medium text-neutral-900">Unsaved changes</span>
            </div>
            <button
              type="button"
              onClick={() => setDismissedForStatus(status)}
              className="text-neutral-400 hover:text-neutral-600 transition-colors -mr-1"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="border-t border-neutral-100 px-4 py-3">
            <Button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              size="sm"
              className="w-full"
            >
              {isSaving ? (
                <>
                  <motion.div
                    animate={{rotate: 360}}
                    transition={{duration: 1, repeat: Infinity, ease: 'linear'}}
                  >
                    <Save className="h-3 w-3" />
                  </motion.div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3 w-3" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
