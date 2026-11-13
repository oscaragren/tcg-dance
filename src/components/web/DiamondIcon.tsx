import diamondCyan from "../../assets/diamond-cyan.png";

/** The Diamonds icon: the Diamond image recoloured cyan on a transparent background. Replaces the 💎 / ◆ glyphs everywhere in the player UI. */
export function DiamondIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={diamondCyan}
      alt=""
     
      width={size}
      height={Math.round(size * 0.77)}
      className={`inline-block shrink-0 align-[-0.12em] ${className}`}
    />
  );
}
