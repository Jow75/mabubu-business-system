import { APP_NAME, LOGO } from '../../shared/brand';

/**
 * The NAS Mabubu System mark: the owner's logo, untouched, beside the name.
 * "System" sits under "NAS Mabubu" so the full name fits a phone's top bar.
 */
export function Brand({ size = 34, href }: { size?: number; href?: string }) {
  const body = (
    <>
      <img className="brand-logo" src={LOGO.small} width={size} height={size} alt="" draggable={false} />
      <span className="brand-word" aria-label={APP_NAME}>
        <span aria-hidden="true">NAS Mabubu</span>
        <span className="brand-sys" aria-hidden="true">
          System
        </span>
      </span>
    </>
  );
  return href ? (
    <a className="brand" href={href}>
      {body}
    </a>
  ) : (
    <div className="brand">{body}</div>
  );
}
