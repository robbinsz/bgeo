import { useEffect, useEffectEvent, type RefObject } from 'react';
const dialogs: HTMLElement[] = [];
const selector =
  'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]';
export function useDialogFocus(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  busy = false,
) {
  const close = useEffectEvent(() => {
    if (!busy) onClose();
  });
  useEffect(() => {
    const dialog = root.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogs.push(dialog);
    const first = dialog.querySelector<HTMLElement>(selector);
    (first ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll<HTMLElement>(selector)].filter(
        (el) => !el.closest('[hidden],[aria-hidden="true"]'),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      dialogs.splice(dialogs.indexOf(dialog), 1);
      if (previous?.isConnected) previous.focus();
    };
  }, [root, open]);
}
