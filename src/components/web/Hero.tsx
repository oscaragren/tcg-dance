import { Button } from "../shared/ui/button";
import { Sparkles, Trophy, Zap } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-gray-50 to-white py-20 md:py-32">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 text-purple-700 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>Under uppbyggnad</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-gray-900 via-purple-800 to-blue-900 bg-clip-text text-transparent">
            Samla och hitta dina favoriter.
          </h1>
          
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Få gratis kort varje dag och samla på dina favoritdansare. Registerar dig idag och få 25 kort gratis!
          </p>
          
          <div className="flex justify-center mb-16">
            <Button size="lg" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-8">
              Börja samla!
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-2">
                <Sparkles className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">200+</div>
              <div className="text-sm text-gray-600">Unika kort</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                <Trophy className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">100+</div>
              <div className="text-sm text-gray-600">Dansare</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-2">
                <Zap className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">5</div>
              <div className="text-sm text-gray-600">Ultra rare</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
    </section>
  );
}
