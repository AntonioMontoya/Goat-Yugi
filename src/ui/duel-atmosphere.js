import { ParticleSystem } from "./particles.js";

let duelParticleSystems = [];

export function initDuelAtmosphere({ mode, motionLevel }) {
  duelParticleSystems.forEach((system) => system.destroy());
  duelParticleSystems = [];

  const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  if (mode !== "duel" || motionLevel !== "full" || systemReducedMotion) return;

  const compact = window.innerWidth < 720;
  const layers = [
    {
      canvas: document.getElementById("duel-particles-dust"),
      options: {
        type: "gold",
        density: compact ? 14 : 34,
        direction: "up",
        minSize: .45,
        maxSize: 1.7,
        minSpeed: .025,
        maxSpeed: .16,
      },
    },
    {
      canvas: document.getElementById("duel-particles-embers"),
      options: {
        type: "fire",
        density: compact ? 7 : 18,
        direction: "up",
        minSize: .55,
        maxSize: 1.9,
        minSpeed: .06,
        maxSpeed: .28,
      },
    },
  ];

  duelParticleSystems = layers
    .filter(({ canvas }) => canvas)
    .map(({ canvas, options }) => {
      const system = new ParticleSystem(canvas, options);
      system.init();
      return system;
    });
}
