/**
 * Reconciliación DOM ultrarrápida con soporte para claves (Keyed DOM Morphing).
 * Preserva de forma persistente los elementos DOM existentes (en especial <img>, <canvas>, <input>, <select>)
 * para eliminar por completo el parpadeo de recarga de imágenes en WebKit / Safari al actualizar fases, notificaciones o eventos.
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

function getNodeKey(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
  return (
    node.getAttribute("data-card-inspect") ||
    node.getAttribute("data-action-id") ||
    node.getAttribute("data-testid") ||
    node.getAttribute("id") ||
    null
  );
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
    if (oldNode.tagName === "CANVAS") {
      return;
    }

    // Sincronizar atributos
    const oldAttrs = oldNode.attributes;
    const newAttrs = newNode.attributes;

    // Eliminar atributos que ya no existen en el nuevo nodo
    for (let i = oldAttrs.length - 1; i >= 0; i--) {
      const name = oldAttrs[i].name;
      if (!newNode.hasAttribute(name)) {
        oldNode.removeAttribute(name);
      }
    }

    // Establecer o actualizar nuevos atributos sin reasignar 'src' idéntico en imágenes (evita reload en WebKit)
    for (let i = 0; i < newAttrs.length; i++) {
      const name = newAttrs[i].name;
      const value = newAttrs[i].value;
      if (name === "src" && oldNode.getAttribute("src") === value) {
        continue;
      }
      if (oldNode.getAttribute(name) !== value) {
        oldNode.setAttribute(name, value);
      }
    }

    // Para imágenes con la misma fuente, terminar aquí (no tocar hijos ni recargar)
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

    // Reconciliación de nodos hijos con búsqueda por clave
    const oldChildren = Array.from(oldNode.childNodes);
    const newChildren = Array.from(newNode.childNodes);

    const oldKeyed = new Map();
    const oldUnkeyed = [];

    for (let i = 0; i < oldChildren.length; i++) {
      const child = oldChildren[i];
      const key = getNodeKey(child);
      if (key) {
        oldKeyed.set(key, child);
      } else {
        oldUnkeyed.push(child);
      }
    }

    let unkeyedIdx = 0;

    for (let i = 0; i < newChildren.length; i++) {
      const newChild = newChildren[i];
      const key = getNodeKey(newChild);

      let matchingOldChild = null;
      if (key && oldKeyed.has(key)) {
        matchingOldChild = oldKeyed.get(key);
        oldKeyed.delete(key);
      } else if (!key && unkeyedIdx < oldUnkeyed.length) {
        // Encontrar siguiente hijo no clave compatible
        while (unkeyedIdx < oldUnkeyed.length) {
          const candidate = oldUnkeyed[unkeyedIdx++];
          if (candidate.nodeName === newChild.nodeName) {
            matchingOldChild = candidate;
            break;
          }
        }
      }

      if (matchingOldChild) {
        // Reordenar si la posición no coincide
        if (oldNode.childNodes[i] !== matchingOldChild) {
          oldNode.insertBefore(matchingOldChild, oldNode.childNodes[i] || null);
        }
        morph(matchingOldChild, newChild);
      } else {
        // Nuevo nodo no existente antes
        const cloned = newChild.cloneNode(true);
        oldNode.insertBefore(cloned, oldNode.childNodes[i] || null);
      }
    }

    // Eliminar nodos viejos que sobran
    while (oldNode.childNodes.length > newChildren.length) {
      oldNode.removeChild(oldNode.lastChild);
    }
  }
}
