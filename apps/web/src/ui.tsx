/** Small UI kit: icons, buttons, page header, menus, tabs, empty states. Styles: styles.css. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// --- Icons (24×24, stroke) ------------------------------------------------------------------------
const paths = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
  back: 'M15 18l-6-6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  chevron: 'M9 18l6-6-6-6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  play: 'M7 4v16l13-8z',
  games: 'M4 4h16v16H4zM4 12h16M12 4v16',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  close: 'M18 6 6 18M6 6l12 12',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  engine: 'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM10 10h4v4h-4zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={name === 'more' ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

// --- Buttons ---------------------------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface ButtonProps {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: IconName;
  /** Internal link (react-router). */
  to?: string;
  /** External / full-page link. */
  href?: string;
  title?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}

export function Button({ variant = 'secondary', size = 'md', block, icon, to, href, title, disabled, type = 'button', onClick, children, className = '' }: ButtonProps) {
  const cls = ['btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', !children && 'btn-icon', className]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
    </>
  );
  if (to) return <Link className={cls} to={to} title={title} aria-disabled={disabled || undefined}>{content}</Link>;
  if (href) return <a className={cls} href={href} title={title} aria-disabled={disabled || undefined}>{content}</a>;
  return (
    <button className={cls} type={type} title={title} aria-label={!children ? title : undefined} disabled={disabled} onClick={onClick}>
      {content}
    </button>
  );
}

// --- Menu (⋯) ------------------------------------------------------------------------------------
export interface MenuItem {
  label: string;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
}

/** A button opening a list of actions. `trigger`: custom button content (default ⋯). */
export function Menu({ items, label, trigger, title = 'Plus d’actions' }: { items: MenuItem[]; label?: ReactNode; trigger?: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      {trigger ? (
        <button className="avatar" title={title} aria-label={title} aria-expanded={open} onClick={() => setOpen(!open)}>{trigger}</button>
      ) : (
        <button className="btn btn-ghost btn-icon" title={title} aria-label={title} aria-expanded={open} onClick={(e) => (e.preventDefault(), setOpen(!open))}>
          <Icon name="more" />
        </button>
      )}
      {open && (
        <div className="menu-list" role="menu">
          {label && <div className="menu-label">{label}</div>}
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={item.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                if (item.to) navigate(item.to);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Page header -----------------------------------------------------------------------------------
export function PageHeader({ title, subtitle, back, actions, menu }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode; menu?: MenuItem[] }) {
  return (
    <header className="page-header">
      {back && <Button variant="ghost" icon="back" to={back} title="Retour" className="back" />}
      <div className="titles">
        <h2>{title}</h2>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      {(actions || menu) && (
        <div className="actions">
          {actions}
          {menu && menu.length > 0 && <Menu items={menu} />}
        </div>
      )}
    </header>
  );
}

// --- Tabs / segmented control ----------------------------------------------------------------------
export function Tabs<T extends string>({ tabs, value, onChange, block }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; block?: boolean }) {
  return (
    <div className={`tabs ${block ? 'block' : ''}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} className={t.id === value ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// --- Empty state -----------------------------------------------------------------------------------
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

/** French plural: "1 partie", "3 parties". */
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
