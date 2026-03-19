import { TradingCard } from "../../components/game/TradingCard";

export default function App() {
  const sampleCards = [
    {
      type: "bronze" as const,
      name: "MARTINEZ",
      club: "FC Barcelona",
      season: "2025-26",
      score: 75,
      imageUrl:
        "https://images.unsplash.com/photo-1517466787929-bc90951d0974?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2NjZXIlMjBwbGF5ZXJ8ZW58MXx8fHwxNzY3NTYzOTg1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      attributes: {
        att1: 72,
        att2: 68,
        att3: 80,
        att4: 75,
      },
    },
    {
      type: "silver" as const,
      name: "SILVA",
      club: "Manchester City",
      season: "2025-26",
      score: 85,
      imageUrl:
        "https://images.unsplash.com/photo-1517466787929-bc90951d0974?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2NjZXIlMjBwbGF5ZXJ8ZW58MXx8fHwxNzY3NTYzOTg1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      attributes: {
        att1: 84,
        att2: 86,
        att3: 82,
        att4: 88,
      },
    },
    {
      type: "gold" as const,
      name: "RONALDO",
      club: "Real Madrid",
      season: "2025-26",
      score: 95,
      imageUrl:
        "https://images.unsplash.com/photo-1517466787929-bc90951d0974?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2NjZXIlMjBwbGF5ZXJ8ZW58MXx8fHwxNzY3NTYzOTg1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
      attributes: {
        att1: 94,
        att2: 92,
        att3: 96,
        att4: 95,
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl text-white text-center mb-12">
          Trading Card Game
        </h1>
        <div className="flex flex-wrap justify-center gap-8">
          {sampleCards.map((card, index) => (
            <TradingCard key={index} {...card} />
          ))}
        </div>
      </div>
    </div>
  );
}
