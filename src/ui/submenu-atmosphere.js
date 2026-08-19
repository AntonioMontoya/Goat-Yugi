import { ParticleSystem } from "./particles.js";

let submenuParticles = null;
let currentSubmenuMode = null;
let currentMotionLevel = null;

export function initSubmenuAtmosphere({ mode, motionLevel }) {
  const isSubmenu = !["home", "duel"].includes(mode) && motionLevel !== "off";

  if (!isSubmenu) {
    submenuParticles?.destroy();
    submenuParticles = null;
    currentSubmenuMode = mode;
    currentMotionLevel = motionLevel;
    return;
  }

  const canvas = document.getElementById("submenu-particles");
  if (!canvas) return;

  if (currentSubmenuMode === mode && currentMotionLevel === motionLevel && submenuParticles) {
    return;
  }

  submenuParticles?.destroy();
  submenuParticles = null;
  currentSubmenuMode = mode;
  currentMotionLevel = motionLevel;

  const mystical = ["sandbox", "training", "research"].includes(mode);
  const battle = ["play", "ladder", "bots"].includes(mode);
  submenuParticles = new ParticleSystem(canvas, {
    type: mystical ? "cyan" : battle ? "gold" : "gold",
    density: window.innerWidth < 720 ? 24 : 42,
    direction: "up",
    minSize: .5,
    maxSize: mystical ? 1.8 : 1.5,
    minSpeed: .06,
    maxSpeed: mystical ? .25 : .22,
  });
  submenuParticles.init();
}
