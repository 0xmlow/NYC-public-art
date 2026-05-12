/**
 * Search input with embedded magnifier icon and a clear (×) button
 * that appears only when the field is non-empty.
 */

interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function SearchInput({ value, onChange }: Props) {
  return (
    <div className="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4-4" />
      </svg>
      <input
        type="text"
        id="search"
        placeholder="Search by title, artist, borough…"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className={`clear-search ${value ? 'visible' : ''}`}
        title="Clear"
        onClick={() => onChange('')}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
