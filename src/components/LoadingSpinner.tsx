/**
 * Center-screen loading spinner shown until artworks.json + map are ready.
 */

interface Props {
  hidden: boolean;
}

export function LoadingSpinner({ hidden }: Props) {
  return (
    <div className={`loading ${hidden ? 'hidden' : ''}`}>
      <div className="loader" />
      <div className="loading-text">loading 1,400+ artworks…</div>
    </div>
  );
}
