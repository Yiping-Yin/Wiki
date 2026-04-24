import SalonClient from '../SalonClient';

// M13 — Salon. A room for reading together.
//
// Until shared salon/session objects are mirrored here, this route
// deliberately renders an honest gated state instead of fabricated
// participants or consensus.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-salon.jsx → SalonSurface

export const metadata = { title: 'Salon · Loom' };

export default function SalonPage() {
  return <SalonClient />;
}
