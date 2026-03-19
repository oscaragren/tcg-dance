interface CardPlaceholderProps {
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  size?: 'small' | 'medium' | 'large';
  name?: string;
}

export function CardPlaceholder({ rarity = 'common', size = 'medium', name = 'Your Card Design' }: CardPlaceholderProps) {
  const rarityColors = {
    common: 'from-gray-400 to-gray-600',
    rare: 'from-blue-400 to-blue-600',
    epic: 'from-purple-400 to-purple-600',
    legendary: 'from-amber-400 to-amber-600',
  };

  const sizes = {
    small: 'w-32 h-44',
    medium: 'w-48 h-64',
    large: 'w-64 h-80',
  };

  const rarityGlow = {
    common: '',
    rare: 'shadow-blue-500/50',
    epic: 'shadow-purple-500/50',
    legendary: 'shadow-amber-500/50',
  };

  return (
    <div
      className={`${sizes[size]} rounded-xl bg-gradient-to-br ${rarityColors[rarity]} p-0.5 shadow-lg ${rarityGlow[rarity]} hover:scale-105 transition-transform cursor-pointer`}
    >
      <div className="w-full h-full bg-gray-900 rounded-lg flex flex-col items-center justify-center gap-4 p-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
          <span className="text-3xl">⚡</span>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-white/60 mb-1">
            {rarity}
          </div>
          <div className="text-sm text-white/80">{name}</div>
        </div>
      </div>
    </div>
  );
}
