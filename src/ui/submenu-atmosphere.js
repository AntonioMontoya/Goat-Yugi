import { ParticleSystem } from "./particles.js";

let submenuParticles = null;
let activeSubmenuCanvas = null;
let activeSubmenuMode = null;

export function initSubmenuAtmosphere({ mode, motionLevel }) {
  const canvas = document.getElementById("submenu-particles");
  const systemReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

  if (["home", "duel"].includes(mode) || motionLevel === "off" || systemReducedMotion || !canvas) {
    if (submenuParticles) {
      submenuParticles.destroy();
      submenuParticles = null;
      activeSubmenuCanvas = null;
      activeSubmenuMode = null;
    }
    return;
  }

  if (submenuParticles && activeSubmenuCanvas === canvas && activeSubmenuMode === mode) {
    return;
  }

  submenuParticles?.destroy();
  submenuParticles = null;
  activeSubmenuCanvas = canvas;
  activeSubmenuMode = mode;

  const mystical = ["sandbox", "training", "research"].includes(mode);
  const battle = ["play", "ladder", "bots"].includes(mode);
  submenuParticles = new ParticleSystem(canvas, {
    type: mystical ? "cyan" : battle ? "gold" : "gold",
    density: window.innerWidth < 768 ? 14 : 24,
    direction: "up",
    minSize: 0.5,
    maxSize: mystical ? 1.6 : 1.4,
    minSpeed: 0.05,
    maxSpeed: mystical ? 0.20 : 0.16,
  });
  submenuParticles.init();
}
