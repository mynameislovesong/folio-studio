import {useEffect, useRef} from 'react';
import type {ReactNode} from 'react';
import {X} from 'lucide-react';

export type DialogNotice = {message: string; error?: boolean};

export function Modal({title, subtitle, children, close, notice, wide = false}: {title: string; subtitle?: string; children: ReactNode; close: () => void; notice?: DialogNotice; wide?: boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {if (dialog?.open) dialog.close();};
  }, []);
  return <dialog className={wide ? 'modal wide' : 'modal'} ref={ref} aria-label={title} onCancel={event => {event.preventDefault(); close();}}>
    <header className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="닫기" title="닫기" onClick={close}><X /></button></header>
    {children}
    {notice && <p role={notice.error ? 'alert' : 'status'} className={'modal-notice' + (notice.error ? ' error-box' : '')}>{notice.message}</p>}
  </dialog>;
}


