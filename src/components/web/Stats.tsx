import { TrendingUp, Users, Flame, Star } from "lucide-react";

export function Stats() {
  return (
    <section className="py-20 bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-600 text-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Join the Community
          </h2>
          <p className="text-purple-100 max-w-2xl mx-auto">
            Become part of a thriving community of card collectors and strategists from around the world.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-5xl mx-auto">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8" />
            </div>
            <div className="text-4xl font-bold mb-2">250K+</div>
            <div className="text-purple-100 text-sm">Active Players</div>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8" />
            </div>
            <div className="text-4xl font-bold mb-2">1M+</div>
            <div className="text-purple-100 text-sm">Battles Played</div>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
              <Flame className="w-8 h-8" />
            </div>
            <div className="text-4xl font-bold mb-2">500+</div>
            <div className="text-purple-100 text-sm">Unique Cards</div>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
              <Star className="w-8 h-8" />
            </div>
            <div className="text-4xl font-bold mb-2">4.9/5</div>
            <div className="text-purple-100 text-sm">User Rating</div>
          </div>
        </div>
      </div>
    </section>
  );
}
