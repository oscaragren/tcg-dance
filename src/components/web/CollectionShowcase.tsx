import { CardPlaceholder } from "./CardPlaceholder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../shared/ui/tabs";

export function CollectionShowcase() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Bygg din kortsamling
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Samla kort av olika sällsynheter. Kanske hittar du din favoritdansare? Nedan visas några utvalda kort. Gå till Galleriet för att se alla kort.
            </p>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-4 mb-8">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="legendary">Legendary</TabsTrigger>
              <TabsTrigger value="epic">Epic</TabsTrigger>
              <TabsTrigger value="rare">Rare</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="common" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="common" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
              </div>
            </TabsContent>

            <TabsContent value="legendary" className="mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
                <CardPlaceholder rarity="legendary" size="small" showCaption={false} />
              </div>
            </TabsContent>

            <TabsContent value="epic" className="mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
                <CardPlaceholder rarity="epic" size="small" showCaption={false} />
              </div>
            </TabsContent>

            <TabsContent value="rare" className="mt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
                <CardPlaceholder rarity="rare" size="small" showCaption={false} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
