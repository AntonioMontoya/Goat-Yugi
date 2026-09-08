import { ParticleSystem } from "./particles.js";

let currentSubmenuMode = null;
let submenuParticles = null;

export function initSubmenuAtmosphere({ mode, motionLevel }) {
  if (["home", "duel"].includes(mode) || motionLevel === "off") {
    if (submenuParticles) {
      submenuParticles.destroy();
      submenuParticles = null;
      currentSubmenuMode = null;
    }
    return;
  }
  const canvas = document.getElementById("submenu-particles");
  if (!canvas) {
    if (submenuParticles) {
      submenuParticles.destroy();
      submenuParticles = null;
      currentSubmenuMode = null;
    }
    return;
  }

  if (submenuParticles && canvas.isConnected && currentSubmenuMode === mode) {
    return;
  }

  submenuParticles?.destroy();
  submenuParticles = null;
  currentSubmenuMode = mode;
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
