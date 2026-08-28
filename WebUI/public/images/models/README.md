# Hardware Model Images

This directory contains images used to illustrate synthesizer hardware throughout the application.

## Directory Structure

```
images/models/
├── thumbs/           # Small thumbnails (64×40px) for bank list and selectors
│   ├── yamaha-dx7.svg
│   ├── yamaha-dx7ii.svg
│   ├── behringer-pro800.svg
│   ├── behringer-deepmind12.svg
│   ├── casio-cz101.svg
│   ├── roland-juno106.svg
│   ├── korg-ms2000.svg
│   └── ...
└── README.md         # This file
```

## Image Specifications

### Thumbnails (`thumbs/`)

| Property | Value |
|----------|-------|
| Size | 64×40 pixels (aspect ratio 8:5) |
| Format | SVG (preferred) or WebP with transparency |
| Naming | `{manufacturer}-{model}.svg` (lowercase, hyphens) |
| Background | Transparent or dark (#1a1a1a - #2a2a2a) |
| Style | Minimalist line/icon style, brand colors |

### Brand Colors

| Manufacturer | Primary Color | Hex |
|--------------|---------------|-----|
| Yamaha | Red | #e94560 |
| Behringer | Cyan/Orange | #00d4ff / #ff6b35 |
| Roland | Red | #ff4444 |
| Korg | Green | #00ff88 |
| Casio | Dark Gray | #333333 |

## Adding New Models

1. Create an SVG in `thumbs/` following the naming convention
2. Add the `thumbnail` field to the model's `ModelContract` in `Source/Contracts/Models/`
3. The image will automatically appear in the bank list and model selectors

## Usage in Code

```javascript
import { getModelThumbnail } from './core/modelRegistry.js';

const thumbUrl = getModelThumbnail('yamaha-dx7');
// Returns: '/images/models/thumbs/yamaha-dx7.svg'
```
