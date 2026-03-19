import { ImageWithFallback } from "../shared/figma/ImageWithFallback";

export type CardType = "bronze" | "silver" | "gold";

export interface TradingCardProps {
  type: CardType;
  name: string;
  club: string;
  season: string;
  score: number;
  imageUrl: string;
  attributes: {
    att1: number;
    att2: number;
    att3: number;
    att4: number;
  };
}

const cardStyles = {
  bronze: {
    gradient: "from-[#b87333] via-[#cd7f32] to-[#8b5a2b]",
    border: "border-[#cd7f32]",
    textColor: "text-[#3d2817]",
    bgOverlay: "bg-[#cd7f32]/20",
  },
  silver: {
    gradient: "from-[#c0c0c0] via-[#e8e8e8] to-[#a8a8a8]",
    border: "border-[#c0c0c0]",
    textColor: "text-[#2d3748]",
    bgOverlay: "bg-[#c0c0c0]/20",
  },
  gold: {
    gradient: "from-[#ffd700] via-[#ffed4e] to-[#d4af37]",
    border: "border-[#ffd700]",
    textColor: "text-[#5a3e1b]",
    bgOverlay: "bg-[#ffd700]/20",
  },
};

export function TradingCard({
  type,
  name,
  club,
  season,
  score,
  imageUrl,
  attributes,
}: TradingCardProps) {
  const style = cardStyles[type];

  return (
    <div className="w-[280px] h-[400px] relative select-none">
      {/* Card Container with FIFA-style shape */}
      <div className={`w-full h-full relative`}>
        {/* Main Card Background with Shield Shape */}
        <svg
          viewBox="0 0 280 400"
          className="absolute inset-0 w-full h-full drop-shadow-2xl"
          style={{ filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.5))" }}
        >
          <defs>
            <linearGradient id={`gradient-${type}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" className={type === "bronze" ? "text-[#b87333]" : type === "silver" ? "text-[#c0c0c0]" : "text-[#ffd700]"} stopColor="currentColor" />
              <stop offset="50%" className={type === "bronze" ? "text-[#cd7f32]" : type === "silver" ? "text-[#e8e8e8]" : "text-[#ffed4e]"} stopColor="currentColor" />
              <stop offset="100%" className={type === "bronze" ? "text-[#8b5a2b]" : type === "silver" ? "text-[#a8a8a8]" : "text-[#d4af37]"} stopColor="currentColor" />
            </linearGradient>
          </defs>
          {/* FIFA-style card shape */}
          <path
            d="M 20 0 L 260 0 L 280 20 L 280 380 L 260 400 L 20 400 L 0 380 L 0 20 Z"
            fill={`url(#gradient-${type})`}
            stroke="rgba(0,0,0,0.3)"
            strokeWidth="2"
          />
        </svg>

        {/* Content Container */}
        <div className="absolute inset-0 p-4 flex flex-col">
          {/* Top Section - Rating and Info */}
          <div className="flex justify-between items-start mb-2">
            {/* Left Side - Rating */}
            <div className={`${style.textColor} flex flex-col items-center`}>
              <div className="text-5xl font-bold leading-none">{score}</div>
              <div className="text-xs uppercase tracking-wide mt-0.5">OVR</div>
            </div>

            {/* Right Side - Season */}
            <div className={`${style.textColor} text-right`}>
              <div className="text-xs uppercase tracking-wider opacity-80">
                {season}
              </div>
            </div>
          </div>

          {/* Player Image Section */}
          <div className="flex-1 relative flex items-center justify-center mb-2">
            <div className="w-48 h-48 relative">
              <ImageWithFallback
                src={imageUrl}
                alt={name}
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>

          {/* Player Name */}
          <div className={`${style.textColor} text-center mb-2`}>
            <div className="text-xl font-bold uppercase tracking-wide truncate">
              {name}
            </div>
          </div>

          {/* Club Name */}
          <div className={`${style.textColor} text-center text-sm opacity-80 mb-3 truncate`}>
            {club}
          </div>

          {/* Stats Grid */}
          <div className={`${style.bgOverlay} rounded-lg p-2 backdrop-blur-sm`}>
            <div className="grid grid-cols-4 gap-1">
              <StatItem label="AT1" value={attributes.att1} textColor={style.textColor} />
              <StatItem label="AT2" value={attributes.att2} textColor={style.textColor} />
              <StatItem label="AT3" value={attributes.att3} textColor={style.textColor} />
              <StatItem label="AT4" value={attributes.att4} textColor={style.textColor} />
            </div>
          </div>
        </div>

        {/* Shine Effect Overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ clipPath: "path('M 20 0 L 260 0 L 280 20 L 280 380 L 260 400 L 20 400 L 0 380 L 0 20 Z')" }}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent opacity-40"></div>
        </div>
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  textColor,
}: {
  label: string;
  value: number;
  textColor: string;
}) {
  return (
    <div className={`${textColor} text-center`}>
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="text-[10px] uppercase opacity-70 mt-0.5">{label}</div>
    </div>
  );
}