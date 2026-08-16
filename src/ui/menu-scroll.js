let disposeMenuScroll = null;

const FORM_CONTROL = "input, select, textarea, button, summary, [contenteditable='true']";

export function installMenuScrollNavigation(root, mode, { navigate } = {}) {
  disposeMenuScroll?.();
  disposeMenuScroll = null;
  if (["home", "duel"].includes(mode)) return;
  const shell = root.querySelector(".app-shell");
  if (!shell) return;
  shell.classList.add("menu-scroll-enabled");
  const dock = document.createElement("nav");
  dock.className = "menu-scroll-dock";
  dock.setAttribute("aria-label", "Desplazamiento del menú");
  dock.innerHTML = '<button type="button" data-menu-scroll="up" aria-label="Subir por el menú">▲</button><span><b>MENÚ</b><small data-menu-scroll-progress>1 / 1</small></span><button type="button" data-menu-scroll="down" aria-label="Bajar por el menú">▼</button>';
  shell.append(dock);

  const pageStep = () => Math.max(280, Math.round(window.innerHeight * .76));
  const jump = (direction) => window.scrollBy({ top: direction * pageStep(), behavior: "smooth" });
  const buttons = [...dock.querySelectorAll("button")];
  const progress = dock.querySelector("[data-menu-scroll-progress]");
  const sync = () => {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const pages = max < 8 ? 1 : Math.max(2, Math.ceil(max / pageStep()) + 1);
    const current = max < 8 ? 1 : Math.min(pages, Math.round((window.scrollY / max) * (pages - 1)) + 1);
    if (progress) progress.textContent = `${current} / ${pages}`;
    buttons[0].disabled = window.scrollY < 4;
    buttons[1].disabled = max - window.scrollY < 4;
    dock.classList.toggle("is-static", max < 8);
  };
  const onClick = (event) => jump(event.currentTarget.dataset.menuScroll === "up" ? -1 : 1);
  buttons.forEach((button) => button.addEventListener("click", onClick));
  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.target?.closest?.(FORM_CONTROL)) return;
    if (["ArrowLeft", "ArrowRight"].includes(event.key) && typeof navigate === "function") {
      const selector = event.key === "ArrowLeft" ? ".section-arrow:first-child" : ".section-arrow:last-child";
      const targetMode = root.querySelector(selector)?.dataset.mode;
      if (targetMode) {
        event.preventDefault();
        navigate(targetMode);
      }
      return;
    }
    const direction = ["ArrowDown", "PageDown"].includes(event.key) ? 1 : ["ArrowUp", "PageUp"].includes(event.key) ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    jump(direction);
  };
  const switcher = root.querySelector(".section-switcher");
  let pointerStart = null;
  let wheelLocked = false;
  const moveSection = (direction) => {
    if (typeof navigate !== "function") return;
    const selector = direction < 0 ? ".section-arrow:first-child" : ".section-arrow:last-child";
    const targetMode = root.querySelector(selector)?.dataset.mode;
    if (targetMode) navigate(targetMode);
  };
  const onPointerDown = (event) => { pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; };
  const onPointerUp = (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) >= 54 && Math.abs(dx) > Math.abs(dy) * 1.25) moveSection(dx > 0 ? -1 : 1);
  };
  const onWheel = (event) => {
    if (wheelLocked || Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) < 18) return;
    event.preventDefault();
    wheelLocked = true;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    moveSection(delta > 0 ? 1 : -1);
    window.setTimeout(() => { wheelLocked = false; }, 420);
  };
  switcher?.addEventListener("pointerdown", onPointerDown);
  switcher?.addEventListener("pointerup", onPointerUp);
  switcher?.addEventListener("pointercancel", () => { pointerStart = null; });
  switcher?.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("scroll", sync, { passive: true });
  document.addEventListener("keydown", onKeyDown);
  requestAnimationFrame(sync);
  disposeMenuScroll = () => {
    window.removeEventListener("scroll", sync);
    document.removeEventListener("keydown", onKeyDown);
    switcher?.removeEventListener("pointerdown", onPointerDown);
    switcher?.removeEventListener("pointerup", onPointerUp);
    switcher?.removeEventListener("wheel", onWheel);
    buttons.forEach((button) => button.removeEventListener("click", onClick));
  };
}
