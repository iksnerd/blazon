import { toast } from '@/components/ui/toast';

export function copy(text: string, label = `Copied ${text}`): void {
  navigator.clipboard.writeText(text).then(
    () => toast.add({ title: label }),
    () => toast.add({ title: 'Copy failed', type: 'error' }),
  );
}

export function notify(title: string): void {
  toast.add({ title });
}
