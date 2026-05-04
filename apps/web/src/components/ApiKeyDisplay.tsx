import {AnimatePresence, motion} from 'framer-motion';
import {Check, Copy, Eye, EyeOff, RefreshCw} from 'lucide-react';
import {useState} from 'react';
import {Button} from '@plunk/ui';

interface ApiKeyDisplayProps {
  label: string;
  value: string;
  description?: string;
  isSecret?: boolean;
  onRegenerate?: () => Promise<void>;
}

export function ApiKeyDisplay({
  label,
  value,
  description,
  isSecret = false,
  onRegenerate,
}: ApiKeyDisplayProps) {
  const [showKey, setShowKey] = useState(!isSecret);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — silent
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;

    try {
      setIsRegenerating(true);
      await onRegenerate();
    } catch {
      // error surfaced via isRegenerating state reset
    } finally {
      setIsRegenerating(false);
    }
  };

  const displayValue = showKey ? value : '•'.repeat(48);

  return (
    <div>
      <label className="text-sm font-medium text-neutral-700 block mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 bg-neutral-50 rounded-lg text-xs font-mono text-neutral-900 border border-neutral-200 truncate">
          {displayValue}
        </code>
        <div className="flex items-center gap-1">
          {isSecret && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? 'Hide key' : 'Show key'}
              className="h-9 w-9"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCopy}
            title="Copy to clipboard"
            className="h-9 w-9 overflow-hidden"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{opacity: 0, y: 6}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: -6}}
                  transition={{duration: 0.15}}
                >
                  <Check className="h-4 w-4 text-green-600" />
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{opacity: 0, y: 6}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, y: -6}}
                  transition={{duration: 0.15}}
                >
                  <Copy className="h-4 w-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
          {onRegenerate && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              title="Regenerate key"
              className="h-9 w-9"
            >
              <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>
      {description && <p className="text-xs text-neutral-500 mt-1">{description}</p>}
    </div>
  );
}
