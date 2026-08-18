import { ParticleSystem } from "./particles.js";

let duelParticleSystems = [];
let activeDustCanvas = null;
let activeEmbersCanvas = null;

export function initDuelAtmosphere({ mode, motionLevel }) {
  const dustCanvas = document.getElementById("duel-particles-dust");
  const embersCanvas = document.getElementById("duel-particles-embers");
  const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  if (mode !== "duel" || motionLevel !== "full" || systemReducedMotion || !dustCanvas) {
    if (duelParticleSystems.length) {
      duelParticleSystems.forEach((system) => system.destroy());
      duelParticleSystems = [];
      activeDustCanvas = null;
      activeEmbersCanvas = null;
    }
    return;
  }

  // If the particle systems are already running on the exact same DOM canvas elements, don't recreate
  if (duelParticleSystems.length > 0 && activeDustCanvas === dustCanvas && activeEmbersCanvas === embersCanvas) {
    return;
  }

  duelParticleSystems.forEach((system) => system.destroy());
  duelParticleSystems = [];
  activeDustCanvas = dustCanvas;
  activeEmbersCanvas = embersCanvas;

  const compact = window.innerWidth < 768;
  const layers = [
    {
      canvas: dustCanvas,
      options: {
        type: "gold",
        density: compact ? 10 : 20,
        direction: "up",
        minSize: 0.45,
        maxSize: 1.5,
        minSpeed: 0.025,
        maxSpeed: 0.12,
      },
    },
    {
      canvas: embersCanvas,
      options: {
        type: "fire",
        density: compact ? 5 : 10,
        direction: "up",
        minSize: 0.55,
        maxSize: 1.6,
        minSpeed: 0.05,
        maxSpeed: 0.20,
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
