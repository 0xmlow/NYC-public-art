/**
 * Full-screen landing card. Provides the title, project description,
 * and two calls-to-action ("Enter the gallery" plays a cinematic
 * flyTo, "Surprise me" jumps to a random artwork).
 */

interface IntroProps {
  hidden: boolean;
  total: number;
  onEnter: () => void;
  onSurprise: () => void;
}

export function Intro({ hidden, total, onEnter, onSurprise }: IntroProps) {
  return (
    <section className={`intro ${hidden ? 'hidden' : ''}`}>
      <div className="intro-inner">
        <div className="eyebrow">A Narrative Cartography</div>
        <h1>PAINTED<br />CITY</h1>
        <p className="lede">
          A field guide to <strong>{total.toLocaleString()}</strong> current and historical
          public artworks across New York's five boroughs — from Keith Haring's 1986
          handball court in Harlem to the 19th-century bronzes scattered through Central
          Park to the rotating murals of Bushwick, Welling Court, and the Bowery.
        </p>
        <p className="cta">→ Search. Filter. Cluster. Discover. The city is the exhibition.</p>
        <div className="intro-buttons">
          <button className="enter primary" onClick={onEnter}>
            Enter the gallery
          </button>
          <button className="enter ghost" onClick={onSurprise}>
            Surprise me →
          </button>
        </div>
        <div className="credit-line">
          Data: NYC Parks Monuments · NYC DOT Art · Curated editorial
          <br />
          Built with Mapbox GL JS · MLow · 2026
        </div>
      </div>
    </section>
  );
}
