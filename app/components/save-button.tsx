import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonVariantProps = React.ComponentProps<typeof Button>;

interface SaveButtonProps
  extends Pick<ButtonVariantProps, 'variant' | 'size' | 'disabled' | 'className'> {
  /** 执行保存；成功正常返回，失败请 throw Error（message 会内联显示在按钮旁） */
  onSave: () => Promise<void>;
  /** 保存成功后的文案，默认「已保存」 */
  savedText?: string;
  /** 成功/错误反馈的展示时长（毫秒） */
  feedbackMs?: number;
}

/**
 * 带保存反馈的按钮（对齐概览页复制按钮的交互）：
 * idle「保存」→ saving「保存中...」→ saved「已保存」（2s 后复原）；
 * 失败时在按钮旁内联显示错误信息（3s 后复原），不使用 js alert。
 */
export function SaveButton({
  onSave,
  disabled,
  className,
  variant = 'default',
  size = 'default',
  savedText = '已保存',
  feedbackMs = 2000,
}: SaveButtonProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function handleClick() {
    if (status === 'saving') return;
    if (timer.current) clearTimeout(timer.current);
    setStatus('saving');
    try {
      await onSave();
      setStatus('saved');
      timer.current = setTimeout(() => setStatus('idle'), feedbackMs);
    } catch (err: any) {
      setErrorMsg(err?.message || '保存失败');
      setStatus('error');
      timer.current = setTimeout(() => setStatus('idle'), Math.max(feedbackMs, 3000));
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {status === 'error' && (
        <span className="text-xs text-destructive max-w-60 text-right leading-4">
          {errorMsg}
        </span>
      )}
      <Button
        variant={variant}
        size={size}
        disabled={disabled || status === 'saving'}
        onClick={handleClick}
      >
        {status === 'saving' ? (
          '保存中...'
        ) : status === 'saved' ? (
          <>
            <Check className="size-4" />
            {savedText}
          </>
        ) : (
          '保存'
        )}
      </Button>
    </span>
  );
}
