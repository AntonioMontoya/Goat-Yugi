import { ParticleSystem } from "./particles.js";

let duelParticleSystems = [];
let currentDuelMode = null;
let currentMotionLevel = null;

export function initDuelAtmosphere({ mode, motionLevel }) {
  const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const isDuelActive = mode === "duel" && motionLevel === "full" && !systemReducedMotion;

  if (!isDuelActive) {
    if (duelParticleSystems.length > 0) {
      duelParticleSystems.forEach((system) => system.destroy());
      duelParticleSystems = [];
    }
    currentDuelMode = mode;
    currentMotionLevel = motionLevel;
    return;
  }

  const dustCanvas = document.getElementById("duel-particles-dust");
  const embersCanvas = document.getElementById("duel-particles-embers");
  if (
    currentDuelMode === mode &&
    currentMotionLevel === motionLevel &&
    duelParticleSystems.length === 2 &&
    dustCanvas &&
    embersCanvas
  ) {
    return;
  }

  duelParticleSystems.forEach((system) => system.destroy());
  duelParticleSystems = [];
  currentDuelMode = mode;
  currentMotionLevel = motionLevel;

  const compact = window.innerWidth < 720;
  const layers = [
    {
      canvas: dustCanvas,
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
      canvas: embersCanvas,
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
