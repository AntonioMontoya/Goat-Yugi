/**
 * Reconciliación DOM ultrarrápida (Zero-Dependency DOM Morphing).
 * Preserva los elementos DOM existentes (en especial <img> y <canvas>) para eliminar
 * el parpadeo de recarga de imágenes en WebKit / Safari al actualizar fases, notificaciones o eventos.
 */
export function morphDom(targetNode, newHtmlString) {
  if (!targetNode) return;
  const trimmed = String(newHtmlString ?? "").trim();
  if (!trimmed) {
    targetNode.innerHTML = "";
    return;
  }

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const newRoot = template.content.firstElementChild;
  if (!newRoot) return;

  const oldRoot = targetNode.firstElementChild;
  if (!oldRoot || oldRoot.tagName !== newRoot.tagName) {
    targetNode.innerHTML = trimmed;
    return;
  }

  morph(oldRoot, newRoot);
}

function morph(oldNode, newNode) {
  if (oldNode.nodeType !== newNode.nodeType || oldNode.nodeName !== newNode.nodeName) {
    oldNode.parentNode?.replaceChild(newNode.cloneNode(true), oldNode);
    return;
  }

  if (oldNode.nodeType === Node.TEXT_NODE || oldNode.nodeType === Node.COMMENT_NODE) {
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue;
    }
    return;
  }

  if (oldNode.nodeType === Node.ELEMENT_NODE) {
    // Preservar lienzos canvas y no reiniciar contextos de partículas
    if (oldNode.tagName === "CANVAS" && oldNode.id === newNode.id) {
      return;
    }

    // Sincronizar atributos
    const oldAttrs = oldNode.attributes;
    const newAttrs = newNode.attributes;

    // Eliminar atributos que ya no existen
    for (let i = oldAttrs.length - 1; i >= 0; i--) {
      const name = oldAttrs[i].name;
      if (!newNode.hasAttribute(name)) {
        oldNode.removeAttribute(name);
      }
    }

    // Establecer o actualizar nuevos atributos
    for (let i = 0; i < newAttrs.length; i++) {
      const name = newAttrs[i].name;
      const value = newAttrs[i].value;
      if (oldNode.getAttribute(name) !== value) {
        oldNode.setAttribute(name, value);
      }
    }

    // Para imágenes, si la fuente (src) es la misma, no tocar el elemento para evitar que WebKit parpadee
    if (oldNode.tagName === "IMG") {
      return;
    }

    // Preservar valores en formularios activos
    if (oldNode.tagName === "INPUT" || oldNode.tagName === "TEXTAREA") {
      if (document.activeElement !== oldNode && oldNode.value !== newNode.value) {
        oldNode.value = newNode.value;
      }
      if (oldNode.checked !== newNode.checked) {
        oldNode.checked = newNode.checked;
      }
      return;
    }

    if (oldNode.tagName === "SELECT") {
      if (oldNode.value !== newNode.value) {
        oldNode.value = newNode.value;
      }
    }

    // Reconciliar nodos hijos
    const oldChildren = Array.from(oldNode.childNodes);
    const newChildren = Array.from(newNode.childNodes);

    const oldLen = oldChildren.length;
    const newLen = newChildren.length;
    const maxLen = Math.max(oldLen, newLen);

    for (let i = 0; i < maxLen; i++) {
      const oldChild = oldChildren[i];
      const newChild = newChildren[i];

      if (!oldChild && newChild) {
        oldNode.appendChild(newChild.cloneNode(true));
      } else if (oldChild && !newChild) {
        oldNode.removeChild(oldChild);
      } else if (oldChild && newChild) {
        morph(oldChild, newChild);
      }
    }
  }
}
