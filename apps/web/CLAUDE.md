# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Clash is a modern SaaS dashboard application built with Next.js 16, React 19, and TypeScript. It features a neo-brutalist design system with bold borders, thick shadows, and a distinctive color palette.

## Development Commands

### Running the Application

```bash
npm run dev          # Start development server on http://localhost:3000
npm run build        # Create production build
npm start            # Run production build
```

### Code Quality

```bash
npm run lint         # Run ESLint (uses new flat config format)
```

### Testing

No test framework is currently configured in this project.

## Architecture

### Project Structure

- **`app/`**: Next.js 16 App Router directory
  - **`app/page.tsx`**: Dashboard homepage with stats cards and activity feed
  - **`app/layout.tsx`**: Root layout with Sidebar and global metadata
  - **`app/components/`**: Shared components (currently just Sidebar)
  - **`app/projects/page.tsx`**: Projects listing page with project cards
  - **`app/globals.css`**: Global styles with Tailwind imports and CSS variables

### Design System

The application uses a **modern minimalist design** inspired by professional creative tools, with the following characteristics:

#### Color Palette (CSS Variables)

- `--background`: #ffffff (light mode) / #0a0a0a (dark mode)
- `--foreground`: #171717 (light mode) / #ededed (dark mode)
- **Neutral colors**: slate-50, slate-200, gray-50, gray-100 for backgrounds and borders
- **Accent color**: Red系 (red-50, red-500, red-600) as brand color and interactive highlights
- **Text colors**: gray-600, gray-700, gray-900 for hierarchy
- **Supports dark mode**: Full dark mode support with smooth transitions

#### Design Patterns

**Borders and Shadows**

- Thin borders: `border-slate-200` (1px)
- Soft shadows: `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-2xl`
- No heavy or offset shadows

**Border Radius**

- Consistent rounded corners: `rounded-lg` (8px), `rounded-xl` (12px), `rounded-2xl` (16px)
- Applied to cards, buttons, and input fields

**Animations**

- Use **Framer Motion** for smooth animations
- Subtle hover effects: `whileHover={{ scale: 1.05 }}`, `whileHover={{ x: 2 }}`
- Spring animations: `type: "spring", stiffness: 300-500, damping: 30`
- Smooth expand/collapse with AnimatePresence

**Glass Morphism**

- Semi-transparent backgrounds: `bg-white/30`, `bg-white/40`
- Backdrop blur effects: `backdrop-blur-xl`, `backdrop-blur-2xl`
- Used for floating input areas and overlays

**Visual Hierarchy**

- Distinguish layers with background colors (not border thickness)
- Gradient masks for content transitions: `bg-gradient-to-t from-gray-50`
- Semi-transparent overlays: `bg-white/30`

#### Typography

- **Body font**: Inter (loaded from Google Fonts)
- **Heading font**: Space Grotesk (loaded from Google Fonts)
- **Mono font**: JetBrains Mono (loaded from Google Fonts)
- **Font weights**: `font-medium` (500), `font-bold` (700) - avoid extreme weights
- **Letter spacing**: `-0.02em` for headings (tight, not tracked-out)

### Navigation & Routing

Uses Next.js App Router with:

- **Fixed sidebar** at 320px width (w-80)
- **Main content area** with left margin of 320px (ml-80)
- **Client-side navigation** with `usePathname()` for active states

Current routes:

- `/` - Dashboard home
- `/projects` - Projects listing

### TypeScript Configuration

- **Module resolution**: bundler
- **JSX**: react-jsx (React 19 new JSX transform)
- **Path alias**: `@/*` maps to project root
- **Strict mode**: enabled

### Styling

- **Tailwind CSS v4**: Uses new `@tailwindcss/postcss` plugin
- **CSS-in-JS**: None - pure Tailwind utility classes
- **Responsive**: Mobile-first with md: and lg: breakpoints

## Key Development Notes

### Component Patterns

1. **Page components**: Server components by default (no 'use client')
2. **Interactive components**: Add 'use client' directive (e.g., Sidebar.tsx)
3. **Inline sub-components**: Functions defined in same file (e.g., StatCard, ActivityItem, ProjectCard)

### Styling Conventions

- Use Tailwind's semantic color classes: `text-gray-900`, `bg-slate-50`, `border-slate-200`
- Consistent spacing: `gap-3`, `gap-4`, `gap-6` for component spacing
- Standard font weights: `font-medium` (500), `font-bold` (700)
- Smooth transitions: `transition-all`, `transition-colors` for hover states
- Icons: Use Phosphor Icons with `weight="bold"` or `weight="duotone"`

### Layout Structure

The root layout (`app/layout.tsx`) provides:

- Fixed sidebar navigation (optional, width: 288px / w-72)
- Main content area with max-width constraint
- Global metadata (title, description)
- Global CSS imports
- Font loading (Inter, Space Grotesk, JetBrains Mono)

When adding new pages:

1. Create page.tsx in appropriate directory under `app/`
2. Use clean, centered layouts with max-width containers
3. Apply consistent spacing (`mb-8`, `mb-12` for sections, `gap-4`, `gap-6` for grids)
4. Use soft shadows and rounded corners for cards
5. Implement smooth Framer Motion animations for interactions

## ESLint Configuration

Uses new ESLint flat config format (`eslint.config.mjs`) with:

- `eslint-config-next/core-web-vitals`
- `eslint-config-next/typescript`
- Custom global ignores for build directories
