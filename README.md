# TCG Dance

Trading Card Game for bugg and other swing dances.

## Project Structure

This repository contains both the web front page and the card game components, organized in a unified structure:

```
src/
├── apps/                    # Application entry points
│   ├── card/               # Card game application
│   │   └── App.tsx
│   └── web/                # Web front page application
│       └── App.tsx
├── components/             # React components
│   ├── shared/             # Shared components used across apps
│   │   ├── ui/             # UI component library (shadcn/ui)
│   │   └── figma/          # Figma-generated shared components
│   ├── game/               # Game-specific components
│   │   └── TradingCard.tsx
│   └── web/                # Web page components
│       ├── Header.tsx
│       ├── Hero.tsx
│       ├── FeaturedCards.tsx
│       ├── Features.tsx
│       ├── CollectionShowcase.tsx
│       ├── Stats.tsx
│       ├── CTA.tsx
│       ├── Footer.tsx
│       └── CardPlaceholder.tsx
├── styles/                 # Global styles
│   ├── index.css
│   ├── tailwind.css
│   └── theme.css
└── utils/                  # Shared utilities
```

## Features

- **Web Front Page**: Marketing/landing page with hero section, features, collection showcase, and CTA
- **Card Game**: Trading card component with bronze/silver/gold rarities
- **Shared UI Library**: Complete shadcn/ui component library for consistent design
- **Shared Components**: Reusable components like ImageWithFallback

## Development

The project is structured to allow easy development of both the web front page and the card game, with shared components and utilities to avoid duplication.


Ny info här...